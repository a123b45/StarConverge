import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "../../lib/api";

type ModelItem = { id: string; model: string };

export default function PortalDocsPage() {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-host";
  const openaiBase = `${origin}/v1`;
  const [models, setModels] = useState<ModelItem[]>([]);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    portalApi<{ data: ModelItem[] }>("/models")
      .then((r) => setModels(r.data ?? []))
      .catch(() => setModels([]));
  }, []);

  const modelIds = useMemo(
    () =>
      [...new Set(models.map((m) => m.model).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [models],
  );

  const sampleModel = modelIds[0] || "your-model-id";

  const curlExample = `curl ${openaiBase}/chat/completions \\
  -H "Authorization: Bearer sk-sc-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${sampleModel}",
    "messages": [{"role":"user","content":"Hello"}]
  }'`;

  const envExample = `{
  "env": {
    "OPENAI_BASE_URL": "${openaiBase}",
    "OPENAI_API_KEY": "<YOUR_API_KEY>"
  }
}`;

  const pythonExample = `from openai import OpenAI

client = OpenAI(
    base_url="${openaiBase}",
    api_key="sk-sc-...",
)

resp = client.chat.completions.create(
    model="${sampleModel}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)`;

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>接入指南</h1>
          <p>
            对外只提供 OpenAI 兼容协议。Claude、GPT、Qwen 等模型都走同一套接口，不需要按厂商切换
            Anthropic 格式。
          </p>
        </div>
      </div>

      <div className="portal-panel portal-docs-callout">
        <h3>协议怎么选</h3>
        <p>
          客户端如果让你选 OpenAI 还是 Anthropic：<strong>一律选 OpenAI / OpenAI Compatible</strong>。
          模型叫 Claude 也不要选 Anthropic 官方协议（那会走 <code>/v1/messages</code>，本站不会转换）。
        </p>
        <div className="portal-docs-kv">
          <div>
            <span>协议 / Provider</span>
            <strong>OpenAI Compatible</strong>
          </div>
          <div>
            <span>Base URL</span>
            <strong>{openaiBase}</strong>
          </div>
          <div>
            <span>API Key</span>
            <strong>控制台创建的 sk-sc- 密钥</strong>
          </div>
          <div>
            <span>模型名</span>
            <strong>填模型列表里的 ID，不要改成官方 Anthropic 名</strong>
          </div>
        </div>
      </div>

      <div className="portal-steps">
        <div className="portal-step">
          <span className="n">1</span>
          <div>
            <h3>Base URL</h3>
            <div className="copy-row">
              <code>{openaiBase}</code>
              <button
                className="portal-btn ghost sm"
                type="button"
                onClick={() => void copy(openaiBase, "base")}
              >
                {copied === "base" ? "已复制" : "复制"}
              </button>
            </div>
            <p className="muted">
              OpenAI SDK、Cursor、Cline、NextChat 等都填这个地址。不要填成 {origin}{" "}
              后再选 Anthropic。
            </p>
          </div>
        </div>

        <div className="portal-step">
          <span className="n">2</span>
          <div>
            <h3>
              API Key{" "}
              <Link to="/app/keys" className="inline-link">
                创建密钥 →
              </Link>
            </h3>
            <div className="copy-row">
              <code>sk-sc-...</code>
            </div>
            <p className="muted">控制台创建的 sk-sc- 密钥</p>
          </div>
        </div>

        <div className="portal-step">
          <span className="n">3</span>
          <div>
            <h3>
              模型{" "}
              <Link to="/app/models" className="inline-link">
                全部模型 →
              </Link>
            </h3>
            <div className="copy-row">
              <code>GET {openaiBase}/models</code>
              <button
                className="portal-btn ghost sm"
                type="button"
                onClick={() => void copy(`${openaiBase}/models`, "models")}
              >
                {copied === "models" ? "已复制" : "复制"}
              </button>
            </div>
            <p className="muted">请求 model 字段使用下方 ID</p>
            {modelIds.length ? (
              <div className="portal-model-id-tags">
                {modelIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="portal-model-id-tag"
                    title={`复制 ${id}`}
                    onClick={() => void copy(id, `m-${id}`)}
                  >
                    {copied === `m-${id}` ? "已复制" : id}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">
                暂无已同步模型，请联系管理员在「模型管理」中同步后再试。
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>请求示例</h3>
          <button
            className="portal-btn ghost sm"
            type="button"
            onClick={() => void copy(curlExample, "curl")}
          >
            {copied === "curl" ? "已复制" : "复制 curl"}
          </button>
        </div>
        <pre className="portal-code">{curlExample}</pre>
      </div>

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>Python（OpenAI SDK）</h3>
          <button
            className="portal-btn ghost sm"
            type="button"
            onClick={() => void copy(pythonExample, "py")}
          >
            {copied === "py" ? "已复制" : "复制 Python"}
          </button>
        </div>
        <pre className="portal-code">{pythonExample}</pre>
      </div>

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>客户端环境变量示例</h3>
          <button
            className="portal-btn ghost sm"
            type="button"
            onClick={() => void copy(envExample, "env")}
          >
            {copied === "env" ? "已复制" : "复制 JSON"}
          </button>
        </div>
        <pre className="portal-code">{envExample}</pre>
      </div>
    </div>
  );
}
