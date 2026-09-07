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
  formatSavePct,
  formatUsd,
  quotesForSameModel,
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

function barShare(ours: number, official: number): { ours: number; official: number } {
  const a = Math.max(0, ours);
  const b = Math.max(0, official);
  const sum = a + b;
  if (sum <= 0) return { ours: 50, official: 50 };
  return { ours: (a / sum) * 100, official: (b / sum) * 100 };
}

function TrendMark({ dir }: { dir: "down" | "up" | "same" }) {
  if (dir === "same") return <span className="est-mark is-same">持平</span>;
  return (
    <span className={`est-mark is-${dir}`}>
      {dir === "down" ? <IconTrendDown size={11} /> : <IconTrendUp size={11} />}
    </span>
  );
}

function CompareBar({
  label,
  ours,
  official,
  money,
}: {
  label: string;
  ours: number;
  official: number;
  money?: boolean;
}) {
  const share = barShare(ours, official);
  const dir = priceDelta(ours, official);
  const pct =
    official > 0 ? Math.round(((official - ours) / official) * 100) : null;
  const fmt = (n: number) => (money ? formatUsd(n) : rateAmount(n));
  return (
    <div className={`est-bar${money ? " is-total" : ""}`}>
      <div className="est-bar-label">
        <strong>{label}</strong>
        {money ? null : <small>/ 百万 tokens</small>}
      </div>
      <div
        className="est-bar-track"
        role="img"
        aria-label={`${label} 本站 ${fmt(ours)}，官方 ${fmt(official)}`}
      >
        <div className="est-seg is-ours" style={{ flexGrow: share.ours }} />
        <div className="est-seg is-official" style={{ flexGrow: share.official }} />
        <span className="est-bar-val is-ours">{fmt(ours)}</span>
        <span className="est-bar-val is-official">{fmt(official)}</span>
      </div>
      <div className={`est-bar-delta is-${dir}`}>
        <TrendMark dir={dir} />
        {dir === "down" && pct != null ? <em>低 {Math.abs(pct)}%</em> : null}
        {dir === "up" && pct != null ? <em>高 {Math.abs(pct)}%</em> : null}
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
  const [vendor, setVendor] = useState<OfficialVendor | "">("");
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

  const matchedQuotes = useMemo(() => {
    if (!model) return [];
    return quotesForSameModel(catalog, model.model, [
      model.rewriteModel,
      model.official?.id,
      model.official?.model,
    ]);
  }, [catalog, model]);

  const vendorOptions = useMemo(() => {
    const seen = new Set<OfficialVendor>();
    const rows: Array<{ id: OfficialVendor; label: string }> = [];
    for (const q of matchedQuotes) {
      if (seen.has(q.vendor)) continue;
      seen.add(q.vendor);
      rows.push({
        id: q.vendor,
        label: vendorLabel(
          q.vendor,
          q.vendorLabel || vendorLabels.find((v) => v.id === q.vendor)?.label,
        ),
      });
    }
    return rows;
  }, [matchedQuotes, vendorLabels]);

  const resolvedVendor: OfficialVendor | "" =
    vendorOptions.some((v) => v.id === vendor)
      ? vendor
      : model?.official?.vendor &&
          vendorOptions.some((v) => v.id === model.official!.vendor)
        ? model.official.vendor
        : (vendorOptions[0]?.id ?? "");

  const official =
    matchedQuotes.find((q) => q.vendor === resolvedVendor) ??
    matchedQuotes[0] ??
    null;

  const promptN = Math.max(0, Number(prompt) || 0);
  const completionN = Math.max(0, Number(completion) || 0);
  const cacheN = Math.max(0, Number(cache) || 0);
  const ours = model ? estimateCostUsd(model, promptN, completionN, cacheN) : 0;
  const cmp =
    model && official ? compareCost(model, official, promptN, completionN, cacheN) : null;
  const tied = Boolean(cmp && Math.abs(cmp.saved) <= 0.0000005);

  return (
    <div className="portal-page est-page">
      <div className="est-hero">
        <p className="est-kicker">同模型 · 官方公开价</p>
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
                value={resolvedVendor}
                onChange={(v) => setVendor(v as OfficialVendor)}
                disabled={!vendorOptions.length}
                placeholder="官方没有此模型"
                options={vendorOptions.map((v) => ({ value: v.id, label: v.label }))}
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
              {official ? (
                <div className="est-arena">
                  <div className="est-legend">
                    <span>
                      <i className="est-dot ours" />
                      本站
                    </span>
                    <span>
                      <i className="est-dot official" />
                      官方 · {vendorLabel(official.vendor, official.vendorLabel)} · {official.model}
                    </span>
                  </div>
                  <div className="est-bars">
                    <CompareBar
                      label="输入"
                      ours={model.inputPer1m}
                      official={official.inputPer1m}
                    />
                    <CompareBar
                      label="输出"
                      ours={model.outputPer1m}
                      official={official.outputPer1m}
                    />
                    <CompareBar
                      label="缓存"
                      ours={model.cacheHitPer1m}
                      official={official.cacheHitPer1m}
                    />
                    <CompareBar
                      label="合计"
                      ours={ours}
                      official={cmp?.official ?? 0}
                      money
                    />
                  </div>
                </div>
              ) : (
                <div className="est-miss">
                  <strong>官方公开价里没有 {model.model}</strong>
                  <p>同模型才有对照必要，DeepSeek 官方不会出现 Claude 的标价。</p>
                </div>
              )}

              {cmp && tied ? (
                <div className="est-save is-tie">
                  <TrendMark dir="same" />
                  <div>
                    <strong>这次持平 {formatUsd(ours)}</strong>
                    <p>与官方同模型公开价相同</p>
                  </div>
                </div>
              ) : null}

              {cmp && !tied ? (
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
                        : `比官方公开价高 ${formatSavePct(-cmp.pct)}`}
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
