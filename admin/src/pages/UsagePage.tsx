import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatTokens } from "../lib/api";
import SoftSelect from "../components/SoftSelect";

type Dashboard = {
  last24h: { requests: number; tokens: number; errors: number };
  allTime: { requests: number; tokens: number };
  byModel: Array<{ model: string; requests: number; tokens: number }>;
  hourly: Array<{ hour: string; requests: number; tokens: number }>;
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
};

type Log = {
  id: string;
  model: string | null;
  path: string;
  statusCode: number | null;
  totalTokens: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  requestPreview?: string | null;
  responsePreview?: string | null;
  messageCount?: number | null;
};

export default function UsagePage() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [sinceHours, setSinceHours] = useState(24);
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [d, l] = await Promise.all([
        api<Dashboard>("/dashboard"),
        api<{ data: Log[]; total: number }>(
          `/logs?${new URLSearchParams({
            limit: "50",
            sinceHours: String(sinceHours),
            ...(model.trim() ? { model: model.trim() } : {}),
          })}`,
        ),
      ]);
      setDash(d);
      setLogs(l.data);
      setTotal(l.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceHours]);

  const maxModel = useMemo(
    () => Math.max(1, ...(dash?.byModel.map((m) => m.tokens) ?? [1])),
    [dash],
  );

  const errRate =
    dash && dash.last24h.requests > 0
      ? ((dash.last24h.errors / dash.last24h.requests) * 100).toFixed(1)
      : "0.0";

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>用量检测</h2>
          <p>监控请求量、Token 消耗、错误率与按模型分布</p>
        </div>
        <div className="row-actions">
          <SoftSelect
            className="soft-select-filter"
            ariaLabel="时间范围"
            value={String(sinceHours)}
            onChange={(v) => setSinceHours(Number(v))}
            options={[
              { value: "1", label: "近 1 小时" },
              { value: "6", label: "近 6 小时" },
              { value: "24", label: "近 24 小时" },
              { value: "72", label: "近 3 天" },
              { value: "168", label: "近 7 天" },
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

      <div className="grid-stats">
        <div className="stat">
          <div className="label">24h 请求</div>
          <div className="value">{dash ? dash.last24h.requests.toLocaleString() : "—"}</div>
          <div className="hint">错误 {dash?.last24h.errors ?? 0} · 错误率 {errRate}%</div>
        </div>
        <div className="stat">
          <div className="label">24h Tokens</div>
          <div className="value">
            {dash ? formatTokens(dash.last24h.tokens) : "—"}
          </div>
          <div className="hint">累计 {dash ? formatTokens(dash.allTime.tokens) : "—"}</div>
        </div>
        <div className="stat">
          <div className="label">累计请求</div>
          <div className="value">
            {dash ? dash.allTime.requests.toLocaleString() : "—"}
          </div>
          <div className="hint">全站历史调用</div>
        </div>
        <div className="stat">
          <div className="label">活跃模型</div>
          <div className="value">{dash?.byModel.length ?? "—"}</div>
          <div className="hint">近 24h 有流量</div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="panel">
          <div className="panel-head">
            <strong>模型 Token 消耗 · 24h</strong>
          </div>
          {(dash?.byModel?.length ?? 0) > 0 ? (
            <div className="bar-list">
              {dash!.byModel.map((r) => (
                <div className="bar-row" key={r.model}>
                  <span className="mono bar-model" title={r.model}>
                    {r.model}
                  </span>
                  <div className="track">
                    <div
                      className="fill"
                      style={{ width: `${(r.tokens / maxModel) * 100}%` }}
                    />
                  </div>
                  <span className="mono">{formatTokens(r.tokens)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">暂无用量数据</div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <strong>模型请求次数 · 24h</strong>
          </div>
          {(dash?.byModel?.length ?? 0) > 0 ? (
            <div className="bar-list">
              {dash!.byModel.map((r) => (
                <div className="bar-row" key={`req-${r.model}`}>
                  <span className="mono bar-model" title={r.model}>
                    {r.model}
                  </span>
                  <div className="track">
                    <div
                      className="fill"
                      style={{
                        width: `${(r.requests / Math.max(1, ...dash!.byModel.map((m) => m.requests))) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="mono">{r.requests}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">暂无请求数据</div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <strong>近期调用明细</strong>
          <span className="badge">共 {total} 条</span>
        </div>
        <div className="toolbar" style={{ padding: "12px 16px 0" }}>
          <input
            className="search"
            placeholder="按模型筛选后回车"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
          <button className="btn ghost sm" onClick={() => void load()}>
            筛选
          </button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>模型 / 路径</th>
                <th>状态</th>
                <th>输入 / 输出</th>
                <th>Tokens</th>
                <th>耗时</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    所选范围内暂无调用
                  </td>
                </tr>
              ) : (
                logs.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="mono" style={{ whiteSpace: "nowrap" }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                      <td>
                        <div className="mono">{r.model || "—"}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.path}</div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            r.error || (r.statusCode && r.statusCode >= 400) ? "danger" : "on"
                          }`}
                        >
                          {r.statusCode ?? (r.error ? "ERR" : "—")}
                        </span>
                      </td>
                      <td className="mono">
                        {(r.promptTokens ?? 0).toLocaleString()} /{" "}
                        {(r.completionTokens ?? 0).toLocaleString()}
                      </td>
                      <td className="mono">{r.totalTokens ?? "—"}</td>
                      <td className="mono">
                        {r.durationMs != null ? `${r.durationMs}ms` : "—"}
                      </td>
                      <td>
                        <button
                          className="btn ghost sm"
                          onClick={() => setOpenId(openId === r.id ? null : r.id)}
                        >
                          {openId === r.id ? "收起" : "内容"}
                        </button>
                      </td>
                    </tr>
                    {openId === r.id ? (
                      <tr>
                        <td colSpan={7}>
                          <div style={{ display: "grid", gap: 8, padding: "4px 0 12px" }}>
                            <div>
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>请求内容</div>
                              <pre
                                style={{
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                  fontSize: 12,
                                  margin: "6px 0 0",
                                  maxHeight: 180,
                                  overflow: "auto",
                                }}
                              >
                                {r.requestPreview || "（无预览，新请求才会记录）"}
                              </pre>
                            </div>
                            <div>
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>响应内容</div>
                              <pre
                                style={{
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                  fontSize: 12,
                                  margin: "6px 0 0",
                                  maxHeight: 180,
                                  overflow: "auto",
                                }}
                              >
                                {r.responsePreview || r.error || "（无预览）"}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
