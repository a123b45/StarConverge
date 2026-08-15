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
  const maxHour = useMemo(
    () => Math.max(1, ...trend.map((h) => h.requests), 1),
    [trend],
  );
  const maxModel = useMemo(
    () => Math.max(1, ...(data?.byModel.map((m) => m.requests) ?? [1])),
    [data],
  );

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
          <div className="label">密钥 · 路由</div>
          <div className="value" style={{ fontSize: "1.25rem" }}>
            {data
              ? `${data.counts.tokensEnabled}/${data.counts.tokens} · ${data.counts.models}`
              : "—"}
          </div>
          <div className="hint">启用密钥 / 全部 · 路由数</div>
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
              <div className="chart" title="请求数">
                {trend.map((h) => (
                  <div
                    key={h.hour}
                    className="chart-bar"
                    style={{ height: `${Math.max(4, (h.requests / maxHour) * 100)}%` }}
                    title={`${h.hour}\n${h.requests} 次 · ${h.tokens} tokens`}
                  />
                ))}
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
                      style={{ width: `${(r.requests / maxModel) * 100}%` }}
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

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <strong>最近请求</strong>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>模型 / 路径</th>
                <th>状态</th>
                <th>Tokens</th>
                <th>耗时</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: "0.8rem" }}>
                    {formatTime(r.createdAt)}
                  </td>
                  <td>
                    <div>{r.model ?? "—"}</div>
                    <div className="mono" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                      {r.path}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        Number(r.statusCode) >= 400 || r.error ? "danger" : "on"
                      }`}
                    >
                      {r.statusCode ?? "—"}
                    </span>
                  </td>
                  <td className="mono">{r.totalTokens ?? 0}</td>
                  <td className="mono">{r.durationMs != null ? `${r.durationMs}ms` : "—"}</td>
                </tr>
              ))}
              {!data?.recent?.length ? (
                <tr>
                  <td colSpan={5} className="empty">
                    暂无请求记录
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function fmt(n?: number) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function formatTime(v: string | Date) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}
