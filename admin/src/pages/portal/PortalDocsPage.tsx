import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "../../lib/api";
import type { ReactNode } from "react";

type ModelItem = { id: string; model: string; retired?: boolean };

export default function PortalDocsPage() {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-host";
  const openaiBase = `${origin}/v1`;
  const anthropicBase = origin;
  const [models, setModels] = useState<ModelItem[]>([]);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    portalApi<{ data: ModelItem[] }>("/models")
      .then((r) => setModels((r.data ?? []).filter((m) => !m.retired)))
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
  const claudeModel =
    modelIds.find((id) => /claude/i.test(id)) || sampleModel;

  const curlExample = `curl ${openaiBase}/chat/completions \\
  -H "Authorization: Bearer sk-sc-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${sampleModel}",
    "messages": [{"role":"user","content":"Hello"}]
  }'`;

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

  const cursorRecipe = `{
  "env": {
    "OPENAI_BASE_URL": "${openaiBase}",
    "OPENAI_API_KEY": "<YOUR_API_KEY>"
  }
}`;

  const claudeCodeRecipe = `export ANTHROPIC_BASE_URL="${anthropicBase}"
export ANTHROPIC_AUTH_TOKEN="<YOUR_API_KEY>"
# Claude Code 会请求 ${anthropicBase}/v1/messages
# 模型填广场里的 ID，例如 ${claudeModel}`;

  const cherryRecipe = `提供商：OpenAI 兼容
接口地址：${openaiBase}
API Key：控制台创建的 sk-sc- 密钥
模型：${sampleModel}`;

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
          <p>充值买量 → 创建密钥 → 填 Base URL。OpenAI 和 Anthropic 协议都能用同一把 KEY。</p>
        </div>
      </div>

      <div className="portal-steps">
        <div className="portal-step">
          <span className="n">1</span>
          <div>
            <h3>
              充值{" "}
              <Link to="/app/recharge" className="inline-link">
                去充值 →
              </Link>
            </h3>
            <p className="muted">卡密兑换余额后按 token 扣费，余额为 0 无法调用。</p>
          </div>
        </div>
        <div className="portal-step">
          <span className="n">2</span>
          <div>
            <h3>
              创建 KEY{" "}
              <Link to="/app/keys" className="inline-link">
                创建密钥 →
              </Link>
            </h3>
            <p className="muted">一把 sk-sc- 密钥同时用于 OpenAI 兼容和 Anthropic Messages。</p>
          </div>
        </div>
        <div className="portal-step">
          <span className="n">3</span>
          <div>
            <h3>填进客户端</h3>
            <p className="muted">下面三张配方卡可直接复制。模型 ID 用广场里的名字，不要改成官方名。</p>
          </div>
        </div>
      </div>

      <div className="portal-recipe-grid">
        <RecipeCard
          title="Cursor"
          copied={copied === "cursor"}
          onCopy={() => void copy(cursorRecipe, "cursor")}
        >
          <p>Settings → Models → OpenAI API Key，打开 Override Base URL。</p>
          <pre className="portal-code">{cursorRecipe}</pre>
        </RecipeCard>
        <RecipeCard
          title="Claude Code"
          copied={copied === "claude"}
          onCopy={() => void copy(claudeCodeRecipe, "claude")}
        >
          <p>Anthropic 协议走 /v1/messages，Base URL 不要带 /v1。</p>
          <pre className="portal-code">{claudeCodeRecipe}</pre>
        </RecipeCard>
        <RecipeCard
          title="Cherry Studio"
          copied={copied === "cherry"}
          onCopy={() => void copy(cherryRecipe, "cherry")}
        >
          <p>添加服务商时选 OpenAI 兼容即可。</p>
          <pre className="portal-code">{cherryRecipe}</pre>
        </RecipeCard>
      </div>

      <div className="portal-panel portal-docs-callout">
        <h3>两个协议，同一把 KEY</h3>
        <div className="portal-docs-kv">
          <div>
            <span>OpenAI Compatible</span>
            <strong>{openaiBase}</strong>
          </div>
          <div>
            <span>Anthropic Messages</span>
            <strong>{anthropicBase}</strong>
          </div>
          <div>
            <span>API Key</span>
            <strong>sk-sc- 密钥，或 x-api-key</strong>
          </div>
          <div>
            <span>模型名</span>
            <strong>
              <Link to="/app/models">模型广场</Link> 里的 ID
            </strong>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Claude Code / Claude Desktop 用 Anthropic Base URL（站点根地址）。Cursor、ChatBox、Python
          OpenAI SDK 用 {openaiBase}。
        </p>
      </div>

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>
            模型 ID{" "}
            <Link to="/app/models" className="inline-link">
              全部模型 →
            </Link>
          </h3>
        </div>
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
          <p className="muted">暂无已同步模型，请联系管理员在「模型管理」中同步后再试。</p>
        )}
      </div>

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>curl</h3>
          <button
            className="portal-btn ghost sm"
            type="button"
            onClick={() => void copy(curlExample, "curl")}
          >
            {copied === "curl" ? "已复制" : "复制"}
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
            {copied === "py" ? "已复制" : "复制"}
          </button>
        </div>
        <pre className="portal-code">{pythonExample}</pre>
      </div>
    </div>
  );
}

function RecipeCard({
  title,
  copied,
  onCopy,
  children,
}: {
  title: string;
  copied: boolean;
  onCopy: () => void;
  children: ReactNode;
}) {
  return (
    <div className="portal-panel portal-recipe">
      <div className="portal-panel-head">
        <h3>{title}</h3>
        <button className="portal-btn ghost sm" type="button" onClick={onCopy}>
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      {children}
    </div>
  );
}
