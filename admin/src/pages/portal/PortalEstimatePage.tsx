import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { portalApi } from "../../lib/api";
import { estimateCostUsd, formatPerMillion, type PortalModel } from "../../lib/portal-models";
import SoftSelect from "../../components/SoftSelect";

export default function PortalEstimatePage() {
  const [params] = useSearchParams();
  const [models, setModels] = useState<PortalModel[]>([]);
  const [modelId, setModelId] = useState(params.get("model") || "");
  const [prompt, setPrompt] = useState("1000");
  const [completion, setCompletion] = useState("1000");
  const [cache, setCache] = useState("0");
  const [error, setError] = useState("");

  useEffect(() => {
    portalApi<{ data: PortalModel[] }>("/models")
      .then((r) => {
        const live = (r.data ?? []).filter((m) => !m.retired);
        setModels(live);
        setModelId((cur) => cur || live[0]?.model || "");
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const model = useMemo(
    () => models.find((m) => m.model === modelId) ?? null,
    [models, modelId],
  );

  const promptN = Math.max(0, Number(prompt) || 0);
  const completionN = Math.max(0, Number(completion) || 0);
  const cacheN = Math.max(0, Number(cache) || 0);
  const cost = model ? estimateCostUsd(model, promptN, completionN, cacheN) : 0;

  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>计费预估</h1>
          <p>按模型单价估算一次调用要花多少。实际扣费以用量为准。</p>
        </div>
        <div className="portal-hero-actions">
          <Link className="portal-btn ghost" to="/app/models">
            模型广场
          </Link>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      {!models.length && !error ? (
        <div className="portal-empty">
          <strong>还没有可估的模型</strong>
          <p>管理员同步模型后即可在这里试算。</p>
        </div>
      ) : (
        <div className="portal-panel">
          <div className="portal-estimate-grid">
            <label className="stack-field">
              <span>模型</span>
              <SoftSelect
                ariaLabel="模型"
                value={modelId}
                onChange={setModelId}
                options={models.map((m) => ({ value: m.model, label: m.model }))}
              />
            </label>
            <label className="stack-field">
              <span>输入 tokens</span>
              <input
                inputMode="numeric"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
            <label className="stack-field">
              <span>输出 tokens</span>
              <input
                inputMode="numeric"
                value={completion}
                onChange={(e) => setCompletion(e.target.value)}
              />
            </label>
            <label className="stack-field">
              <span>缓存命中 tokens</span>
              <input
                inputMode="numeric"
                value={cache}
                onChange={(e) => setCache(e.target.value)}
              />
            </label>
          </div>

          {model ? (
            <>
              <p className="muted" style={{ marginTop: 8 }}>
                输入 {formatPerMillion(model.inputPer1m)} · 输出{" "}
                {formatPerMillion(model.outputPer1m)} · 缓存{" "}
                {formatPerMillion(model.cacheHitPer1m)}
              </p>
              <div className="portal-estimate-result">
                <span>预估费用</span>
                <strong>${cost.toFixed(6)}</strong>
              </div>
              <div className="portal-empty-actions" style={{ marginTop: 16 }}>
                <Link
                  className="portal-btn"
                  to={`/app/chat?model=${encodeURIComponent(model.model)}`}
                >
                  用这个模型试对话
                </Link>
                <Link className="portal-btn ghost" to="/app/recharge">
                  去买额度
                </Link>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
