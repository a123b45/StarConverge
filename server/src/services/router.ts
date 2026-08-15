import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { channels, modelRoutes, type Channel, type ModelRoute } from "../db/schema.js";
import { parseJsonArray } from "../utils/crypto.js";

export type ResolvedRoute = {
  model: string;
  /** Model name sent to upstream provider */
  upstreamModel: string;
  candidates: Channel[];
  /** True when token.routeIds forced resolution onto a bound route */
  bound?: boolean;
};

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
  opts?: { boundRouteIds?: string[] },
): Promise<ResolvedRoute | null> {
  const boundIds = (opts?.boundRouteIds ?? []).filter(Boolean);
  const boundRoute = await loadBoundRoute(boundIds, model);

  const route =
    boundRoute ??
    (await db.query.modelRoutes.findFirst({
      where: and(eq(modelRoutes.model, model), eq(modelRoutes.enabled, true)),
    }));

  // Bound route: upstream uses that route's rewrite/model even if client asked another name.
  const upstreamModel = boundRoute
    ? boundRoute.rewriteModel || boundRoute.model
    : route?.rewriteModel || model;

  let candidates: Channel[] = [];

  if (route) {
    const ids = parseJsonArray(route.channelIds);
    if (ids.length > 0) {
      const all = await db
        .select()
        .from(channels)
        .where(eq(channels.enabled, true));
      const map = new Map(all.map((c) => [c.id, c]));
      candidates = ids.map((i) => map.get(i)).filter(Boolean) as Channel[];
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
  }

  if (candidates.length === 0) return null;

  candidates = weightedOrder(candidates);

  return {
    model,
    upstreamModel,
    candidates,
    bound: Boolean(boundRoute),
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
