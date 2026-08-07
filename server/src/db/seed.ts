import { migrate } from "./push.js";
import { db } from "./index.js";
import { channels, tokens, modelRoutes } from "./schema.js";
import { generateApiKey, id, toJsonArray } from "../utils/crypto.js";
import { eq } from "drizzle-orm";

async function seed() {
  migrate();

  const existing = await db.select().from(channels).limit(1);
  if (existing.length > 0) {
    console.log("Database already seeded, skip.");
    return;
  }

  const channelId = id("ch");
  await db.insert(channels).values({
    id: channelId,
    name: "Demo OpenAI Compatible",
    type: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-replace-me",
    models: toJsonArray(["gpt-4o-mini", "gpt-4o", "*"]),
    weight: 1,
    priority: 10,
    enabled: false,
    timeoutMs: 120_000,
    remark: "示例通道（默认禁用）。填入真实 API Key 后启用。",
  });

  await db.insert(modelRoutes).values({
    id: id("mr"),
    model: "gpt-4o-mini",
    channelIds: toJsonArray([channelId]),
    rewriteModel: null,
    enabled: true,
  });

  const key = generateApiKey();
  await db.insert(tokens).values({
    id: id("tk"),
    name: "Default Token",
    keyHash: key.hash,
    keyPrefix: key.prefix,
    keyPlain: key.key,
    quota: -1,
    usedQuota: 0,
    rateLimit: 60,
    enabled: true,
    allowedModels: toJsonArray([]),
    expiresAt: null,
    remark: "首次启动自动创建，请妥善保存",
  });

  // ensure uniqueness check path works
  await db.query.tokens.findFirst({ where: eq(tokens.keyPrefix, key.prefix) });

  console.log("Seed complete.");
  console.log("----------------------------------------");
  console.log("Demo API Key (save it now):");
  console.log(key.key);
  console.log("----------------------------------------");
  console.log("Admin: see ADMIN_USERNAME / ADMIN_PASSWORD in .env");
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
