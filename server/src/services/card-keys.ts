import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { cardKeys, users } from "../db/schema.js";
import { generateCardCode, id, normalizeCardCode } from "../utils/crypto.js";

export function usdFromCents(cents: number) {
  return Math.round(cents) / 100;
}

export function centsFromUsd(usd: number) {
  return Math.round(usd * 100);
}

export async function creditUserBalance(userId: string, amountCents: number) {
  if (amountCents <= 0) throw new Error("充值金额必须大于 0");
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || !user.enabled) {
    const err = new Error("账户不可用");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  const now = new Date();
  await db
    .update(users)
    .set({
      balanceCents: (user.balanceCents ?? 0) + amountCents,
      totalRechargedCents: (user.totalRechargedCents ?? 0) + amountCents,
      lastRechargedAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId));
  return {
    amount: usdFromCents(amountCents),
    balance: usdFromCents((user.balanceCents ?? 0) + amountCents),
    totalRecharged: usdFromCents((user.totalRechargedCents ?? 0) + amountCents),
  };
}

export function cardStatus(
  row: { redeemedAt: Date | null; expiresAt: Date | null },
  now = Date.now(),
): "unused" | "used" | "expired" {
  if (row.redeemedAt) return "used";
  if (row.expiresAt && row.expiresAt.getTime() < now) return "expired";
  return "unused";
}

export async function createCardKeys(opts: {
  amountUsd: number;
  validDays: number;
  userId?: string | null;
  createdBy?: string | null;
  remark?: string;
  count?: number;
}) {
  const amountCents = centsFromUsd(opts.amountUsd);
  if (amountCents <= 0) throw new Error("激活余额必须大于 0");
  const count = Math.min(20, Math.max(1, Math.floor(opts.count ?? 1)));
  const expiresAt =
    opts.validDays > 0
      ? new Date(Date.now() + opts.validDays * 24 * 60 * 60 * 1000)
      : null;
  const created: Array<typeof cardKeys.$inferSelect> = [];
  for (let i = 0; i < count; i++) {
    let code = generateCardCode();
    for (let n = 0; n < 6; n++) {
      const [hit] = await db
        .select({ id: cardKeys.id })
        .from(cardKeys)
        .where(eq(cardKeys.code, code))
        .limit(1);
      if (!hit) break;
      code = generateCardCode();
    }
    const row = {
      id: id("ck"),
      code,
      amountCents,
      expiresAt,
      userId: opts.userId || null,
      redeemedAt: null,
      redeemedBy: null,
      createdBy: opts.createdBy ?? null,
      remark: opts.remark ?? "",
    };
    await db.insert(cardKeys).values(row);
    created.push({ ...row, createdAt: new Date() });
  }
  return created;
}

export async function redeemCardKey(codeRaw: string, userId: string) {
  const code = normalizeCardCode(codeRaw);
  if (!code) {
    const err = new Error("请输入卡密");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const fail = (message: string, status = 400) => {
    const err = new Error(message);
    (err as Error & { status: number }).status = status;
    throw err;
  };

  const [card] = await db
    .select()
    .from(cardKeys)
    .where(eq(cardKeys.code, code))
    .limit(1);
  if (!card) fail("卡密不存在");
  if (card.redeemedAt) fail("该卡密已被使用");
  if (card.expiresAt && card.expiresAt.getTime() < Date.now()) {
    fail("该卡密已过期");
  }
  if (card.userId && card.userId !== userId) {
    fail("该卡密已限定其他用户，无法兑换");
  }
  const [user] = await db
    .select({ id: users.id, enabled: users.enabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || !user.enabled) fail("账户不可用", 403);
  const now = new Date();
  await db
    .update(cardKeys)
    .set({ redeemedAt: now, redeemedBy: userId })
    .where(eq(cardKeys.id, card.id));
  return creditUserBalance(userId, card.amountCents);
}
