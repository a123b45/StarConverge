import { useEffect, useState } from "react";
import { api } from "../lib/api";

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
};

export default function LogsPage() {
  const [rows, setRows] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ data: Log[]; total: number }>("/logs?limit=100")
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>请求日志</h2>
          <p>共 {total} 条记录（展示最近 100 条）</p>
        </div>
      </div>
      {error ? <div className="alert">{error}</div> : null}
      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>时间</th>
              <th>方法/路径</th>
              <th>模型</th>
              <th>状态</th>
              <th>Tokens</th>
              <th>耗时</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{new Date(r.createdAt).toLocaleString()}</td>
                <td>
                  <span className="mono">{r.method}</span> {r.path}
                  {r.error ? (
                    <div style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{r.error}</div>
                  ) : null}
                </td>
                <td>{r.model ?? "—"}</td>
                <td>
                  <span className={`badge ${Number(r.statusCode) >= 400 ? "off" : "on"}`}>
                    {r.statusCode ?? "—"}
                  </span>
                </td>
                <td className="mono">{r.totalTokens ?? 0}</td>
                <td className="mono">{r.durationMs != null ? `${r.durationMs}ms` : "—"}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6} className="empty">
                  暂无日志
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
