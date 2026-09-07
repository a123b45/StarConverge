import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { portalApi } from "../../lib/api";
import {
  estimateCostUsd,
  formatPerMillion,
  type PortalModel,
  type PriceQuote,
} from "../../lib/portal-models";
import {
  OFFICIAL_VENDORS,
  compareCost,
  defaultVendorForModel,
  formatSavePct,
  formatUsd,
  vendorLabel,
  type OfficialQuote,
  type OfficialVendor,
} from "../../lib/official-pricing";
import SoftSelect from "../../components/SoftSelect";
import { IconTrendDown, IconTrendUp } from "../../components/icons";

function rateAmount(n: number) {
  return formatPerMillion(n).replace(/\s*\/\s*百万$/, "");
}

function priceDelta(ours: number, official: number): "down" | "up" | "same" {
  const gap = official - ours;
  if (!Number.isFinite(gap) || Math.abs(gap) < 0.00005) return "same";
  return gap > 0 ? "down" : "up";
}

function RateItem({
  label,
  value,
  versus,
}: {
  label: string;
  value: number;
  versus?: number;
}) {
  const delta = versus == null ? "same" : priceDelta(value, versus);
  return (
    <div className={`portal-estimate-rate-item${delta !== "same" ? ` is-${delta}` : ""}`}>
      <span>{label}</span>
      <strong>
        {rateAmount(value)}
        {delta === "down" ? (
          <IconTrendDown size={12} />
        ) : delta === "up" ? (
          <IconTrendUp size={12} />
        ) : null}
      </strong>
      <small>/ 百万 tokens</small>
    </div>
  );
}

function RateBoard({
  title,
  hint,
  quote,
  kind,
  versus,
}: {
  title: string;
  hint?: string;
  quote: PriceQuote;
  kind: "ours" | "official";
  versus?: PriceQuote | null;
}) {
  return (
    <div className={`portal-estimate-rate ${kind}`}>
      <div className="portal-estimate-rate-head">
        <span>{title}</span>
        {hint ? <em>{hint}</em> : null}
      </div>
      <div className="portal-estimate-rate-items">
        <RateItem
          label="输入"
          value={quote.inputPer1m}
          versus={versus?.inputPer1m}
        />
        <RateItem
          label="输出"
          value={quote.outputPer1m}
          versus={versus?.outputPer1m}
        />
        <RateItem
          label="缓存"
          value={quote.cacheHitPer1m}
          versus={versus?.cacheHitPer1m}
        />
      </div>
    </div>
  );
}

type OfficialCatalog = {
  source?: string;
  fetchedAt?: string | null;
  vendors?: Array<{ id: OfficialVendor; label: string }>;
  data: OfficialQuote[];
};

export default function PortalEstimatePage() {
  const [params] = useSearchParams();
  const [models, setModels] = useState<PortalModel[]>([]);
  const [catalog, setCatalog] = useState<OfficialQuote[]>([]);
  const [vendorLabels, setVendorLabels] = useState(OFFICIAL_VENDORS);
  const [modelId, setModelId] = useState(params.get("model") || "");
  const [vendor, setVendor] = useState<OfficialVendor>("anthropic");
  const [officialId, setOfficialId] = useState("");
  const [prompt, setPrompt] = useState("1000");
  const [completion, setCompletion] = useState("1000");
  const [cache, setCache] = useState("0");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      portalApi<{ data: PortalModel[] }>("/models"),
      portalApi<OfficialCatalog>("/official-prices"),
    ])
      .then(([modelsRes, pricesRes]) => {
        const live = (modelsRes.data ?? []).filter((m) => !m.retired);
        setModels(live);
        setModelId((cur) => cur || live[0]?.model || "");
        setCatalog(pricesRes.data ?? []);
        if (pricesRes.vendors?.length) setVendorLabels(pricesRes.vendors);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const model = useMemo(
    () => models.find((m) => m.model === modelId) ?? null,
    [models, modelId],
  );

  useEffect(() => {
    if (!model) return;
    const matched = model.official;
    const nextVendor = matched?.vendor ?? defaultVendorForModel(model.model);
    setVendor(nextVendor);
    setOfficialId(matched?.id ?? "");
  }, [model?.model]);

  const officialOptions = useMemo(
    () => catalog.filter((q) => q.vendor === vendor),
    [catalog, vendor],
  );
  const official =
    officialOptions.find((q) => q.id === officialId) ?? officialOptions[0] ?? null;

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
                options={vendorLabels.map((v) => ({ value: v.id, label: v.label }))}
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
              <div
                className={`portal-estimate-rates${official ? "" : " is-single"}`}
              >
                <RateBoard title="本站单价" quote={model} kind="ours" versus={official} />
                {official ? (
                  <RateBoard
                    title="官方单价"
                    hint={`${vendorLabel(official.vendor, official.vendorLabel)} · ${official.model}`}
                    quote={official}
                    kind="official"
                  />
                ) : null}
              </div>
              <div className="portal-estimate-compare">
                <div className="portal-estimate-result">
                  <span>本站预估</span>
                  <strong>{formatUsd(ours)}</strong>
                </div>
                <div className="portal-estimate-result official">
                  <span>官方预估</span>
                  <strong>{cmp ? formatUsd(cmp.official) : "—"}</strong>
                </div>
                <div className={`portal-estimate-result save${cmp?.cheaper ? " is-win" : cmp ? " is-loss" : ""}`}>
                  <span>{cmp?.cheaper ? "这次少花" : "差额"}</span>
                  <strong>
                    {cmp?.cheaper ? <IconTrendDown size={18} /> : cmp ? <IconTrendUp size={18} /> : null}
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
              <div className="portal-empty-actions" style={{ marginTop: 16 }}>
                <Link
                  className="portal-btn"
                  to={`/app/chat?model=${encodeURIComponent(model.model)}`}
                >
                  用这个模型试对话
                </Link>
                <Link className="portal-btn ghost" to="/app/recharge">
                  去充值
                </Link>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
