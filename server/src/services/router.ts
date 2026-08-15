import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { channels, modelRoutes, type Channel, type ModelRoute } from "../db/schema.js";
import { parseJsonArray } from "../utils/crypto.js";

export type RouteStrategy = "full" | "random" | "ratio" | "smart";

export type RouteTarget = {
  channelId: string;
  upstreamModel: string;
  /** Relative weight for ratio strategy (default 1) */
  weight?: number;
};

/** Character (字) threshold for smart routing — counts user message text, not raw JSON body. */
export const SMART_ROUTE_CHAR_THRESHOLD = 50;

/** @deprecated use SMART_ROUTE_CHAR_THRESHOLD */
export const SMART_ROUTE_BYTE_THRESHOLD = SMART_ROUTE_CHAR_THRESHOLD;

export type ResolvedRoute = {
  model: string;
  /** Model name sent to upstream provider */
  upstreamModel: string;
  candidates: Channel[];
  /** True when token.routeIds forced resolution onto a bound route */
  bound?: boolean;
  strategy?: RouteStrategy;
};

/** Pull user-visible prompt text from a chat/completions-style body. */
export function extractSmartRouteInputText(bodyText?: string): string {
  if (!bodyText) return "";
  try {
    const obj = JSON.parse(bodyText) as Record<string, unknown>;
    const parts: string[] = [];

    const pushContent = (content: unknown) => {
      if (typeof content === "string") {
        parts.push(content);
        return;
      }
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          const b = block as Record<string, unknown>;
          if (typeof b.text === "string") parts.push(b.text);
          else if (typeof b.content === "string") parts.push(b.content);
        }
      }
    };

    if (Array.isArray(obj.messages)) {
      for (const m of obj.messages) {
        if (!m || typeof m !== "object") continue;
        const msg = m as Record<string, unknown>;
        const role = String(msg.role ?? "");
        if (role && role !== "user") continue;
        pushContent(msg.content);
      }
    } else if (typeof obj.prompt === "string") {
      parts.push(obj.prompt);
    } else if (typeof obj.input === "string") {
      parts.push(obj.input);
    }

    const joined = parts.join("\n").trim();
    if (joined) return joined;
  } catch {
    /* fall through */
  }
  return bodyText.trim();
}

export function smartRouteInputLength(bodyText?: string): number {
  // Unicode code points ≈ 字数 for CJK / Latin prompts
  return [...extractSmartRouteInputText(bodyText)].length;
}

export function parseRouteTargets(route: ModelRoute): RouteTarget[] {
  try {
    const raw = JSON.parse(route.targets || "[]") as unknown;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw
        .map((t) => {
          if (!t || typeof t !== "object") return null;
          const o = t as Record<string, unknown>;
          const channelId = String(o.channelId ?? "").trim();
          const upstreamModel = String(o.upstreamModel ?? "").trim();
          if (!channelId || !upstreamModel) return null;
          const w = Number(o.weight);
          return {
            channelId,
            upstreamModel,
            weight: Number.isFinite(w) && w > 0 ? w : 1,
          } satisfies RouteTarget;
        })
        .filter(Boolean) as RouteTarget[];
    }
  } catch {
    /* legacy */
  }
  const ids = parseJsonArray(route.channelIds);
  const upstream = (route.rewriteModel || route.model || "").trim();
  if (!ids.length || !upstream) return [];
  return ids.map((channelId) => ({
    channelId,
    upstreamModel: upstream,
    weight: 1,
  }));
}

export function normalizeRouteStrategy(raw: unknown): RouteStrategy {
  const s = String(raw ?? "full").toLowerCase();
  if (s === "random" || s === "ratio" || s === "smart" || s === "full") return s;
  return "full";
}

function pickByRatio(targets: RouteTarget[]): RouteTarget {
  const total = targets.reduce((s, t) => s + Math.max(0, t.weight ?? 1), 0);
  if (total <= 0) return targets[0]!;
  let r = Math.random() * total;
  for (const t of targets) {
    r -= Math.max(0, t.weight ?? 1);
    if (r <= 0) return t;
  }
  return targets[targets.length - 1]!;
}

/** Pick one target according to route strategy. */
export function pickRouteTarget(
  route: ModelRoute,
  bodyText?: string,
): RouteTarget | null {
  const targets = parseRouteTargets(route);
  if (!targets.length) return null;
  const strategy = normalizeRouteStrategy(route.strategy);

  if (strategy === "full") return targets[0]!;
  if (strategy === "random") {
    return targets[Math.floor(Math.random() * targets.length)]!;
  }
  if (strategy === "ratio") return pickByRatio(targets);
  // smart: ≤50 字 → simple model; >50 → complex model (user message text only)
  const chars = smartRouteInputLength(bodyText);
  const want =
    chars <= SMART_ROUTE_CHAR_THRESHOLD
      ? (route.smartSimpleModel || targets[0]!.upstreamModel).trim()
      : (
          route.smartComplexModel ||
          targets[targets.length - 1]!.upstreamModel
        ).trim();
  return (
    targets.find((t) => t.upstreamModel === want) ??
    targets.find((t) => `${t.channelId}::${t.upstreamModel}` === want) ??
    targets[0]!
  );
}

async function loadBoundRoute(
  boundRouteIds: string[],
  requestedModel: string,
): Promise<ModelRoute | null> {
  if (!boundRouteIds.length) return null;
  const rows = await db
    .select()
    .from(modelRoutes)
    .where(
      and(eq(modelRoutes.enabled, true), inArray(modelRoutes.id, boundRouteIds)),
    );
  if (!rows.length) return null;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = boundRouteIds
    .map((id) => byId.get(id))
    .filter(Boolean) as ModelRoute[];
  return (
    ordered.find((r) => r.model === requestedModel) ?? ordered[0] ?? null
  );
}

/**
 * Resolve model -> ordered channel list.
 * When `boundRouteIds` is set on a token, traffic is forced through that route's
 * channels / rewriteModel; the client-facing model name stays `model`.
 */
export async function resolveChannelsForModel(
  model: string,
  opts?: { boundRouteIds?: string[]; bodyText?: string },
): Promise<ResolvedRoute | null> {
  const boundIds = (opts?.boundRouteIds ?? []).filter(Boolean);
  const boundRoute = await loadBoundRoute(boundIds, model);

  const route =
    boundRoute ??
    (await db.query.modelRoutes.findFirst({
      where: and(eq(modelRoutes.model, model), eq(modelRoutes.enabled, true)),
    }));

  const strategy = route
    ? normalizeRouteStrategy(route.strategy)
    : ("full" as RouteStrategy);
  const picked = route ? pickRouteTarget(route, opts?.bodyText) : null;
  const allTargets = route ? parseRouteTargets(route) : [];

  const upstreamModel =
    picked?.upstreamModel ||
    (boundRoute
      ? boundRoute.rewriteModel || boundRoute.model
      : route?.rewriteModel || model);

  let candidates: Channel[] = [];

  if (route && (picked || allTargets.length)) {
    const all = await db
      .select()
      .from(channels)
      .where(eq(channels.enabled, true));
    const map = new Map(all.map((c) => [c.id, c]));

    const targetKey = (t: RouteTarget) => `${t.channelId}::${t.upstreamModel}`;
    const orderedTargets = picked
      ? [
          picked,
          ...allTargets.filter((t) => targetKey(t) !== targetKey(picked)),
        ]
      : allTargets;

    const seen = new Set<string>();
    for (const t of orderedTargets) {
      const ch = map.get(t.channelId);
      if (!ch || seen.has(ch.id)) continue;
      seen.add(ch.id);
      candidates.push(ch);
    }
  }

  if (candidates.length === 0) {
    const all = await db
      .select()
      .from(channels)
      .where(eq(channels.enabled, true))
      .orderBy(desc(channels.priority), desc(channels.weight));
    const matchNames = new Set(
      [upstreamModel, route?.model, model].filter(Boolean) as string[],
    );
    candidates = all.filter((c) => {
      const models = parseJsonArray(c.models);
      return (
        models.length === 0 ||
        models.includes("*") ||
        models.some((m) => matchNames.has(m))
      );
    });
    candidates = weightedOrder(candidates);
  }

  if (candidates.length === 0) return null;

  return {
    model,
    upstreamModel,
    candidates,
    bound: Boolean(boundRoute),
    strategy,
  };
}

function weightedOrder(list: Channel[]): Channel[] {
  const byPriority = new Map<number, Channel[]>();
  for (const c of list) {
    const arr = byPriority.get(c.priority) ?? [];
    arr.push(c);
    byPriority.set(c.priority, arr);
  }
  const priorities = [...byPriority.keys()].sort((a, b) => b - a);
  const result: Channel[] = [];
  for (const p of priorities) {
    const group = [...(byPriority.get(p) ?? [])];
    while (group.length) {
      const total = group.reduce((s, c) => s + Math.max(1, c.weight), 0);
      let r = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < group.length; i++) {
        r -= Math.max(1, group[i]!.weight);
        if (r <= 0) {
          idx = i;
          break;
        }
      }
      result.push(group.splice(idx, 1)[0]!);
    }
  }
  return result;
}

export function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  // OpenAI-compatible: base often ends with /v1
  if (b.endsWith("/v1") && p.startsWith("/v1/")) {
    return `${b}${p.slice(3)}`;
  }
  return `${b}${p}`;
}
