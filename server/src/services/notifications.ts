import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { modelRoutes, userNotifications } from "../db/schema.js";
import { id, parseJsonArray, toJsonArray } from "../utils/crypto.js";

export type UserNotificationType = "models" | "pricing";

const MERGE_WINDOW_MS = 2 * 60_000;

export function formatNotificationBody(
  type: UserNotificationType,
  models: string[],
): string {
  const names = uniqueNames(models);
  const n = names.length;
  const preview = names.slice(0, 2).join("、");
  if (type === "pricing") {
    if (n <= 1) return `${preview || "部分模型"} 的价格有变动，快去看看吧！`;
    return `${preview} 等 ${n} 个模型价格有变动，快去看看吧！`;
  }
  if (n <= 1) return `${preview || "新模型"} 新同步到模型列表，快去看看吧！`;
  return `${preview} 等 ${n} 个模型新同步到模型列表，快去看看吧！`;
}

function uniqueNames(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of models) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function stamp(value: Date | number | null | undefined): number {
  if (value == null) return 0;
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

export async function filterPublishedModelNames(candidates: string[]): Promise<string[]> {
  const wanted = new Set(uniqueNames(candidates));
  if (!wanted.size) return [];
  const routes = await db
    .select({ model: modelRoutes.model })
    .from(modelRoutes)
    .where(eq(modelRoutes.published, true));
  return routes.map((r) => r.model).filter((name) => wanted.has(name));
}

async function recordNotification(type: UserNotificationType, models: string[]) {
  const names = uniqueNames(models);
  if (!names.length) return;

  const [recent] = await db
    .select()
    .from(userNotifications)
    .where(eq(userNotifications.type, type))
    .orderBy(desc(userNotifications.updatedAt))
    .limit(1);

  const now = Date.now();
  if (recent && now - stamp(recent.updatedAt) < MERGE_WINDOW_MS) {
    const merged = uniqueNames([...parseJsonArray(recent.models), ...names]);
    await db
      .update(userNotifications)
      .set({
        models: toJsonArray(merged),
        body: formatNotificationBody(type, merged),
        updatedAt: new Date(),
      })
      .where(eq(userNotifications.id, recent.id));
    return;
  }

  await db.insert(userNotifications).values({
    id: id("ntf"),
    type,
    models: toJsonArray(names),
    body: formatNotificationBody(type, names),
  });
}

export async function notifyModelsPublished(models: string[]) {
  await recordNotification("models", uniqueNames(models));
}

export async function notifyPricesChanged(models: string[]) {
  const published = await filterPublishedModelNames(models);
  await recordNotification("pricing", published);
}
