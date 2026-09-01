import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { sendSmtpMail, smtpConfigured } from "./smtp.js";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function createResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function mailConfigured(): boolean {
  return smtpConfigured() || Boolean(config.resendApiKey);
}

async function sendViaResend(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.mailFrom,
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 200) || `Resend ${res.status}`);
  }
}

export async function sendMail(
  to: string,
  subject: string,
  html: string,
): Promise<{ sent: boolean; error?: string }> {
  if (!mailConfigured()) {
    console.info(`[mail] not configured; skip send to ${to}: ${subject}`);
    return { sent: false };
  }
  try {
    if (smtpConfigured()) await sendSmtpMail({ to, subject, html });
    else await sendViaResend(to, subject, html);
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[mail] send error", msg);
    return { sent: false, error: msg };
  }
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<{ sent: boolean; error?: string }> {
  return sendMail(
    to,
    "重置 inkstudio 密码",
    `<p>您好，</p><p>请点击以下链接重置密码（1 小时内有效）：</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>如非本人操作，请忽略此邮件。</p>`,
  );
}

export async function sendRegisterCodeEmail(
  to: string,
  code: string,
): Promise<{ sent: boolean; error?: string }> {
  return sendMail(
    to,
    "inkstudio 注册验证码",
    `<p>您好，</p><p>您正在注册 inkstudio 账号，验证码为：</p><p style="font-size:22px;font-weight:700;letter-spacing:4px">${code}</p><p>10 分钟内有效。如非本人操作，请忽略此邮件。</p>`,
  );
}
