import { useEffect, useState } from "react";
import { api } from "../lib/api";
import SoftSelect from "../components/SoftSelect";

type Log = {
  id: string;
  tokenId: string | null;
  channelId: string | null;
  model: string | null;
  path: string;
  method: string;
  statusCode: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  ip: string | null;
};

export default function LogsPage() {
  const [rows, setRows] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [model, setModel] = useState("");
  const [sinceHours, setSinceHours] = useState(24);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        limit: "100",
        sinceHours: String(sinceHours),
      });
      if (model.trim()) params.set("model", model.trim());
      const res = await api<{ data: Log[]; total: number }>(`/logs?${params}`);
      setRows(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>请求日志</h2>
          <p>
            筛选结果 {rows.length} 条 · 库内匹配 {total} 条
          </p>
        </div>
        <button className="btn ghost" onClick={load} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="toolbar">
        <input
          className="search"
          placeholder="按模型筛选，如 gpt-4o-mini"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <SoftSelect
          className="soft-select-filter"
          ariaLabel="时间范围"
          value={String(sinceHours)}
          onChange={(v) => setSinceHours(Number(v))}
          options={[
            { value: "0", label: "全部时间" },
            { value: "1", label: "近 1 小时" },
            { value: "24", label: "近 24 小时" },
            { value: "168", label: "近 7 天" },
          ]}
        />
        <button className="btn" onClick={load}>
          查询
        </button>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>方法/路径</th>
                <th>模型</th>
                <th>状态</th>
                <th>Tokens</th>
                <th>耗时</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: "0.8rem" }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td>
                    <span className="badge blue">{r.method}</span>{" "}
                    <span style={{ fontSize: "0.85rem" }}>{r.path}</span>
                    {r.error ? (
                      <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 4 }}>
                        {r.error}
                      </div>
                    ) : null}
                  </td>
                  <td>{r.model ?? "—"}</td>
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
                  <td className="mono" style={{ fontSize: "0.78rem" }}>
                    {r.ip ?? "—"}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="empty">
                    暂无日志
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
