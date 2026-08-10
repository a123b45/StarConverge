import { useEffect, useState } from "react";
import { api } from "../lib/api";

type SystemInfo = {
  name: string;
  version: string;
  adminUsername: string;
  endpoints: Record<string, string>;
  tips: string[];
};

export default function SettingsPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const origin = window.location.origin;

  useEffect(() => {
    api<SystemInfo>("/system")
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, []);

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  const curl = `curl ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer sk-sc-你的密钥" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"你好"}]}'`;

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>API 文档</h2>
          <p>接入说明与站点信息（管理员密码请改 deploy/.env）</p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="grid-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="stat">
          <div className="label">站点</div>
          <div className="value" style={{ fontSize: "1.2rem" }}>
            {info?.name ?? "—"}
          </div>
          <div className="hint">v{info?.version ?? "?"}</div>
        </div>
        <div className="stat">
          <div className="label">管理员</div>
          <div className="value" style={{ fontSize: "1.2rem" }}>
            {info?.adminUsername ?? "—"}
          </div>
          <div className="hint">角色 admin</div>
        </div>
        <div className="stat">
          <div className="label">对外地址</div>
          <div className="value" style={{ fontSize: "0.95rem", wordBreak: "break-all" }}>
            {origin}
          </div>
          <div className="hint">
            <button className="btn ghost sm" onClick={() => copy(origin, "origin")}>
              {copied === "origin" ? "已复制" : "复制"}
            </button>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <strong>客户端接入（OpenAI 兼容）</strong>
          <button
            className="btn ghost sm"
            onClick={() => copy(`${origin}/v1`, "base")}
          >
            {copied === "base" ? "已复制" : "复制 Base URL"}
          </button>
        </div>
        <div style={{ padding: 16 }}>
          <div className="alert info" style={{ marginBottom: 12 }}>
            {(info?.tips ?? []).map((t) => (
              <div key={t}>· {t}</div>
            ))}
          </div>
          <table className="table">
            <tbody>
              <tr>
                <td style={{ width: 140, color: "var(--muted)" }}>Base URL</td>
                <td className="mono">{origin}/v1</td>
              </tr>
              <tr>
                <td style={{ color: "var(--muted)" }}>Chat</td>
                <td className="mono">{origin}/v1/chat/completions</td>
              </tr>
              <tr>
                <td style={{ color: "var(--muted)" }}>Models</td>
                <td className="mono">{origin}/v1/models</td>
              </tr>
              <tr>
                <td style={{ color: "var(--muted)" }}>API Key</td>
                <td>在「密钥管理」创建后填入 Authorization Bearer</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <strong>调用示例</strong>
          <button className="btn ghost sm" onClick={() => copy(curl, "curl")}>
            {copied === "curl" ? "已复制" : "复制 curl"}
          </button>
        </div>
        <div style={{ padding: 16 }}>
          <div className="code-box">{curl}</div>
        </div>
      </div>
    </>
  );
}
