import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import SoftSelect from "../components/SoftSelect";

type Grain = "hour" | "minute" | "day";

type TrendPoint = { hour: string; requests: number; tokens: number };

type Dashboard = {
  last24h: { requests: number; tokens: number; errors: number };
  allTime: { requests: number; tokens: number };
  counts: {
    channels: number;
    channelsEnabled: number;
    tokens: number;
    tokensEnabled: number;
    models: number;
  };
  byModel: Array<{ model: string; requests: number; tokens: number }>;
  grain?: Grain;
  hourly: TrendPoint[];
  trend?: TrendPoint[];
  modelTrend?: Array<{ model: string; series: TrendPoint[] }>;
};

const GRAIN_OPTIONS = [
  { value: "hour", label: "按小时" },
  { value: "minute", label: "按分钟" },
  { value: "day", label: "按天" },
];

const MODEL_COLORS = [
  "#4f6ef7",
  "#d4a017",
  "#22c3a6",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#84cc16",
  "#6366f1",
];

function colorForModel(_model: string, index: number) {
  return MODEL_COLORS[index % MODEL_COLORS.length]!;
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [grain, setGrain] = useState<Grain>("hour");
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());
  const [pieHover, setPieHover] = useState<{
    model: string;
    pct: number;
    requests: number;
    color: string;
    side: "left" | "right";
  } | null>(null);
  const [lineHover, setLineHover] = useState<{
    hour: string;
    model: string;
    tokens: number;
    color: string;
    x: number;
    y: number;
    side: "left" | "right";
  } | null>(null);

  const endpoint = `${window.location.origin}/v1`;

  useEffect(() => {
    setError("");
    setHiddenModels(new Set());
    api<Dashboard>(`/dashboard?grain=${grain}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [grain]);

  const trend = data?.trend ?? data?.hourly ?? [];
  const peakRequests = useMemo(
    () => Math.max(0, ...trend.map((h) => h.requests)),
    [trend],
  );
  const yMax = useMemo(() => niceAxisMax(peakRequests), [peakRequests]);
  const yTicks = useMemo(() => [yMax, Math.round(yMax / 2), 0], [yMax]);
  const xLabels = useMemo(
    () =>
      trend
        .map((h, i) => ({
          i,
          text: formatTrendLabel(h.hour, grain),
          show: shouldShowTrendLabel(i, trend.length, grain),
        }))
        .filter((x) => x.show),
    [trend, grain],
  );

  const pie = useMemo(() => {
    const rows = data?.byModel ?? [];
    const total = rows.reduce((s, r) => s + r.requests, 0);
    if (!total) {
      return {
        total: 0,
        items: [] as Array<{
          model: string;
          requests: number;
          pct: number;
          color: string;
          start: number;
          end: number;
        }>,
      };
    }
    let acc = 0;
    const items = rows.map((r, i) => {
      const pct = (r.requests / total) * 100;
      const start = acc;
      acc += pct;
      return {
        model: r.model,
        requests: r.requests,
        pct,
        color: colorForModel(r.model, i),
        start,
        end: acc,
      };
    });
    return { total, items };
  }, [data]);

  const modelSeries = useMemo(() => {
    const list = data?.modelTrend ?? [];
    return list.map((m, i) => ({
      model: m.model,
      color: colorForModel(m.model, i),
      series: m.series,
      totalTokens: m.series.reduce((s, p) => s + p.tokens, 0),
    }));
  }, [data]);

  const visibleModels = useMemo(
    () => modelSeries.filter((m) => !hiddenModels.has(m.model)),
    [modelSeries, hiddenModels],
  );

  const tokenChart = useMemo(() => {
    const buckets = trend.map((t) => t.hour);
    const w = 520;
    const h = 240;
    const padL = 40;
    const padR = 16;
    const padT = 18;
    const padB = 32;
    const peak = Math.max(
      1,
      ...visibleModels.flatMap((m) => m.series.map((p) => p.tokens)),
    );
    const yMaxLocal = niceAxisMax(peak);
    const yTicksLocal = [yMaxLocal, Math.round(yMaxLocal / 2), 0];
    const n = Math.max(1, buckets.length);

    const xAt = (i: number) =>
      padL + (n === 1 ? (w - padL - padR) / 2 : (i / (n - 1)) * (w - padL - padR));
    const yAt = (tokens: number) =>
      padT + (1 - tokens / yMaxLocal) * (h - padT - padB);

    const lines = visibleModels.map((m) => {
      const points = buckets.map((hour, i) => {
        const pt = m.series.find((s) => s.hour === hour) ?? {
          hour,
          tokens: 0,
          requests: 0,
        };
        return {
          i,
          x: xAt(i),
          y: yAt(pt.tokens),
          hour,
          tokens: pt.tokens,
          model: m.model,
          color: m.color,
        };
      });
      return {
        model: m.model,
        color: m.color,
        polyline: points.map((p) => `${p.x},${p.y}`).join(" "),
        points,
      };
    });

    const labelStep = Math.max(1, Math.ceil(n / 7));
    const labels = buckets
      .map((hour, i) => ({
        i,
        x: xAt(i),
        text: formatTrendLabel(hour, grain),
        show: i === 0 || i === n - 1 || i % labelStep === 0,
      }))
      .filter((l) => l.show);

    return { w, h, padL, padT, padB, yMaxLocal, yTicksLocal, lines, labels, n };
  }, [trend, visibleModels, grain]);

  function toggleModel(model: string) {
    setHiddenModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }

  async function copyEndpoint() {
    await navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>控制台</h2>
          <p>近 24 小时流量、资源规模与调用趋势</p>
        </div>
        <div className="copy-inline">
          <code className="mono" style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
            {endpoint}
          </code>
          <button className="btn ghost sm" onClick={copyEndpoint}>
            {copied ? "已复制" : "复制 Base URL"}
          </button>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="grid-stats">
        <div className="stat">
          <div className="label">24h 请求</div>
          <div className="value">{fmt(data?.last24h.requests)}</div>
          <div className="hint">错误 {fmt(data?.last24h.errors)}</div>
        </div>
        <div className="stat">
          <div className="label">24h Tokens</div>
          <div className="value">{fmt(data?.last24h.tokens)}</div>
          <div className="hint">累计 {fmt(data?.allTime.tokens)}</div>
        </div>
        <div className="stat">
          <div className="label">供应商</div>
          <div className="value">
            {data ? `${data.counts.channelsEnabled}/${data.counts.channels}` : "—"}
          </div>
          <div className="hint">启用 / 全部</div>
        </div>
        <div className="stat">
          <div className="label">密钥</div>
          <div className="value">
            {data ? `${data.counts.tokensEnabled}/${data.counts.tokens}` : "—"}
          </div>
          <div className="hint">启用 / 全部</div>
        </div>
        <div className="stat">
          <div className="label">路由</div>
          <div className="value">{fmt(data?.counts.models)}</div>
          <div className="hint">已启用路由</div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="panel">
          <div className="panel-head">
            <strong>调用趋势</strong>
            <SoftSelect
              className="soft-select-sm soft-select-filter dash-grain-select"
              ariaLabel="趋势粒度"
              value={grain}
              options={GRAIN_OPTIONS}
              onChange={(v) => setGrain(v as Grain)}
            />
          </div>
          <div style={{ padding: "12px 16px 16px" }}>
            {trend.length > 0 ? (
              <div className="trend-chart">
                <div className="trend-y" aria-hidden>
                  {yTicks.map((t) => (
                    <span key={`y-${t}`}>{t}</span>
                  ))}
                </div>
                <div className="trend-plot">
                  <div className="trend-grid" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="trend-bars">
                    {trend.map((h, idx) => {
                      const pct =
                        h.requests > 0 ? Math.max(4, (h.requests / yMax) * 100) : 0;
                      const side =
                        idx / Math.max(trend.length - 1, 1) < 0.55
                          ? "tip-right"
                          : "tip-left";
                      return (
                        <div
                          key={h.hour}
                          className={`trend-col${h.requests === 0 ? " is-zero" : ""}`}
                        >
                          <div className="trend-hit">
                            <div className="trend-bar" style={{ height: `${pct}%` }} />
                            <div className={`trend-tip ${side}`} role="tooltip">
                              <strong>{h.hour}</strong>
                              <em>
                                {h.requests} 次 · {h.tokens.toLocaleString()} tokens
                              </em>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="trend-x" aria-hidden>
                    {xLabels.map((x) => (
                      <span
                        key={`x-${x.i}`}
                        style={{
                          left: `${((x.i + 0.5) / Math.max(trend.length, 1)) * 100}%`,
                        }}
                      >
                        {x.text}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty">暂无趋势数据，产生调用后将在此展示</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <strong>调用分布</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              近 24h 按模型
            </span>
          </div>
          {pie.total > 0 ? (
            <div className="dash-donut-wrap">
              <div className="dash-donut-stage">
                <svg viewBox="0 0 120 120" className="dash-donut-svg">
                  {pie.items.map((it) => {
                    const r = 42;
                    const c = 2 * Math.PI * r;
                    const len = (it.pct / 100) * c;
                    const offset = (it.start / 100) * c;
                    const midPct = (it.start + it.end) / 2;
                    const side: "left" | "right" = midPct < 50 ? "right" : "left";
                    return (
                      <circle
                        key={it.model}
                        className="dash-donut-seg"
                        cx="60"
                        cy="60"
                        r={r}
                        fill="none"
                        stroke={it.color}
                        strokeWidth="16"
                        strokeDasharray={`${len} ${c - len}`}
                        strokeDashoffset={-offset}
                        transform="rotate(-90 60 60)"
                        onMouseEnter={() =>
                          setPieHover({
                            model: it.model,
                            pct: it.pct,
                            requests: it.requests,
                            color: it.color,
                            side,
                          })
                        }
                        onMouseLeave={() => setPieHover(null)}
                      />
                    );
                  })}
                  <circle cx="60" cy="60" r="30" fill="var(--bg-elevated)" />
                </svg>
                {pieHover ? (
                  <div className={`dash-donut-tip tip-${pieHover.side}`}>
                    <i style={{ background: pieHover.color }} />
                    <div className="dash-donut-tip-body">
                      <strong>{pieHover.model}</strong>
                      <span>
                        {pieHover.pct.toFixed(1)}% · {pieHover.requests} 次
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="dash-pie-legend">
                {pie.items.map((it) => (
                  <div key={it.model} className="dash-pie-row" title={it.model}>
                    <i style={{ background: it.color }} />
                    <span className="mono">{it.model}</span>
                    <b>{it.pct.toFixed(1)}%</b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty">暂无调用分布</div>
          )}
        </div>
      </div>

      <div className="dash-grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-head">
            <strong>Token 趋势</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              按模型 · 峰值 {tokenChart.yMaxLocal.toLocaleString()}
            </span>
          </div>
          {modelSeries.length > 0 && trend.length > 0 ? (
            <div className="dash-mline-wrap">
              <div className="dash-mline-chart">
                <svg
                  className="dash-mline-svg"
                  viewBox={`0 0 ${tokenChart.w} ${tokenChart.h}`}
                  preserveAspectRatio="xMidYMid meet"
                  onMouseLeave={() => setLineHover(null)}
                >
                {tokenChart.yTicksLocal.map((t, i) => {
                  const y =
                    tokenChart.padT +
                    (i / Math.max(tokenChart.yTicksLocal.length - 1, 1)) *
                      (tokenChart.h - tokenChart.padT - tokenChart.padB);
                  return (
                    <g key={`gy-${i}`}>
                      <line
                        x1={tokenChart.padL}
                        x2={tokenChart.w - 12}
                        y1={y}
                        y2={y}
                        stroke="var(--line)"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                      />
                      <text
                        x={tokenChart.padL - 6}
                        y={y + 3}
                        textAnchor="end"
                        fontSize="10"
                        fill="var(--muted)"
                      >
                        {formatCompact(t)}
                      </text>
                    </g>
                  );
                })}
                {tokenChart.lines.map((line) => (
                  <g key={line.model}>
                    <polyline
                      fill="none"
                      stroke={line.color}
                      strokeWidth="2.4"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={line.polyline}
                    />
                    {line.points.map((p) => (
                      <circle
                        key={`${line.model}-${p.hour}`}
                        cx={p.x}
                        cy={p.y}
                        r="4"
                        fill="#fff"
                        stroke={line.color}
                        strokeWidth="2"
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() =>
                          setLineHover({
                            hour: p.hour,
                            model: p.model,
                            tokens: p.tokens,
                            color: p.color,
                            x: p.x,
                            y: p.y,
                            side: p.i / Math.max(tokenChart.n - 1, 1) < 0.55 ? "right" : "left",
                          })
                        }
                      />
                    ))}
                  </g>
                ))}
              </svg>
              {lineHover ? (
                <div
                  className={`dash-mline-tip tip-${lineHover.side}`}
                  style={{
                    left: `${(lineHover.x / tokenChart.w) * 100}%`,
                    top: `${(lineHover.y / tokenChart.h) * 100}%`,
                  }}
                >
                  <strong>{formatTrendLabel(lineHover.hour, grain)}</strong>
                  <div className="dash-mline-tip-row">
                    <i style={{ background: lineHover.color }} />
                    <em>{lineHover.model}</em>
                    <b>{lineHover.tokens.toLocaleString()} tokens</b>
                  </div>
                </div>
              ) : null}
              <div className="dash-mline-x">
                {tokenChart.labels.map((l) => (
                  <span
                    key={`mlx-${l.i}`}
                    style={{ left: `${(l.x / tokenChart.w) * 100}%` }}
                  >
                    {l.text}
                  </span>
                ))}
              </div>
            </div>
            <div className="dash-mline-legend">
              {modelSeries.map((m) => {
                const on = !hiddenModels.has(m.model);
                return (
                  <button
                    key={m.model}
                    type="button"
                    className={`dash-mline-leg${on ? "" : " off"}`}
                    onClick={() => toggleModel(m.model)}
                    title={on ? "点击隐藏" : "点击显示"}
                  >
                    <i style={{ background: on ? m.color : "var(--line)" }} />
                    <span>{m.model}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="empty">暂无 Token 趋势</div>
        )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <strong>热门模型 · 24h</strong>
          </div>
          {(data?.byModel?.length ?? 0) > 0 ? (
            <div className="bar-list">
              {data!.byModel.map((r) => (
                <div className="bar-row" key={r.model}>
                  <span className="mono bar-model" title={r.model}>
                    {r.model}
                  </span>
                  <div className="track">
                    <div
                      className="fill"
                      style={{
                        width: `${(r.requests / Math.max(1, ...data!.byModel.map((m) => m.requests))) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="mono">{r.requests}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">暂无数据</div>
          )}
        </div>
      </div>
    </>
  );
}

function fmt(n?: number) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

function formatTrendLabel(bucket: string, grain: Grain) {
  if (grain === "day") {
    const m = bucket.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[2]}-${m[3]}` : bucket;
  }
  const tm = bucket.match(/(\d{2}):(\d{2})/);
  if (!tm) return bucket;
  if (grain === "minute") return `${tm[1]}:${tm[2]}`;
  return `${tm[1]}时`;
}

function shouldShowTrendLabel(index: number, total: number, grain: Grain) {
  if (total <= 8) return true;
  const step = grain === "minute" ? 12 : grain === "hour" ? 4 : 5;
  return index === 0 || index === total - 1 || index % step === 0;
}

function niceAxisMax(peak: number) {
  if (peak <= 0) return 1;
  if (peak <= 5) return 5;
  const exp = 10 ** Math.floor(Math.log10(peak));
  const f = peak / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}
