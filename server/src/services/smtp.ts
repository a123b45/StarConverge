import net from "node:net";
import tls from "node:tls";
import { Buffer } from "node:buffer";
import { config } from "../config.js";

export function smtpConfigured(): boolean {
  return Boolean(config.smtpHost && config.smtpUser && config.smtpPass);
}

type SmtpOpts = {
  to: string;
  subject: string;
  html: string;
};

function b64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}

function encodeHeader(s: string) {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return `=?UTF-8?B?${b64(s)}?=`;
}

function parseFrom(raw: string): { name?: string; email: string } {
  const m = raw.match(/^(.*)<([^>]+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ""), email: m[2].trim() };
  return { email: raw.trim() };
}

class SmtpClient {
  private buf = "";
  constructor(private sock: net.Socket) {}

  async read(): Promise<{ code: number; text: string }> {
    for (;;) {
      const idx = this.buf.indexOf("\r\n");
      if (idx === -1) {
        const chunk = await new Promise<string>((resolve, reject) => {
          const onData = (d: Buffer) => {
            cleanup();
            resolve(d.toString("utf8"));
          };
          const onErr = (e: Error) => {
            cleanup();
            reject(e);
          };
          const onEnd = () => {
            cleanup();
            reject(new Error("SMTP 连接已关闭"));
          };
          const cleanup = () => {
            this.sock.off("data", onData);
            this.sock.off("error", onErr);
            this.sock.off("end", onEnd);
          };
          this.sock.on("data", onData);
          this.sock.on("error", onErr);
          this.sock.on("end", onEnd);
        });
        this.buf += chunk;
        continue;
      }
      const line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 2);
      const code = Number(line.slice(0, 3));
      const cont = line[3] === "-";
      const rest = line.slice(4);
      if (!cont) return { code, text: rest };
    }
  }

  async cmd(line: string, expect?: number | number[]) {
    this.sock.write(line + "\r\n");
    const res = await this.read();
    if (expect != null) {
      const ok = Array.isArray(expect) ? expect.includes(res.code) : res.code === expect;
      if (!ok) throw new Error(`SMTP ${res.code}: ${res.text}`);
    }
    return res;
  }

  async upgradeTls(host: string): Promise<void> {
    const tlsSock = tls.connect({
      socket: this.sock,
      servername: host,
      rejectUnauthorized: true,
    });
    await new Promise<void>((resolve, reject) => {
      tlsSock.once("secureConnect", () => resolve());
      tlsSock.once("error", reject);
    });
    this.sock = tlsSock;
    this.buf = "";
  }

  end() {
    try {
      this.sock.end();
    } catch {
      /* ignore */
    }
  }
}

async function connect(host: string, port: number, implicitTls: boolean): Promise<SmtpClient> {
  const sock = implicitTls
    ? tls.connect({ host, port, servername: host, rejectUnauthorized: true })
    : net.connect({ host, port });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("SMTP 连接超时")), 15_000);
    const done = () => {
      clearTimeout(t);
      resolve();
    };
    if (implicitTls) sock.once("secureConnect", done);
    else sock.once("connect", done);
    sock.once("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
  sock.setTimeout(20_000);
  sock.on("timeout", () => sock.destroy(new Error("SMTP 读写超时")));
  return new SmtpClient(sock);
}

export async function sendSmtpMail(opts: SmtpOpts): Promise<void> {
  if (!smtpConfigured()) throw new Error("邮件服务未配置");
  const host = config.smtpHost;
  const port = config.smtpPort;
  const implicitTls = port === 465;
  const from = parseFrom(config.mailFrom);
  const envelopeFrom = from.email || config.smtpUser;
  const client = await connect(host, port, implicitTls);
  try {
    await client.read();
    await client.cmd("EHLO inkstudio.work", 250);
    if (!implicitTls && (port === 587 || port === 25)) {
      await client.cmd("STARTTLS", 220);
      await client.upgradeTls(host);
      await client.cmd("EHLO inkstudio.work", 250);
    }
    await client.cmd("AUTH LOGIN", 334);
    await client.cmd(b64(config.smtpUser), 334);
    await client.cmd(b64(config.smtpPass), 235);
    await client.cmd(`MAIL FROM:<${envelopeFrom}>`, 250);
    await client.cmd(`RCPT TO:<${opts.to}>`, 250);
    await client.cmd("DATA", 354);
    const fromHeader = from.name
      ? `${encodeHeader(from.name)} <${envelopeFrom}>`
      : envelopeFrom;
    const body = [
      `From: ${fromHeader}`,
      `To: ${opts.to}`,
      `Subject: ${encodeHeader(opts.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      b64(opts.html).match(/.{1,76}/g)?.join("\r\n") ?? b64(opts.html),
      ".",
    ].join("\r\n");
    await client.cmd(body, 250);
    await client.cmd("QUIT", 221).catch(() => undefined);
  } finally {
    client.end();
  }
}
