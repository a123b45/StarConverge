import { Link } from "react-router-dom";

const MODELS_HINT = [
  "按控制台「模型列表」中的 ID 填写",
  "OpenAI 兼容：Base URL 使用 /v1",
];

export default function PortalDocsPage() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-host";

  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>接入指南</h1>
          <p>任意 OpenAI 兼容客户端填入以下三项即可连接。</p>
        </div>
      </div>

      <div className="portal-steps">
        <div className="portal-step">
          <span className="n">1</span>
          <div>
            <h3>Base URL</h3>
            <div className="copy-row">
              <code>{origin}/v1</code>
              <button
                className="portal-btn ghost sm"
                type="button"
                onClick={() => void navigator.clipboard.writeText(`${origin}/v1`)}
              >
                复制
              </button>
            </div>
            <p className="muted">OpenAI 兼容协议请使用带 /v1 的地址</p>
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
              <code>GET {origin}/v1/models</code>
              <button
                className="portal-btn ghost sm"
                type="button"
                onClick={() =>
                  void navigator.clipboard.writeText(`GET ${origin}/v1/models`)
                }
              >
                复制
              </button>
            </div>
            <p className="muted">{MODELS_HINT.join(" · ")}</p>
          </div>
        </div>
      </div>

      <div className="portal-panel">
        <h3>请求示例</h3>
        <pre className="portal-code">{`curl ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer sk-sc-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "your-model-id",
    "messages": [{"role":"user","content":"Hello"}]
  }'`}</pre>
      </div>

      <div className="portal-panel">
        <h3>客户端环境变量示例</h3>
        <pre className="portal-code">{`{
  "env": {
    "OPENAI_BASE_URL": "${origin}/v1",
    "OPENAI_API_KEY": "<YOUR_API_KEY>"
  }
}`}</pre>
      </div>
    </div>
  );
}
