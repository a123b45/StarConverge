import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

type JwtPayload = {
  sub: string;
  role: "admin";
  exp: number;
  iat: number;
};

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signAdminToken(username: string, ttlSec = 60 * 60 * 24): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const iat = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      sub: username,
      role: "admin",
      iat,
      exp: iat + ttlSec,
    } satisfies JwtPayload),
  );
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", config.adminJwtSecret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

export function verifyAdminToken(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;
  const expected = createHmac("sha256", config.adminJwtSecret).update(data).digest();
  const actual = fromB64url(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fromB64url(payload).toString("utf8")) as JwtPayload;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    if (parsed.role !== "admin") return null;
    return parsed;
  } catch {
    return null;
  }
}
