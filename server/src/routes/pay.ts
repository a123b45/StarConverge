import { Hono } from "hono";
import { fulfillEpayNotify } from "../services/epay.js";
import { config } from "../config.js";

export const payRoutes = new Hono();

async function readNotifyParams(c: {
  req: {
    method: string;
    query: () => Record<string, string>;
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    parseBody: () => Promise<Record<string, unknown>>;
  };
}): Promise<Record<string, string>> {
  const merged: Record<string, string> = { ...c.req.query() };
  if (c.req.method === "GET") return merged;
  const ct = c.req.header("content-type") || "";
  try {
    if (ct.includes("json")) {
      const json = (await c.req.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(json)) {
        if (v != null) merged[k] = String(v);
      }
    } else {
      const body = await c.req.parseBody();
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === "string") merged[k] = v;
      }
    }
  } catch {
    /* query-only */
  }
  return merged;
}

payRoutes.all("/epay/notify", async (c) => {
  const params = await readNotifyParams(c);
  const result = await fulfillEpayNotify(params);
  if (result.ok) return c.text("success");
  return c.text("fail", 400);
});

payRoutes.all("/epay/return", async (c) => {
  const params = c.req.query();
  const order = params.out_trade_no || "";
  const dest = `${config.publicBaseUrl.replace(/\/+$/, "")}/app/recharge${
    order ? `?order=${encodeURIComponent(order)}` : ""
  }`;
  return c.redirect(dest, 302);
});
