import { useEffect, useState } from "react";
import { formatTokens, portalApi } from "../../lib/api";

type Summary = {
  quota: number;
  usedQuota: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  p50Ms: number;
  p95Ms: number;
};

type ByModel = {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  p50Ms: number;
  p95Ms: number;
};

type Req = {
  id: string;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number | null;
  ok: boolean;
  createdAt: string | Date;
};

export default function PortalUsagePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byModel, setByModel] = useState<ByModel[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [model, setModel] = useState("");
  const [error, setError] = useState("");

  async function load(p = page) {
    try {
      const q = model ? `&model=${encodeURIComponent(model)}` : "";
      const usage = await portalApi<{ summary: Summary; byModel: ByModel[] }>(
        `/usage?from=${Date.now() - 30 * 86400_000}${q}`,
      );
      setSummary(usage.summary);
      setByModel(usage.byModel);
      const req = await portalApi<{
        data: Req[];
        totalPages: number;
        page: number;
      }>(`/usage/requests?page=${p}&pageSize=20${q}`);
      setRequests(req.data);
      setTotalPages(req.totalPages);
      setPage(req.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>用量</h1>
          <p>监控各模型的调用次数与 token 消耗</p>
        </div>
        <select
          className="portal-search"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="">全部模型</option>
          {byModel.map((m) => (
            <option key={m.model} value={m.model}>
              {m.model}
            </option>
          ))}
        </select>
      </div>
      {error ? <div className="alert">{error}</div> : null}

      {summary ? (
        <div className="portal-stats">
          <div className="portal-stat wide">
            <div className="label">已用 / 总额度</div>
            <div className="value">
              {formatTokens(summary.usedQuota)} / {formatTokens(summary.quota)}
            </div>
            <div className="bar">
              <i
                style={{
                  width:
                    summary.quota < 0
                      ? "8%"
                      : `${Math.min(100, (summary.usedQuota / Math.max(1, summary.quota)) * 100)}%`,
                }}
              />
            </div>
          </div>
          <div className="portal-stat">
            <div className="label">总调用</div>
            <div className="value">{summary.calls}</div>
          </div>
          <div className="portal-stat">
            <div className="label">输入 TOKEN</div>
            <div className="value">{formatTokens(summary.promptTokens)}</div>
          </div>
          <div className="portal-stat">
            <div className="label">输出 TOKEN</div>
            <div className="value">{formatTokens(summary.completionTokens)}</div>
          </div>
          <div className="portal-stat">
            <div className="label">总 TOKENS</div>
            <div className="value">{formatTokens(summary.totalTokens)}</div>
          </div>
          <div className="portal-stat">
            <div className="label">P50 / P95</div>
            <div className="value">
              {(summary.p50Ms / 1000).toFixed(1)}s / {(summary.p95Ms / 1000).toFixed(1)}s
            </div>
          </div>
        </div>
      ) : null}

      <div className="portal-panel">
        <h3>按模型用量</h3>
        <table className="portal-table">
          <thead>
            <tr>
              <th>模型</th>
              <th>调用</th>
              <th>输入</th>
              <th>输出</th>
              <th>TOKENS</th>
              <th>P50</th>
              <th>P95</th>
            </tr>
          </thead>
          <tbody>
            {byModel.map((m) => (
              <tr key={m.model}>
                <td>
                  <code>{m.model}</code>
                </td>
                <td>{m.calls}</td>
                <td>{m.promptTokens.toLocaleString()}</td>
                <td>{m.completionTokens.toLocaleString()}</td>
                <td>{m.totalTokens.toLocaleString()}</td>
                <td>{(m.p50Ms / 1000).toFixed(1)}s</td>
                <td>{(m.p95Ms / 1000).toFixed(1)}s</td>
              </tr>
            ))}
            {!byModel.length ? (
              <tr>
                <td colSpan={7} className="muted">
                  暂无用量数据
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="portal-panel">
        <h3>最近请求</h3>
        <table className="portal-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>模型</th>
              <th>TOKENS</th>
              <th>输入</th>
              <th>输出</th>
              <th>延迟</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>
                  <code>{r.model}</code>
                </td>
                <td>{r.totalTokens.toLocaleString()}</td>
                <td>{r.promptTokens.toLocaleString()}</td>
                <td>{r.completionTokens.toLocaleString()}</td>
                <td>{r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                <td>
                  <span className={`badge ${r.ok ? "ok" : "danger"}`}>
                    {r.ok ? "成功" : "失败"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="portal-pager">
          <button
            className="portal-btn ghost sm"
            disabled={page <= 1}
            onClick={() => void load(page - 1)}
          >
            上一页
          </button>
          <span>
            第 {page} 页 / 共 {totalPages} 页
          </span>
          <button
            className="portal-btn ghost sm"
            disabled={page >= totalPages}
            onClick={() => void load(page + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
