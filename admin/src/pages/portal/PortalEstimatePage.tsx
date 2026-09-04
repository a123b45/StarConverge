import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { portalApi } from "../../lib/api";
import { estimateCostUsd, formatPerMillion, type PortalModel } from "../../lib/portal-models";
import {
  OFFICIAL_VENDORS,
  compareCost,
  defaultVendorForModel,
  formatSavePct,
  formatUsd,
  matchOfficialQuote,
  quotesForVendor,
  vendorLabel,
  type OfficialVendor,
} from "../../lib/official-pricing";
import SoftSelect from "../../components/SoftSelect";

export default function PortalEstimatePage() {
  const [params] = useSearchParams();
  const [models, setModels] = useState<PortalModel[]>([]);
  const [modelId, setModelId] = useState(params.get("model") || "");
  const [vendor, setVendor] = useState<OfficialVendor>("anthropic");
  const [officialId, setOfficialId] = useState("");
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

  useEffect(() => {
    if (!model) return;
    const matched = matchOfficialQuote(model.model);
    const nextVendor = matched?.vendor ?? defaultVendorForModel(model.model);
    setVendor(nextVendor);
    const list = quotesForVendor(nextVendor);
    const pick = list.find((q) => q.id === matched?.id) ?? list[0];
    setOfficialId(pick?.id ?? "");
  }, [model?.model]);

  const officialOptions = useMemo(() => quotesForVendor(vendor), [vendor]);
  const official = officialOptions.find((q) => q.id === officialId) ?? officialOptions[0] ?? null;

  useEffect(() => {
    if (!officialOptions.length) return;
    if (!officialOptions.some((q) => q.id === officialId)) {
      setOfficialId(officialOptions[0]!.id);
    }
  }, [vendor, officialId, officialOptions]);

  const promptN = Math.max(0, Number(prompt) || 0);
  const completionN = Math.max(0, Number(completion) || 0);
  const cacheN = Math.max(0, Number(cache) || 0);
  const ours = model ? estimateCostUsd(model, promptN, completionN, cacheN) : 0;
  const cmp =
    model && official ? compareCost(model, official, promptN, completionN, cacheN) : null;

  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>计费预估</h1>
          <p>用同一段 tokens 算本站费用，再对照厂商官方公开价，看这次能少花多少。</p>
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
              <span>本站模型</span>
              <SoftSelect
                ariaLabel="本站模型"
                value={modelId}
                onChange={setModelId}
                options={models.map((m) => ({ value: m.model, label: m.model }))}
              />
            </label>
            <label className="stack-field">
              <span>对照官方渠道</span>
              <SoftSelect
                ariaLabel="官方渠道"
                value={vendor}
                onChange={(v) => setVendor(v as OfficialVendor)}
                options={OFFICIAL_VENDORS.map((v) => ({ value: v.id, label: v.label }))}
              />
            </label>
            <label className="stack-field">
              <span>官方模型标价</span>
              <SoftSelect
                ariaLabel="官方模型"
                value={official?.id ?? ""}
                onChange={setOfficialId}
                options={officialOptions.map((q) => ({
                  value: q.id,
                  label: `${q.model} · ${formatPerMillion(q.inputPer1m)}`,
                }))}
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
                本站 输入 {formatPerMillion(model.inputPer1m)} · 输出{" "}
                {formatPerMillion(model.outputPer1m)} · 缓存{" "}
                {formatPerMillion(model.cacheHitPer1m)}
                {official
                  ? ` ｜ ${vendorLabel(official.vendor)} ${official.model} 输入 ${formatPerMillion(official.inputPer1m)} · 输出 ${formatPerMillion(official.outputPer1m)}`
                  : ""}
              </p>
              <div className="portal-estimate-compare">
                <div className="portal-estimate-result">
                  <span>本站预估</span>
                  <strong>{formatUsd(ours)}</strong>
                </div>
                <div className="portal-estimate-result official">
                  <span>官方预估</span>
                  <strong>{cmp ? formatUsd(cmp.official) : "—"}</strong>
                </div>
                <div className={`portal-estimate-result save${cmp?.cheaper ? " is-win" : ""}`}>
                  <span>{cmp?.cheaper ? "这次少花" : "差额"}</span>
                  <strong>
                    {cmp
                      ? `${cmp.cheaper ? "−" : "+"}${formatUsd(Math.abs(cmp.saved))}`
                      : "—"}
                  </strong>
                  {cmp?.cheaper ? (
                    <em>比官方少 {formatSavePct(cmp.pct)}</em>
                  ) : (
                    <em>换一个官方模型再比一次</em>
                  )}
                </div>
              </div>
              <p className="muted" style={{ marginTop: 10 }}>
                官方数字按厂商公开标价估算，方便对照；实际扣费以本站用量为准。
              </p>
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
