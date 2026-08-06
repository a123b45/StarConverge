import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Dashboard = {
  last24h: { requests: number; tokens: number; errors: number };
  allTime: { requests: number; tokens: number };
  counts: { channels: number; tokens: number; models: number };
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
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dashboard>("/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>总览</h2>
          <p>近 24 小时流量、资源规模与最近请求</p>
        </div>
      </div>
      {error ? <div className="alert">{error}</div> : null}
      <div className="grid-stats">
        <div className="stat">
          <div className="label">24h 请求</div>
          <div className="value">{data?.last24h.requests ?? "—"}</div>
        </div>
        <div className="stat">
          <div className="label">24h Tokens</div>
          <div className="value">{data?.last24h.tokens ?? "—"}</div>
        </div>
        <div className="stat">
          <div className="label">24h 错误</div>
          <div className="value">{data?.last24h.errors ?? "—"}</div>
        </div>
        <div className="stat">
          <div className="label">通道 / 密钥 / 模型</div>
          <div className="value" style={{ fontSize: "1.25rem" }}>
            {data
              ? `${data.counts.channels} / ${data.counts.tokens} / ${data.counts.models}`
              : "—"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1.2fr 0.8fr" }}>
        <div className="panel">
          <div className="panel-head">
            <strong>最近请求</strong>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>模型</th>
                <th>状态</th>
                <th>耗时</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="mono">{formatTime(r.createdAt)}</td>
                  <td>{r.model ?? r.path}</td>
                  <td>
                    <span className={`badge ${Number(r.statusCode) >= 400 ? "off" : "on"}`}>
                      {r.statusCode ?? "—"}
                    </span>
                  </td>
                  <td className="mono">{r.durationMs != null ? `${r.durationMs}ms` : "—"}</td>
                </tr>
              ))}
              {!data?.recent?.length ? (
                <tr>
                  <td colSpan={4} className="empty">
                    暂无请求记录
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-head">
            <strong>热门模型 · 24h</strong>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>模型</th>
                <th>请求</th>
                <th>Tokens</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byModel ?? []).map((r) => (
                <tr key={r.model}>
                  <td>{r.model}</td>
                  <td className="mono">{r.requests}</td>
                  <td className="mono">{r.tokens}</td>
                </tr>
              ))}
              {!data?.byModel?.length ? (
                <tr>
                  <td colSpan={3} className="empty">
                    暂无数据
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

function formatTime(v: string | Date) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}
