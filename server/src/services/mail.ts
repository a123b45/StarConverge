import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function createResetToken(): string {
  return randomBytes(32).toString("hex");
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<{ sent: boolean; error?: string }> {
  if (!config.resendApiKey) {
    console.info(`[mail] RESEND_API_KEY unset; reset link for ${to}: ${resetUrl}`);
    return { sent: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.mailFrom,
        to: [to],
        subject: "重置您的 StarConverge 密码",
        html: `<p>您好，</p><p>请点击以下链接重置密码（1 小时内有效）：</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>如非本人操作，请忽略此邮件。</p>`,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[mail] send failed", res.status, text);
      return { sent: false, error: text.slice(0, 200) };
    }
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[mail] send error", msg);
    return { sent: false, error: msg };
  }
}
