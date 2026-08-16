import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatTokens } from "../lib/api";
import SoftSelect from "../components/SoftSelect";

type UsageSeg = {
  id: string;
  label: string;
  color: string;
  requests: number;
  tokens: number;
  costCny: number;
};

type UsageDay = {
  date: string;
  requests: number;
  tokens: number;
  costCny: number;
  segments: UsageSeg[];
};

type UsageData = {
  days: number;
  groupBy: "model" | "token";
  priceCnyPer1MTokens: number;
  summary: { requests: number; tokens: number; costCny: number };
  series: UsageDay[];
  entities: UsageSeg[];
};

type GroupBy = "model" | "token";
type SortMode = "time" | "tokens";
type Metric = "tokens" | "cost";

function fmtCny(n: number) {
  return `¥${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function shortDate(iso: string) {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}` : iso;
}

function niceMax(peak: number) {
  if (peak <= 0) return 1;
  if (peak <= 5) return 5;
  const exp = 10 ** Math.floor(Math.log10(peak));
  const f = peak / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function formatY(n: number, metric: Metric) {
  if (metric === "cost") {
    if (n >= 10) return n.toFixed(0);
    if (n >= 1) return n.toFixed(1);
    return n.toFixed(2);
  }
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [days, setDays] = useState(30);
  const [groupBy, setGroupBy] = useState<GroupBy>("token");
  const [sortMode, setSortMode] = useState<SortMode>("time");
  const [metric, setMetric] = useState<Metric>("tokens");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api<UsageData>(
        `/usage?${new URLSearchParams({
          days: String(days),
          groupBy,
        })}`,
      );
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, groupBy]);

  const timeBars = useMemo(() => {
    const series = data?.series ?? [];
    if (sortMode !== "time") return [];
    const ordered = [...series];
    // 时间降序：右侧最新（先正序再展示，阅读更自然）；降序选项把最新放左侧
    return ordered.reverse();
  }, [data, sortMode]);

  const entityBars = useMemo(() => {
    if (sortMode !== "tokens") return [];
    return [...(data?.entities ?? [])].sort((a, b) => b.tokens - a.tokens);
  }, [data, sortMode]);

  const peak = useMemo(() => {
    if (sortMode === "tokens") {
      return Math.max(
        0,
        ...entityBars.map((e) => (metric === "cost" ? e.costCny : e.tokens)),
      );
    }
    return Math.max(
      0,
      ...timeBars.map((d) => (metric === "cost" ? d.costCny : d.tokens)),
    );
  }, [sortMode, entityBars, timeBars, metric]);

  const yMax = useMemo(() => niceMax(peak), [peak]);
  const yTicks = useMemo(() => [yMax, yMax / 2, 0], [yMax]);

  const chartTitle = useMemo(() => {
    if (!data) return metric === "cost" ? "消费金额 (CNY)" : "Tokens";
    if (metric === "cost") {
      return `消费金额 (CNY) ${fmtCny(data.summary.costCny)}`;
    }
    return `Tokens ${data.summary.tokens.toLocaleString()}`;
  }, [data, metric]);

  const showLabelsEvery = sortMode === "time" ? Math.max(1, Math.ceil(timeBars.length / 8)) : 1;

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>用量检测</h2>
          <p>按 API Key / 模型查看 Token 与消费估算，支持时间与用量排序</p>
        </div>
        <div className="row-actions">
          <SoftSelect
            className="soft-select-filter"
            ariaLabel="时间范围"
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={[
              { value: "7", label: "近 7 天" },
              { value: "14", label: "近 14 天" },
              { value: "30", label: "近 30 天" },
              { value: "60", label: "近 60 天" },
              { value: "90", label: "近 90 天" },
            ]}
          />
          <button className="btn ghost" onClick={() => void load()} disabled={loading}>
            {loading ? "刷新中…" : "刷新"}
          </button>
          <Link className="btn ghost" to="/admin/logs">
            请求日志
          </Link>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="grid-stats usage-summary-grid">
        <div className="stat">
          <div className="label">消费金额</div>
          <div className="value">{data ? fmtCny(data.summary.costCny) : "—"}</div>
          <div className="hint">
            估算 · ¥{data?.priceCnyPer1MTokens ?? 2}/百万 Tokens
          </div>
        </div>
        <div className="stat">
          <div className="label">API 请求次数</div>
          <div className="value">
            {data ? data.summary.requests.toLocaleString() : "—"}
          </div>
          <div className="hint">所选时间范围内</div>
        </div>
        <div className="stat">
          <div className="label">Tokens</div>
          <div className="value">
            {data ? data.summary.tokens.toLocaleString() : "—"}
          </div>
          <div className="hint">{data ? formatTokens(data.summary.tokens) : "—"}</div>
        </div>
      </div>

      <div className="panel usage-chart-panel">
        <div className="panel-head usage-chart-head">
          <strong>{chartTitle}</strong>
          <div className="usage-chart-tools">
            <SoftSelect
              className="soft-select-sm soft-select-filter"
              ariaLabel="图表指标"
              value={metric}
              onChange={(v) => setMetric(v as Metric)}
              options={[
                { value: "tokens", label: "Tokens" },
                { value: "cost", label: "消费金额" },
              ]}
            />
            <SoftSelect
              className="soft-select-sm soft-select-filter"
              ariaLabel="排序"
              value={sortMode}
              onChange={(v) => setSortMode(v as SortMode)}
              options={[
                { value: "time", label: "按时间降序" },
                { value: "tokens", label: "按 Token 降序" },
              ]}
            />
            <div className="usage-seg" role="tablist" aria-label="分组维度">
              <button
                type="button"
                className={groupBy === "model" ? "on" : ""}
                onClick={() => setGroupBy("model")}
              >
                模型
              </button>
              <button
                type="button"
                className={groupBy === "token" ? "on" : ""}
                onClick={() => setGroupBy("token")}
              >
                API Key
              </button>
            </div>
          </div>
        </div>

        <div className="usage-chart-body">
          {!data || (sortMode === "time" ? timeBars.length === 0 : entityBars.length === 0) ? (
            <div className="empty">所选范围内暂无用量数据</div>
          ) : sortMode === "time" ? (
            <div className="usage-chart">
              <div className="usage-y" aria-hidden>
                {yTicks.map((t, i) => (
                  <span key={`y-${i}`}>{formatY(t, metric)}</span>
                ))}
              </div>
              <div className="usage-plot">
                <div className="usage-grid" aria-hidden>
                  <i />
                  <i />
                  <i />
                </div>
                <div className="usage-bars">
                  {timeBars.map((day, idx) => {
                    const total = metric === "cost" ? day.costCny : day.tokens;
                    const heightPct = total > 0 ? Math.max(4, (total / yMax) * 100) : 0;
                    const showLabel =
                      idx === 0 ||
                      idx === timeBars.length - 1 ||
                      idx % showLabelsEvery === 0;
                    return (
                      <div
                        key={day.date}
                        className={`usage-col${total === 0 ? " is-zero" : ""}`}
                      >
                        <div className="usage-hit">
                          <div
                            className="usage-stack"
                            style={{ height: `${heightPct}%` }}
                          >
                            {day.segments.map((s) => {
                              const v = metric === "cost" ? s.costCny : s.tokens;
                              const share = total > 0 ? (v / total) * 100 : 0;
                              if (share <= 0) return null;
                              return (
                                <div
                                  key={s.id}
                                  className="usage-seg-bar"
                                  style={{
                                    height: `${share}%`,
                                    background: s.color,
                                  }}
                                />
                              );
                            })}
                          </div>
                          <div className="usage-tip" role="tooltip">
                            <div className="usage-tip-head">
                              <strong>{day.date}</strong>
                              <span>
                                {metric === "cost"
                                  ? fmtCny(day.costCny)
                                  : day.tokens.toLocaleString()}
                              </span>
                            </div>
                            {day.segments.length ? (
                              day.segments.map((s) => (
                                <div className="usage-tip-row" key={s.id}>
                                  <i style={{ background: s.color }} />
                                  <em title={s.label}>{s.label}</em>
                                  <b>
                                    {metric === "cost"
                                      ? fmtCny(s.costCny)
                                      : s.tokens.toLocaleString()}
                                  </b>
                                </div>
                              ))
                            ) : (
                              <div className="usage-tip-row">
                                <em>无调用</em>
                              </div>
                            )}
                            <div className="usage-tip-foot">
                              请求 {day.requests.toLocaleString()} 次
                            </div>
                          </div>
                        </div>
                        <span className={showLabel ? "" : "is-hidden"}>
                          {showLabel ? shortDate(day.date) : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="usage-chart">
              <div className="usage-y" aria-hidden>
                {yTicks.map((t, i) => (
                  <span key={`ey-${i}`}>{formatY(t, metric)}</span>
                ))}
              </div>
              <div className="usage-plot">
                <div className="usage-grid" aria-hidden>
                  <i />
                  <i />
                  <i />
                </div>
                <div className="usage-bars usage-bars-entity">
                  {entityBars.map((e) => {
                    const total = metric === "cost" ? e.costCny : e.tokens;
                    const heightPct = total > 0 ? Math.max(4, (total / yMax) * 100) : 0;
                    return (
                      <div key={e.id} className="usage-col">
                        <div className="usage-hit">
                          <div
                            className="usage-stack"
                            style={{ height: `${heightPct}%` }}
                          >
                            <div
                              className="usage-seg-bar"
                              style={{ height: "100%", background: e.color }}
                            />
                          </div>
                          <div className="usage-tip" role="tooltip">
                            <div className="usage-tip-head">
                              <strong title={e.label}>{e.label}</strong>
                              <span>
                                {metric === "cost"
                                  ? fmtCny(e.costCny)
                                  : e.tokens.toLocaleString()}
                              </span>
                            </div>
                            <div className="usage-tip-row">
                              <i style={{ background: e.color }} />
                              <em>请求</em>
                              <b>{e.requests.toLocaleString()} 次</b>
                            </div>
                          </div>
                        </div>
                        <span title={e.label}>{e.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {(data?.entities.length ?? 0) > 0 ? (
          <div className="usage-legend">
            {data!.entities.slice(0, 12).map((e) => (
              <span key={e.id} className="usage-legend-item" title={e.label}>
                <i style={{ background: e.color }} />
                {e.label}
              </span>
            ))}
            {data!.entities.length > 12 ? (
              <span className="muted">+{data!.entities.length - 12}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
