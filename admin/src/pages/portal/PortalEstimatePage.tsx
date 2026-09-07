import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { portalApi } from "../../lib/api";
import {
  estimateCostUsd,
  formatPerMillion,
  type PortalModel,
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

function TrendMark({ dir }: { dir: "down" | "up" | "same" }) {
  if (dir === "same") return <span className="est-mark is-same">持平</span>;
  return (
    <span className={`est-mark is-${dir}`}>
      {dir === "down" ? <IconTrendDown size={11} /> : <IconTrendUp size={11} />}
    </span>
  );
}

function CompareRow({
  label,
  ours,
  official,
  money,
}: {
  label: string;
  ours: number | null;
  official: number | null;
  money?: boolean;
}) {
  const delta =
    ours == null || official == null ? "same" : priceDelta(ours, official);
  const pct =
    ours != null && official && official > 0
      ? Math.round(((official - ours) / official) * 100)
      : null;
  const fmt = (n: number) => (money ? formatUsd(n) : rateAmount(n));
  return (
    <div className={`est-row${money ? " is-total" : ""}`}>
      <div className="est-label">{label}</div>
      <div className="est-cell ours">
        <strong>{ours == null ? "—" : fmt(ours)}</strong>
        {money ? null : <small>/ 百万 tokens</small>}
      </div>
      <div className="est-cell official">
        <strong>{official == null ? "—" : fmt(official)}</strong>
        {money ? null : <small>/ 百万 tokens</small>}
      </div>
      <div className={`est-delta is-${delta}`}>
        <TrendMark dir={delta} />
        {delta === "down" && pct != null ? <em>低 {Math.abs(pct)}%</em> : null}
        {delta === "up" && pct != null ? <em>高 {Math.abs(pct)}%</em> : null}
      </div>
    </div>
  );
}

type OfficialCatalog = {
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
    <div className="portal-page est-page">
      <div className="est-hero">
        <p className="est-kicker">本站 · 官方公开价</p>
        <h1>计费预估</h1>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      {!models.length && !error ? (
        <div className="portal-empty">
          <strong>还没有可估的模型</strong>
          <p>管理员同步模型后即可在这里试算。</p>
        </div>
      ) : (
        <div className="est-sheet">
          <div className="est-controls">
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
              <div className="est-board">
                <div className="est-row est-head">
                  <div className="est-label" />
                  <div className="est-cell ours">
                    <span className="est-col">
                      <i className="est-dot ours" />
                      本站
                    </span>
                  </div>
                  <div className="est-cell official">
                    <span className="est-col">
                      <i className="est-dot official" />
                      官方
                    </span>
                    {official ? (
                      <small>
                        {vendorLabel(official.vendor, official.vendorLabel)} · {official.model}
                      </small>
                    ) : null}
                  </div>
                  <div className="est-delta">对比</div>
                </div>
                <CompareRow
                  label="输入"
                  ours={model.inputPer1m}
                  official={official?.inputPer1m ?? null}
                />
                <CompareRow
                  label="输出"
                  ours={model.outputPer1m}
                  official={official?.outputPer1m ?? null}
                />
                <CompareRow
                  label="缓存"
                  ours={model.cacheHitPer1m}
                  official={official?.cacheHitPer1m ?? null}
                />
                <CompareRow
                  label="合计"
                  ours={ours}
                  official={cmp?.official ?? null}
                  money
                />
              </div>

              {cmp ? (
                <div className={`est-save${cmp.cheaper ? " is-win" : " is-loss"}`}>
                  <TrendMark dir={cmp.cheaper ? "down" : "up"} />
                  <div>
                    <strong>
                      {cmp.cheaper ? "这次少花" : "这次多花"}{" "}
                      {formatUsd(Math.abs(cmp.saved))}
                    </strong>
                    <p>
                      {cmp.cheaper
                        ? `比官方公开价低 ${formatSavePct(cmp.pct)}`
                        : "换一个官方模型再比一次"}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="est-actions">
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
