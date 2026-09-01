import { randomBytes, timingSafeEqual } from "node:crypto";
import { id } from "../utils/crypto.js";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TTL_MS = 5 * 60_000;

type CaptchaRow = { answer: string; expires: number };
const store = new Map<string, CaptchaRow>();

function prune() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expires <= now) store.delete(k);
  }
}

function pick(n: number) {
  const buf = randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i++) out += CHARS[buf[i]! % CHARS.length];
  return out;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function svgFor(text: string) {
  const w = 132;
  const h = 44;
  const letters = [...text].map((ch, i) => {
    const x = 18 + i * 28;
    const y = 30 + ((i % 2) * 4 - 2);
    const rot = (i % 2 === 0 ? -1 : 1) * (8 + (i * 3) % 10);
    return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-size="24" font-weight="700" font-family="Georgia, serif" fill="#4c1d95">${escapeXml(ch)}</text>`;
  });
  const noise = Array.from({ length: 5 }, (_, i) => {
    const x1 = 8 + i * 24;
    const y1 = 8 + ((i * 13) % 28);
    const x2 = 40 + i * 22;
    const y2 = 36 - ((i * 9) % 22);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c4b5fd" stroke-width="1.2"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="验证码">
    <rect width="100%" height="100%" rx="10" fill="#f5f3ff"/>
    ${noise.join("")}
    ${letters.join("")}
  </svg>`;
}

export function createCaptcha() {
  prune();
  const answer = pick(4);
  const captchaId = id("cap");
  store.set(captchaId, { answer, expires: Date.now() + TTL_MS });
  const svg = svgFor(answer);
  return {
    captchaId,
    image: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
  };
}

export function consumeCaptcha(captchaId: string, input: string): boolean {
  prune();
  const row = store.get(captchaId);
  store.delete(captchaId);
  if (!row || row.expires <= Date.now()) return false;
  const got = input.trim().toUpperCase();
  const want = row.answer.toUpperCase();
  if (got.length !== want.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(want));
  } catch {
    return false;
  }
}
