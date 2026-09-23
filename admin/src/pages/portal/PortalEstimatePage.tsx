import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { portalApi } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
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

function stripPerMillionSuffix(s: string) {
  return s.replace(/\s*\/\s*(百万|million tokens?)\s*$/i, "");
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
  const { t } = useI18n();
  if (dir === "same") return <span className="est-mark is-same">{t("est.even")}</span>;
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
  const { t } = useI18n();
  const share = barShare(ours, official);
  const dir = priceDelta(ours, official);
  const pct =
    official > 0 ? Math.round(((official - ours) / official) * 100) : null;
  const display = (n: number) =>
    money ? formatUsd(n) : stripPerMillionSuffix(formatPerMillion(n));
  return (
    <div className={`est-bar${money ? " is-total" : ""}`}>
      <div className="est-bar-label">
        <strong>{label}</strong>
        {money ? null : <small>{t("est.perMillion")}</small>}
      </div>
      <div
        className="est-bar-track"
        role="img"
        aria-label={t("est.barAria", { label, ours: display(ours), official: display(official) })}
      >
        <div className="est-seg is-ours" style={{ flexGrow: share.ours }} />
        <div className="est-seg is-official" style={{ flexGrow: share.official }} />
        <span className="est-bar-val is-ours">{display(ours)}</span>
        <span className="est-bar-val is-official">{display(official)}</span>
      </div>
      <div className={`est-bar-delta is-${dir}`}>
        <TrendMark dir={dir} />
        {dir === "down" && pct != null ? (
          <em>{t("est.lower", { pct: Math.abs(pct) })}</em>
        ) : null}
        {dir === "up" && pct != null ? (
          <em>{t("est.higher", { pct: Math.abs(pct) })}</em>
        ) : null}
      </div>
    </div>
  );
}

type OfficialCatalog = {
  vendors?: Array<{ id: OfficialVendor; label: string }>;
  data: OfficialQuote[];
};

export default function PortalEstimatePage() {
  const { t } = useI18n();
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
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("common.loadFail")));
  }, [t]);

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
        <p className="est-kicker">{t("est.kicker")}</p>
        <h1>{t("est.title")}</h1>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      {!models.length && !error ? (
        <div className="portal-empty">
          <strong>{t("est.emptyTitle")}</strong>
          <p>{t("est.emptyBody")}</p>
        </div>
      ) : (
        <div className="est-sheet">
          <div className="est-controls">
            <label className="stack-field">
              <span>{t("est.siteModel")}</span>
              <SoftSelect
                ariaLabel={t("est.siteModel")}
                value={modelId}
                onChange={setModelId}
                options={models.map((m) => ({ value: m.model, label: m.model }))}
              />
            </label>
            <label className="stack-field">
              <span>{t("est.officialChannel")}</span>
              <SoftSelect
                ariaLabel={t("est.officialChannel")}
                value={resolvedVendor}
                onChange={(v) => setVendor(v as OfficialVendor)}
                disabled={!vendorOptions.length}
                placeholder={t("est.noOfficial")}
                options={vendorOptions.map((v) => ({ value: v.id, label: v.label }))}
              />
            </label>
            <label className="stack-field">
              <span>{t("est.inputTokens")}</span>
              <input
                inputMode="numeric"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
            <label className="stack-field">
              <span>{t("est.outputTokens")}</span>
              <input
                inputMode="numeric"
                value={completion}
                onChange={(e) => setCompletion(e.target.value)}
              />
            </label>
            <label className="stack-field">
              <span>{t("est.cacheTokens")}</span>
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
                      {t("est.ours")}
                    </span>
                    <span>
                      <i className="est-dot official" />
                      {t("est.officialLegend", {
                        vendor: vendorLabel(official.vendor, official.vendorLabel),
                        model: official.model,
                      })}
                    </span>
                  </div>
                  <div className="est-bars">
                    <CompareBar
                      label={t("est.input")}
                      ours={model.inputPer1m}
                      official={official.inputPer1m}
                    />
                    <CompareBar
                      label={t("est.output")}
                      ours={model.outputPer1m}
                      official={official.outputPer1m}
                    />
                    <CompareBar
                      label={t("est.cache")}
                      ours={model.cacheHitPer1m}
                      official={official.cacheHitPer1m}
                    />
                    <CompareBar
                      label={t("est.total")}
                      ours={ours}
                      official={cmp?.official ?? 0}
                      money
                    />
                  </div>
                </div>
              ) : (
                <div className="est-miss">
                  <strong>{t("est.missTitle", { model: model.model })}</strong>
                </div>
              )}

              {cmp && tied ? (
                <div className="est-save is-tie">
                  <TrendMark dir="same" />
                  <div>
                    <strong>{t("est.tieTitle", { amount: formatUsd(ours) })}</strong>
                    <p>{t("est.tieBody")}</p>
                  </div>
                </div>
              ) : null}

              {cmp && !tied ? (
                <div className={`est-save${cmp.cheaper ? " is-win" : " is-loss"}`}>
                  <TrendMark dir={cmp.cheaper ? "down" : "up"} />
                  <div>
                    <strong>
                      {cmp.cheaper
                        ? t("est.saveTitle", { amount: formatUsd(Math.abs(cmp.saved)) })
                        : t("est.spendTitle", { amount: formatUsd(Math.abs(cmp.saved)) })}
                    </strong>
                    <p>
                      {cmp.cheaper
                        ? t("est.saveBody", { pct: formatSavePct(cmp.pct) })
                        : t("est.spendBody", { pct: formatSavePct(-cmp.pct) })}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="est-actions">
                <Link
                  className="portal-btn"
                  to={`/app/chat?model=${encodeURIComponent(model.model)}`}
                >
                  {t("est.tryChat")}
                </Link>
                <Link className="portal-btn ghost" to="/app/recharge">
                  {t("est.goRecharge")}
                </Link>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
