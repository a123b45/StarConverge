import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { channels, modelRoutes, type Channel } from "../db/schema.js";
import { parseJsonArray } from "../utils/crypto.js";

export type ResolvedRoute = {
  model: string;
  upstreamModel: string;
  candidates: Channel[];
};

/** Resolve model -> ordered channel list (route override, then channel model list, then priority/weight). */
export async function resolveChannelsForModel(
  model: string,
): Promise<ResolvedRoute | null> {
  const route = await db.query.modelRoutes.findFirst({
    where: and(eq(modelRoutes.model, model), eq(modelRoutes.enabled, true)),
  });

  const upstreamModel = route?.rewriteModel || model;
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
    candidates = all.filter((c) => {
      const models = parseJsonArray(c.models);
      return models.length === 0 || models.includes(model) || models.includes("*");
    });
  }

  if (candidates.length === 0) return null;

  // weighted shuffle among same priority
  candidates = weightedOrder(candidates);

  return { model, upstreamModel, candidates };
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
