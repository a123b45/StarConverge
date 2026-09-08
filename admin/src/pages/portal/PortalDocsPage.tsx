import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import type { ReactNode } from "react";

type ModelItem = { id: string; model: string; retired?: boolean };

export default function PortalDocsPage() {
  const { t, lang } = useI18n();
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
  const yourKey = t("docs.yourKey");

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
          <h1>{t("docs.title")}</h1>
          <p>{t("docs.lead")}</p>
        </div>
      </div>

      <div className="portal-steps">
        <div className="portal-step">
          <span className="n">1</span>
          <div>
            <h3>
              {t("docs.step1")}{" "}
              <Link to="/app/recharge" className="inline-link">
                {t("docs.step1Go")}
              </Link>
            </h3>
            <p className="muted">{t("docs.step1Body")}</p>
          </div>
        </div>
        <div className="portal-step">
          <span className="n">2</span>
          <div>
            <h3>
              {t("docs.step2")}{" "}
              <Link to="/app/keys" className="inline-link">
                {t("docs.step2Go")}
              </Link>
            </h3>
            <p className="muted">{t("docs.step2Body")}</p>
          </div>
        </div>
        <div className="portal-step">
          <span className="n">3</span>
          <div>
            <h3>{t("docs.step3")}</h3>
            <p className="muted">{t("docs.step3Body")}</p>
          </div>
        </div>
      </div>

      <div className="portal-recipe-grid">
        <RecipeCard
          title="Cursor"
          hint={t("docs.cursorHint")}
          guideLabel={t("docs.guide")}
          copyLabel={copied === "cursor" ? t("common.copied") : t("common.copy")}
          onCopy={() => void copy(cursorRecipe, "cursor")}
          guideHref={guides.cursor}
        >
          <pre className="portal-code">{cursorRecipe}</pre>
        </RecipeCard>
        <RecipeCard
          title="Claude Code"
          hint={t("docs.claudeHint")}
          guideLabel={t("docs.guide")}
          copyLabel={copied === "claude" ? t("common.copied") : t("common.copy")}
          onCopy={() => void copy(claudeCodeRecipe, "claude")}
          guideHref={guides.claude}
        >
          <pre className="portal-code">{claudeCodeRecipe}</pre>
        </RecipeCard>
        <RecipeCard
          title="Codex"
          hint={t("docs.codexHint")}
          guideLabel={t("docs.guide")}
          copyLabel={copied === "codex" ? t("common.copied") : t("common.copy")}
          onCopy={() => void copy(codexRecipe, "codex")}
          guideHref={guides.codex}
        >
          <pre className="portal-code">{codexRecipe}</pre>
        </RecipeCard>
      </div>

      <div className="portal-panel portal-baseurl-panel">
        <div className="portal-panel-head">
          <h3>{t("docs.baseUrlTitle")}</h3>
          <p className="muted portal-baseurl-lead">{t("docs.baseUrlLead")}</p>
        </div>
        <div className="portal-baseurl-list">
          <div className="portal-baseurl-row">
            <div className="portal-baseurl-meta">
              <span>{t("docs.baseUrlOpenai")}</span>
              <code className="mono">{openaiBase}</code>
            </div>
            <button
              className="portal-btn ghost sm"
              type="button"
              onClick={() => void copy(openaiBase, "base-openai")}
            >
              {copied === "base-openai" ? t("common.copied") : t("common.copy")}
            </button>
          </div>
          <div className="portal-baseurl-row">
            <div className="portal-baseurl-meta">
              <span>{t("docs.baseUrlAnthropic")}</span>
              <code className="mono">{anthropicBase}</code>
            </div>
            <button
              className="portal-btn ghost sm"
              type="button"
              onClick={() => void copy(anthropicBase, "base-anthropic")}
            >
              {copied === "base-anthropic" ? t("common.copied") : t("common.copy")}
            </button>
          </div>
        </div>
      </div>

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>curl</h3>
          <button
            className="portal-btn ghost sm"
            type="button"
            onClick={() => void copy(curlExample, "curl")}
          >
            {copied === "curl" ? t("common.copied") : t("common.copy")}
          </button>
        </div>
        <pre className="portal-code">{curlExample}</pre>
      </div>

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>{t("docs.pythonTitle")}</h3>
          <button
            className="portal-btn ghost sm"
            type="button"
            onClick={() => void copy(pythonExample, "py")}
          >
            {copied === "py" ? t("common.copied") : t("common.copy")}
          </button>
        </div>
        <pre className="portal-code">{pythonExample}</pre>
      </div>

      <div className="portal-panel portal-docs-callout">
        <h3>{t("docs.protocolTitle")}</h3>
        <p>{t("docs.protocolLead")}</p>
        <div className="portal-docs-kv">
          <div>
            <span>{t("docs.kvOpenai")}</span>
            <strong>{openaiBase}</strong>
          </div>
          <div>
            <span>{t("docs.kvAnthropic")}</span>
            <strong>{anthropicBase}</strong>
          </div>
          <div>
            <span>{t("docs.kvKey")}</span>
            <strong>{t("docs.kvKeyVal")}</strong>
          </div>
          <div>
            <span>{t("docs.kvModel")}</span>
            <strong>
              {lang === "en" ? (
                <>
                  the ID from <Link to="/app/models">{t("nav.models")}</Link>
                </>
              ) : (
                <>
                  <Link to="/app/models">{t("nav.models")}</Link> 里的 ID
                </>
              )}
            </strong>
          </div>
        </div>
        <div className="portal-docs-examples">
          <div>
            <strong>{t("docs.exAnthropicTitle")}</strong>
            <p>{t("docs.exAnthropicBody")}</p>
            <code>
              ANTHROPIC_BASE_URL={anthropicBase}
              {"\n"}
              ANTHROPIC_AUTH_TOKEN={yourKey}
            </code>
          </div>
          <div>
            <strong>{t("docs.exOpenaiTitle")}</strong>
            <p>{t("docs.exOpenaiBody")}</p>
            <code>
              OPENAI_BASE_URL={openaiBase}
              {"\n"}
              OPENAI_API_KEY={yourKey}
            </code>
          </div>
        </div>
      </div>

      <div className="portal-panel">
        <div className="portal-panel-head">
          <h3>
            {t("docs.modelIds")}{" "}
            <Link to="/app/models" className="inline-link">
              {t("docs.allModels")}
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
                title={`${t("common.copy")} ${id}`}
                onClick={() => void copy(id, `m-${id}`)}
              >
                {copied === `m-${id}` ? t("common.copied") : id}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">{t("docs.noModels")}</p>
        )}
      </div>
    </div>
  );
}

function RecipeCard({
  title,
  hint,
  guideLabel,
  copyLabel,
  onCopy,
  guideHref,
  children,
}: {
  title: string;
  hint: string;
  guideLabel: string;
  copyLabel: string;
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
              {guideLabel}
            </a>
          ) : null}
          <button className="portal-btn ghost sm" type="button" onClick={onCopy}>
            {copyLabel}
          </button>
        </div>
      </header>
      <p className="portal-recipe-hint">{hint}</p>
      {children}
    </article>
  );
}
