import { randomBytes, timingSafeEqual } from "node:crypto";
import { id } from "../utils/crypto.js";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TTL_MS = 5 * 60_000;
const LEN = 5;

type CaptchaRow = { answer: string; expires: number };
const store = new Map<string, CaptchaRow>();

function prune() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expires <= now) store.delete(k);
  }
}

function rand() {
  return randomBytes(4).readUInt32BE(0) / 0x1_0000_0000;
}

function randInt(min: number, max: number) {
  return min + Math.floor(rand() * (max - min + 1));
}

function pick(n: number) {
  let out = "";
  for (let i = 0; i < n; i++) out += CHARS[randInt(0, CHARS.length - 1)];
  return out;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function svgFor(text: string) {
  const w = 176;
  const h = 56;
  const fonts = ["Georgia, serif", "Times New Roman, serif", "Courier New, monospace", "cursive"];
  const letters = [...text].map((ch, i) => {
    const x = 16 + i * 30 + randInt(-4, 6);
    const y = randInt(34, 46);
    const rot = randInt(-34, 34);
    const size = randInt(22, 32);
    const skew = randInt(-18, 18);
    const font = fonts[randInt(0, fonts.length - 1)];
    const fill = `rgb(${randInt(55, 95)},${randInt(20, 50)},${randInt(110, 160)})`;
    return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y}) skewX(${skew})" font-size="${size}" font-weight="700" font-style="${rand() > 0.5 ? "italic" : "normal"}" font-family="${font}" fill="${fill}" stroke="${fill}" stroke-width="0.8" paint-order="stroke fill">${escapeXml(ch)}</text>`;
  });

  const lines = Array.from({ length: 18 }, () => {
    const x1 = randInt(0, w);
    const y1 = randInt(0, h);
    const x2 = randInt(0, w);
    const y2 = randInt(0, h);
    const op = (0.35 + rand() * 0.45).toFixed(2);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#5b21b6" stroke-opacity="${op}" stroke-width="${(1 + rand() * 1.8).toFixed(1)}"/>`;
  });

  const curves = Array.from({ length: 6 }, () => {
    const x1 = randInt(0, 40);
    const y1 = randInt(8, h - 8);
    const cx = randInt(40, 130);
    const cy = randInt(-10, h + 10);
    const x2 = randInt(140, w);
    const y2 = randInt(8, h - 8);
    return `<path d="M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}" fill="none" stroke="#4c1d95" stroke-opacity="0.55" stroke-width="${(1.2 + rand()).toFixed(1)}"/>`;
  });

  const dots = Array.from({ length: 55 }, () => {
    const x = randInt(2, w - 2);
    const y = randInt(2, h - 2);
    return `<circle cx="${x}" cy="${y}" r="${(0.6 + rand() * 1.4).toFixed(1)}" fill="#4c1d95" fill-opacity="${(0.25 + rand() * 0.5).toFixed(2)}"/>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="验证码">
    <rect width="100%" height="100%" rx="10" fill="#ede9fe"/>
    ${dots.join("")}
    ${lines.join("")}
    ${letters.join("")}
    ${curves.join("")}
  </svg>`;
}

export function createCaptcha() {
  prune();
  const answer = pick(LEN);
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
  const row = store.get(captchaId.trim());
  store.delete(captchaId.trim());
  if (!row || row.expires <= Date.now()) return false;
  const got = input.replace(/\s+/g, "").toUpperCase();
  const want = row.answer.toUpperCase();
  if (got.length !== want.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(want));
  } catch {
    return false;
  }
}
