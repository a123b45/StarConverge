import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import SoftSelect from "../components/SoftSelect";

type Grain = "hour" | "minute" | "day";

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
  recent: Array<{
    id: string;
    model: string | null;
    upstreamModel?: string | null;
    path: string;
    statusCode: number | null;
    totalTokens: number | null;
    durationMs: number | null;
    createdAt: string;
    error: string | null;
  }>;
  byModel: Array<{ model: string; requests: number; tokens: number }>;
  grain?: Grain;
  hourly: Array<{ hour: string; requests: number; tokens: number }>;
  trend?: Array<{ hour: string; requests: number; tokens: number }>;
};

const GRAIN_OPTIONS = [
  { value: "hour", label: "按小时" },
  { value: "minute", label: "按分钟" },
  { value: "day", label: "按天" },
];

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [grain, setGrain] = useState<Grain>("hour");

  const endpoint = `${window.location.origin}/v1`;

  useEffect(() => {
    setError("");
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
    if (!total) return { total: 0, gradient: "var(--bg-soft)", items: [] as Array<{ model: string; requests: number; pct: number; color: string }> };
    const colors = [
      "#6d5efc",
      "#22c3a6",
      "#f59e0b",
      "#ef4444",
      "#3b82f6",
      "#ec4899",
      "#84cc16",
      "#06b6d4",
    ];
    let acc = 0;
    const items = rows.map((r, i) => {
      const pct = (r.requests / total) * 100;
      const start = acc;
      acc += pct;
      return {
        model: r.model,
        requests: r.requests,
        pct,
        color: colors[i % colors.length]!,
        start,
        end: acc,
      };
    });
    const gradient = `conic-gradient(${items
      .map((it) => `${it.color} ${it.start}% ${it.end}%`)
      .join(", ")})`;
    return { total, gradient, items };
  }, [data]);

  const tokenLine = useMemo(() => {
    const rows = trend;
    const w = 320;
    const h = 140;
    const padX = 8;
    const padY = 12;
    const maxT = Math.max(1, ...rows.map((r) => r.tokens));
    type Coord = {
      x: number;
      y: number;
      r: { hour: string; requests: number; tokens: number };
    };
    type Label = { i: number; x: number; text: string; show: boolean };
    if (!rows.length) {
      return {
        w,
        h,
        points: "",
        area: "",
        maxT,
        labels: [] as Label[],
        coords: [] as Coord[],
      };
    }
    const coords: Coord[] = rows.map((r, i) => {
      const x =
        padX +
        (rows.length === 1
          ? (w - padX * 2) / 2
          : (i / (rows.length - 1)) * (w - padX * 2));
      const y = h - padY - (r.tokens / maxT) * (h - padY * 2);
      return { x, y, r };
    });
    const points = coords.map((c) => `${c.x},${c.y}`).join(" ");
    const area = `${padX},${h - padY} ${points} ${coords[coords.length - 1]!.x},${h - padY}`;
    const labelStep = Math.max(1, Math.ceil(rows.length / 6));
    const labels: Label[] = coords
      .map((c, i) => ({
        i,
        x: c.x,
        text: formatTrendLabel(c.r.hour, grain),
        show: i === 0 || i === rows.length - 1 || i % labelStep === 0,
      }))
      .filter((l) => l.show);
    return { w, h, points, area, maxT, labels, coords };
  }, [trend, grain]);


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
            <strong>请求趋势</strong>
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
                    {trend.map((h) => {
                      const pct =
                        h.requests > 0
                          ? Math.max(4, (h.requests / yMax) * 100)
                          : 0;
                      return (
                        <div
                          key={h.hour}
                          className={`trend-col${h.requests === 0 ? " is-zero" : ""}`}
                        >
                          <div className="trend-hit">
                            <div
                              className="trend-bar"
                              style={{ height: `${pct}%` }}
                            />
                            <div className="trend-tip" role="tooltip">
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

      <div className="dash-grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-head">
            <strong>调用分布</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              近 24h 按模型
            </span>
          </div>
          {pie.total > 0 ? (
            <div className="dash-pie-wrap">
              <div className="dash-pie" style={{ background: pie.gradient }} title="调用分布" />
              <div className="dash-pie-legend">
                {pie.items.map((it) => (
                  <div key={it.model} className="dash-pie-row" title={it.model}>
                    <i style={{ background: it.color }} />
                    <span className="mono">{it.model}</span>
                    <b>
                      {it.requests} · {it.pct.toFixed(1)}%
                    </b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty">暂无调用分布</div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <strong>Token 趋势</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              峰值 {tokenLine.maxT.toLocaleString()}
            </span>
          </div>
          {trend.length > 0 ? (
            <div className="dash-line-wrap">
              <svg
                className="dash-line-svg"
                viewBox={`0 0 ${tokenLine.w} ${tokenLine.h}`}
                preserveAspectRatio="none"
                role="img"
                aria-label="Token 趋势折线图"
              >
                <defs>
                  <linearGradient id="tokenArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6d5efc" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#6d5efc" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <polyline
                  fill="url(#tokenArea)"
                  stroke="none"
                  points={tokenLine.area}
                />
                <polyline
                  fill="none"
                  stroke="#6d5efc"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={tokenLine.points}
                />
                {(tokenLine.coords ?? []).map((c, i) => (
                  <circle
                    key={`p-${i}`}
                    cx={c.x}
                    cy={c.y}
                    r="3"
                    fill="#fff"
                    stroke="#6d5efc"
                    strokeWidth="2"
                  >
                    <title>
                      {c.r.hour}
                      {"\n"}
                      {c.r.tokens.toLocaleString()} tokens · {c.r.requests} 次
                    </title>
                  </circle>
                ))}
              </svg>
              <div className="dash-line-x">
                {tokenLine.labels.map((l) => (
                  <span
                    key={`tl-${l.i}`}
                    style={{ left: `${(l.x / tokenLine.w) * 100}%` }}
                  >
                    {l.text}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty">暂无 Token 趋势</div>
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

/** Round up to a clean Y-axis top so ticks stay evenly spaced. */
function niceAxisMax(peak: number) {
  if (peak <= 0) return 1;
  if (peak <= 5) return 5;
  const exp = 10 ** Math.floor(Math.log10(peak));
  const f = peak / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}
