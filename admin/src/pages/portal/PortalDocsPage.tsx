import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "../../lib/api";
import { IconCopy } from "../../components/icons";

type ModelItem = { id: string; model: string };

function CopyField({
  value,
  copyValue,
  ariaLabel,
}: {
  value: string;
  copyValue?: string;
  ariaLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = copyValue ?? value;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="docs-copy-field">
      <code title={value}>{value}</code>
      <button
        type="button"
        className="docs-copy-btn"
        aria-label={copied ? "已复制" : ariaLabel}
        title={copied ? "已复制" : "复制"}
        onClick={() => void copy()}
      >
        {copied ? <span className="docs-copy-ok">已复制</span> : <IconCopy size={15} />}
      </button>
    </div>
  );
}

export default function PortalDocsPage() {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-host";
  const [models, setModels] = useState<ModelItem[]>([]);

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

  const openaiBase = `${origin}/v1`;
  const modelsEndpoint = `GET ${openaiBase}/models`;
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

  return (
    <div className="portal-page portal-docs-page">
      <div className="docs-hero">
        <h1>接入指南</h1>
        <p>任意 OpenAI / Anthropic 兼容 Agent 填入以下三项即可连接。</p>
      </div>

      <div className="docs-steps">
        <section className="docs-step">
          <span className="docs-step-n" aria-hidden>
            1
          </span>
          <div className="docs-step-body">
            <h3>Base URL</h3>
            <CopyField value={origin} ariaLabel="复制 Base URL" />
            <p className="docs-step-hint">
              Anthropic 协议填 <code>{origin}</code>；OpenAI 兼容协议填{" "}
              <code>{openaiBase}</code>
            </p>
          </div>
        </section>

        <section className="docs-step">
          <span className="docs-step-n" aria-hidden>
            2
          </span>
          <div className="docs-step-body">
            <div className="docs-step-head">
              <h3>API Key</h3>
              <Link to="/app/keys" className="docs-step-link">
                创建密钥 →
              </Link>
            </div>
            <div className="docs-copy-field docs-copy-field-static">
              <code>sk-sc-...</code>
            </div>
            <p className="docs-step-hint">控制台创建的 sk-sc- 密钥</p>
          </div>
        </section>

        <section className="docs-step">
          <span className="docs-step-n" aria-hidden>
            3
          </span>
          <div className="docs-step-body">
            <div className="docs-step-head">
              <h3>模型</h3>
              <Link to="/app/models" className="docs-step-link">
                全部模型 →
              </Link>
            </div>
            <CopyField
              value={modelsEndpoint}
              copyValue={`${openaiBase}/models`}
              ariaLabel="复制模型列表地址"
            />
            <p className="docs-step-hint">请求 model 字段使用下方 ID</p>
            {modelIds.length ? (
              <div className="docs-model-tags" aria-label="可用模型 ID">
                {modelIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="docs-model-tag"
                    title={`复制 ${id}`}
                    onClick={() => void navigator.clipboard.writeText(id)}
                  >
                    {id}
                  </button>
                ))}
              </div>
            ) : (
              <p className="docs-step-hint docs-step-empty">
                暂无已同步模型，请联系管理员在「模型管理」中同步后再试。
              </p>
            )}
          </div>
        </section>

        <section className="docs-step">
          <span className="docs-step-n" aria-hidden>
            4
          </span>
          <div className="docs-step-body">
            <div className="docs-step-head">
              <h3>请求示例</h3>
              <button
                type="button"
                className="docs-step-link docs-step-link-btn"
                onClick={() => void navigator.clipboard.writeText(curlExample)}
              >
                复制 curl
              </button>
            </div>
            <pre className="docs-code">{curlExample}</pre>
            <p className="docs-step-hint">
              OpenAI Chat Completions；将密钥与 model 替换为实际值
            </p>
          </div>
        </section>

        <section className="docs-step">
          <span className="docs-step-n" aria-hidden>
            5
          </span>
          <div className="docs-step-body">
            <div className="docs-step-head">
              <h3>客户端环境变量示例</h3>
              <button
                type="button"
                className="docs-step-link docs-step-link-btn"
                onClick={() => void navigator.clipboard.writeText(envExample)}
              >
                复制 JSON
              </button>
            </div>
            <pre className="docs-code">{envExample}</pre>
            <p className="docs-step-hint">
              适用于 Cursor / Continue 等读取{" "}
              <code>OPENAI_BASE_URL</code> 与 <code>OPENAI_API_KEY</code> 的客户端
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
