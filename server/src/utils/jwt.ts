import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

export type JwtRole = "admin" | "user";

export type JwtPayload = {
  sub: string;
  role: JwtRole;
  userId?: string;
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

export function signToken(
  username: string,
  role: JwtRole,
  userId?: string,
  ttlSec = 60 * 60 * 24 * 7,
): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const iat = Math.floor(Date.now() / 1000);
  const body: JwtPayload = {
    sub: username,
    role,
    iat,
    exp: iat + ttlSec,
  };
  if (userId) body.userId = userId;
  const payload = b64url(JSON.stringify(body));
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", config.adminJwtSecret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

/** @deprecated use signToken(username, "admin") */
export function signAdminToken(username: string, ttlSec = 60 * 60 * 24): string {
  return signToken(username, "admin", undefined, ttlSec);
}

export function verifyToken(token: string): JwtPayload | null {
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
    if (parsed.role !== "admin" && parsed.role !== "user") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function verifyAdminToken(token: string): JwtPayload | null {
  const parsed = verifyToken(token);
  if (!parsed || parsed.role !== "admin") return null;
  return parsed;
}
