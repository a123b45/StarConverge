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
export ANTHROPIC_AUTH_TOKEN="<YOUR_API_KEY>"`;

  const codexRecipe = `model = "${sampleModel}"
model_provider = "custom"

[model_providers.custom]
base_url = "${openaiBase}"
env_key = "OPENAI_API_KEY"
wire_api = "chat"`;

  const guides = {
    cursor: "https://cursor.com/docs/settings/api-keys",
    claude: "https://code.claude.com/docs/en/llm-gateway-connect",
    codex: "https://github.com/openai/codex",
  };

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
            <p className="muted">下面三张配方卡可直接复制，卡片上有官方教程。模型 ID 用广场里的名字，不要改成官方名。</p>
          </div>
        </div>
      </div>

      <div className="portal-recipe-grid">
        <RecipeCard
          title="Cursor"
          hint="Settings → Models → 填 OpenAI API Key，打开 Override Base URL。"
          copied={copied === "cursor"}
          onCopy={() => void copy(cursorRecipe, "cursor")}
          guideHref={guides.cursor}
        >
          <pre className="portal-code">{cursorRecipe}</pre>
        </RecipeCard>
        <RecipeCard
          title="Claude Code"
          hint="Anthropic 协议走 /v1/messages，Base URL 用站点根地址，不要带 /v1。"
          copied={copied === "claude"}
          onCopy={() => void copy(claudeCodeRecipe, "claude")}
          guideHref={guides.claude}
        >
          <pre className="portal-code">{claudeCodeRecipe}</pre>
        </RecipeCard>
        <RecipeCard
          title="Codex"
          hint="写入 ~/.codex/config.toml，再 export OPENAI_API_KEY 后运行 codex。"
          copied={copied === "codex"}
          onCopy={() => void copy(codexRecipe, "codex")}
          guideHref={guides.codex}
        >
          <pre className="portal-code">{codexRecipe}</pre>
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
          Claude Code / Claude Desktop 用 Anthropic Base URL（站点根地址）。Cursor、Codex、Python
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
  hint,
  copied,
  onCopy,
  guideHref,
  children,
}: {
  title: string;
  hint: string;
  copied: boolean;
  onCopy: () => void;
  guideHref?: string;
  children: ReactNode;
}) {
  return (
    <article className="portal-panel portal-recipe">
      <header className="portal-recipe-head">
        <h3>{title}</h3>
        <div className="portal-recipe-actions">
          {guideHref ? (
            <a
              className="portal-recipe-guide"
              href={guideHref}
              target="_blank"
              rel="noreferrer"
            >
              点我获取教程
            </a>
          ) : null}
          <button className="portal-btn ghost sm" type="button" onClick={onCopy}>
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </header>
      <p className="portal-recipe-hint">{hint}</p>
      {children}
    </article>
  );
}
