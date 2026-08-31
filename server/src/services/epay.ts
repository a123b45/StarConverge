import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { rechargeOrders } from "../db/schema.js";
import { id, md5 } from "../utils/crypto.js";
import { centsFromUsd, creditUserBalance, usdFromCents } from "./card-keys.js";

export const EPAY_PRESETS_USD = [5, 10, 20, 50, 100];
const PAY_TYPES = new Set(["alipay", "wxpay", "qqpay"]);

export function epayConfigured(): boolean {
  return Boolean(config.epayApiUrl && config.epayPid && config.epayKey);
}

export function epayPublicConfig() {
  const rate = Number.isFinite(config.epayCnyPerUsd) && config.epayCnyPerUsd > 0
    ? config.epayCnyPerUsd
    : 7.2;
  const methods = config.epayTypes.filter((t) => PAY_TYPES.has(t));
  return {
    enabled: epayConfigured() && methods.length > 0,
    cnyPerUsd: rate,
    methods: methods.length ? methods : ["alipay", "wxpay"],
    presets: EPAY_PRESETS_USD,
  };
}

function epayBase(): string {
  return config.epayApiUrl.replace(/\/+$/, "");
}

function signParams(params: Record<string, string>, key: string): string {
  const keys = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type" && params[k] !== "")
    .sort();
  const raw = keys.map((k) => `${k}=${params[k]}`).join("&") + key;
  return md5(raw);
}

export function verifyEpaySign(params: Record<string, string>): boolean {
  if (!config.epayKey) return false;
  const got = (params.sign || "").toLowerCase();
  if (!got) return false;
  return got === signParams(params, config.epayKey);
}

export function cnyForUsd(usd: number): string {
  const rate = epayPublicConfig().cnyPerUsd;
  return (Math.round(usd * rate * 100) / 100).toFixed(2);
}

function publicUrl(path: string): string {
  return `${config.publicBaseUrl.replace(/\/+$/, "")}${path}`;
}

export async function createEpayOrder(opts: {
  userId: string;
  amountUsd: number;
  payType: string;
  clientIp: string;
}) {
  if (!epayConfigured()) throw new Error("在线充值未配置");
  const payType = opts.payType.trim();
  if (!PAY_TYPES.has(payType) || !config.epayTypes.includes(payType)) {
    throw new Error("不支持的支付方式");
  }
  const usd = Math.round(opts.amountUsd * 100) / 100;
  if (!EPAY_PRESETS_USD.includes(usd)) throw new Error("请选择预设充值金额");
  const amountCents = centsFromUsd(usd);
  const moneyCny = cnyForUsd(usd);
  if (Number(moneyCny) < 0.01) throw new Error("支付金额过低");

  const outTradeNo = `SC${Date.now()}${id("").slice(0, 8)}`.replace(/_/g, "");
  const notifyUrl = publicUrl("/api/pay/epay/notify");
  const returnUrl = publicUrl(`/app/recharge?order=${outTradeNo}`);

  await db.insert(rechargeOrders).values({
    id: id("ro"),
    userId: opts.userId,
    outTradeNo,
    payType,
    amountCents,
    moneyCny,
    status: "pending",
  });

  const payload: Record<string, string> = {
    pid: config.epayPid,
    type: payType,
    out_trade_no: outTradeNo,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name: `账户充值 $${usd.toFixed(2)}`,
    money: moneyCny,
    clientip: opts.clientIp || "127.0.0.1",
    device: "pc",
    sign_type: "MD5",
  };
  payload.sign = signParams(payload, config.epayKey);

  let payUrl = `${epayBase()}/submit.php`;
  let qrcode = "";
  try {
    const body = new URLSearchParams(payload);
    const res = await fetch(`${epayBase()}/mapi.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    const json = JSON.parse(text) as {
      code?: number;
      payurl?: string;
      qrcode?: string;
      urlscheme?: string;
      msg?: string;
    };
    if (json.code === 1) {
      payUrl = json.payurl || json.urlscheme || payUrl;
      qrcode = json.qrcode || "";
      if (!payUrl && qrcode) payUrl = qrcode;
    }
  } catch {
    const qs = new URLSearchParams(payload).toString();
    payUrl = `${epayBase()}/submit.php?${qs}`;
  }
  if (!qrcode) {
    const qs = new URLSearchParams(payload).toString();
    if (payUrl === `${epayBase()}/submit.php`) {
      payUrl = `${epayBase()}/submit.php?${qs}`;
    }
  }

  return {
    outTradeNo,
    amountUsd: usd,
    moneyCny,
    payType,
    payUrl,
    qrcode,
  };
}

export async function fulfillEpayNotify(params: Record<string, string>) {
  if (!verifyEpaySign(params)) return { ok: false, message: "sign" };
  const status = params.trade_status || "";
  if (status && status !== "TRADE_SUCCESS" && status !== "TRADE_FINISHED") {
    return { ok: true, message: "ignored" };
  }
  const outTradeNo = params.out_trade_no || "";
  if (!outTradeNo) return { ok: false, message: "no order" };

  const [order] = await db
    .select()
    .from(rechargeOrders)
    .where(eq(rechargeOrders.outTradeNo, outTradeNo))
    .limit(1);
  if (!order) return { ok: false, message: "order" };
  if (order.status === "paid") return { ok: true, message: "already" };

  const paidMoney = Number(params.money ?? "");
  if (Number.isFinite(paidMoney) && Math.abs(paidMoney - Number(order.moneyCny)) > 0.011) {
    return { ok: false, message: "money" };
  }

  const now = new Date();
  await db
    .update(rechargeOrders)
    .set({
      status: "paid",
      tradeNo: params.trade_no || order.tradeNo || "",
      paidAt: now,
      updatedAt: now,
    })
    .where(eq(rechargeOrders.id, order.id));
  try {
    await creditUserBalance(order.userId, order.amountCents);
  } catch (err) {
    await db
      .update(rechargeOrders)
      .set({ status: "pending", paidAt: null, updatedAt: new Date() })
      .where(eq(rechargeOrders.id, order.id));
    throw err;
  }
  return { ok: true, message: "success" };
}

export function publicOrder(row: typeof rechargeOrders.$inferSelect) {
  return {
    outTradeNo: row.outTradeNo,
    payType: row.payType,
    amount: usdFromCents(row.amountCents),
    moneyCny: row.moneyCny,
    status: row.status,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
  };
}
