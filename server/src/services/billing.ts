import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { modelPrices, tokens, users, type Token } from "../db/schema.js";
import { getRoleById, roleAllowsAdmin } from "./roles.js";

const INSUFFICIENT_MESSAGE = "余额不足，请先充值后再对话";

export function insufficientBalanceError() {
  return {
    error: {
      message: INSUFFICIENT_MESSAGE,
      type: "insufficient_quota",
      code: "insufficient_balance",
    },
  };
}

async function isPortalCustomer(user: typeof users.$inferSelect) {
  const role = await getRoleById(user.roleId);
  if (roleAllowsAdmin(role)) return false;
  if (!user.roleId && user.role === "admin") return false;
  return true;
}

/** Portal customer keys must have a positive USD balance before a paid call. */
export async function assertPortalBalance(token: Token) {
  if (!token.userId) return { ok: true as const };
  const user = await db.query.users.findFirst({
    where: eq(users.id, token.userId),
  });
  if (!user || !user.enabled) {
    return {
      ok: false as const,
      status: 403 as const,
      body: {
        error: {
          message: "Account disabled",
          type: "auth_error",
        },
      },
    };
  }
  if (!(await isPortalCustomer(user))) return { ok: true as const };
  if ((user.balanceCents ?? 0) <= 0) {
    return {
      ok: false as const,
      status: 402 as const,
      body: insufficientBalanceError(),
    };
  }
  return { ok: true as const };
}

function priceMatchesModel(
  row: typeof modelPrices.$inferSelect,
  modelName: string,
) {
  const name = modelName.trim();
  if (!name) return false;
  return (
    row.externalModel === name ||
    row.globalModel === name ||
    (row.providerModel || "") === name
  );
}

function pickPrice(
  rows: (typeof modelPrices.$inferSelect)[],
  modelName: string,
  channelId?: string | null,
) {
  const enabled = rows.filter((p) => p.enabled);
  if (channelId) {
    const hit = enabled.find(
      (p) => p.channelId === channelId && priceMatchesModel(p, modelName),
    );
    if (hit) return hit;
  }
  return (
    enabled.find((p) => !p.channelId && priceMatchesModel(p, modelName)) ||
    enabled.find((p) => priceMatchesModel(p, modelName)) ||
    null
  );
}

/** milli-USD (1/1000 USD) from token usage and model sell price. */
export function usageCostMilli(opts: {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputPer1mMilli: number;
  outputPer1mMilli: number;
}) {
  let pt = Math.max(0, opts.promptTokens);
  let ct = Math.max(0, opts.completionTokens);
  if (pt === 0 && ct === 0 && opts.totalTokens > 0) {
    pt = opts.totalTokens;
  }
  return (pt / 1_000_000) * opts.inputPer1mMilli + (ct / 1_000_000) * opts.outputPer1mMilli;
}

function milliToCents(milli: number) {
  if (milli <= 0) return 0;
  return Math.max(1, Math.ceil(milli / 10));
}

/** Debit a portal customer's USD balance after a successful billed call. */
export async function debitPortalUsage(opts: {
  tokenId?: string | null;
  channelId?: string | null;
  model?: string | null;
  statusCode?: number | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}) {
  const code = opts.statusCode ?? 0;
  if (!opts.tokenId || code < 200 || code >= 400) return;
  const token = await db.query.tokens.findFirst({
    where: eq(tokens.id, opts.tokenId),
  });
  if (!token?.userId) return;
  const user = await db.query.users.findFirst({
    where: eq(users.id, token.userId),
  });
  if (!user || !(await isPortalCustomer(user))) return;

  const promptTokens = opts.promptTokens ?? 0;
  const completionTokens = opts.completionTokens ?? 0;
  const totalTokens = opts.totalTokens ?? promptTokens + completionTokens;
  if (promptTokens + completionTokens + totalTokens <= 0) return;

  const modelName = (opts.model || "").trim();
  const priceRows = await db.select().from(modelPrices);
  const price = modelName
    ? pickPrice(priceRows, modelName, opts.channelId)
    : null;
  const costMilli = price
    ? usageCostMilli({
        promptTokens,
        completionTokens,
        totalTokens,
        inputPer1mMilli: price.inputPer1mCents ?? 0,
        outputPer1mMilli: price.outputPer1mCents ?? 0,
      })
    : 0;
  const cents = milliToCents(costMilli) || (totalTokens > 0 ? 1 : 0);
  if (cents <= 0) return;

  await db
    .update(users)
    .set({
      balanceCents: sql`max(0, ${users.balanceCents} - ${cents})`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
}
