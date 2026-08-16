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
          <p>任意 OpenAI / Anthropic 兼容 Agent 填入以下三项即可连接。</p>
        </div>
      </div>

      <div className="portal-steps">
        <div className="portal-step">
          <span className="n">1</span>
          <div>
            <h3>Base URL</h3>
            <div className="copy-row">
              <code>{origin}</code>
              <button
                className="portal-btn ghost sm"
                type="button"
                onClick={() => void copy(origin, "base")}
              >
                {copied === "base" ? "已复制" : "复制"}
              </button>
            </div>
            <p className="muted">
              Anthropic 协议填 {origin}；OpenAI 兼容协议填 {openaiBase}
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
