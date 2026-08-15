import { Fragment, useEffect, useMemo, useState } from "react";
import { formatTokens, portalApi } from "../../lib/api";
import SoftSelect from "../../components/SoftSelect";

type Summary = {
  quota: number;
  usedQuota: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  p50Ms: number;
  p95Ms: number;
  successCalls?: number;
  errorCalls?: number;
  avgMs?: number;
};

type ByModel = {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  share?: number;
  p50Ms: number;
  p95Ms: number;
};

type Daily = {
  date: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type Req = {
  id: string;
  model: string | null;
  path?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number | null;
  ok: boolean;
  createdAt: string | Date;
  error?: string | null;
  requestPreview?: string | null;
  responsePreview?: string | null;
  messageCount?: number;
};

export default function PortalUsagePage() {
  const [tab, setTab] = useState<"usage" | "trace">("usage");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byModel, setByModel] = useState<ByModel[]>([]);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const maxCalls = useMemo(
    () => Math.max(1, ...daily.map((d) => d.calls), 1),
    [daily],
  );
  const maxTokens = useMemo(
    () => Math.max(1, ...daily.map((d) => d.totalTokens), 1),
    [daily],
  );

  async function load(p = page) {
    try {
      setError("");
      const q = model ? `&model=${encodeURIComponent(model)}` : "";
      const usage = await portalApi<{
        summary: Summary;
        byModel: ByModel[];
        daily?: Daily[];
      }>(`/usage?from=${Date.now() - 30 * 86400_000}${q}`);
      setSummary(usage.summary);
      setByModel(usage.byModel);
      setDaily(usage.daily ?? []);
      const req = await portalApi<{
        data: Req[];
        totalPages: number;
        page: number;
        total: number;
      }>(`/usage/requests?page=${p}&pageSize=20${q}`);
      setRequests(req.data);
      setTotalPages(req.totalPages);
      setPage(req.page);
      setTotal(req.total);
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
          <h1>用量与链路</h1>
          <p>调用趋势、模型明细与单次请求内容追踪</p>
        </div>
        <div className="portal-hero-actions">
          <SoftSelect
            className="soft-select-filter"
            ariaLabel="模型筛选"
            value={model}
            onChange={setModel}
            options={[
              { value: "", label: "全部模型" },
              ...byModel.map((m) => ({ value: m.model, label: m.model })),
            ]}
          />
          <button className="portal-btn ghost" onClick={() => void load(page)}>
            刷新
          </button>
        </div>
      </div>

      <div className="portal-tabs">
        <button
          type="button"
          className={tab === "usage" ? "active" : ""}
          onClick={() => setTab("usage")}
        >
          用量
        </button>
        <button
          type="button"
          className={tab === "trace" ? "active" : ""}
          onClick={() => setTab("trace")}
        >
          链路
        </button>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      {tab === "usage" ? (
        <>
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
                          : `${Math.min(
                              100,
                              (summary.usedQuota / Math.max(1, summary.quota)) * 100,
                            )}%`,
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
                <div className="label">平均 / P95</div>
                <div className="value">
                  {((summary.avgMs ?? summary.p50Ms) / 1000).toFixed(1)}s /{" "}
                  {(summary.p95Ms / 1000).toFixed(1)}s
                </div>
              </div>
            </div>
          ) : null}

          {daily.length > 0 ? (
            <div className="portal-trend-grid">
              <div className="portal-panel">
                <h3>模型调用趋势</h3>
                <div className="portal-bars">
                  {daily.map((d) => (
                    <div key={d.date} className="portal-bar-col" title={`${d.date}: ${d.calls}`}>
                      <div
                        className="portal-bar"
                        style={{ height: `${Math.max(8, (d.calls / maxCalls) * 100)}%` }}
                      />
                      <span>{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="portal-panel">
                <h3>Tokens 使用趋势</h3>
                <div className="portal-bars">
                  {daily.map((d) => (
                    <div
                      key={`t-${d.date}`}
                      className="portal-bar-col"
                      title={`${d.date}: ${d.totalTokens}`}
                    >
                      <div
                        className="portal-bar tokens"
                        style={{
                          height: `${Math.max(8, (d.totalTokens / maxTokens) * 100)}%`,
                        }}
                      />
                      <span>{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="portal-panel">
            <div className="portal-panel-head">
              <h3>模型明细</h3>
              <span className="muted">共 {byModel.length} 个模型</span>
            </div>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>模型</th>
                  <th>调用次数</th>
                  <th>Token 消耗</th>
                  <th>输入 / 输出</th>
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
                    <td>
                      {m.share != null ? `${m.share}%` : ""} ({m.calls})
                    </td>
                    <td>{m.totalTokens.toLocaleString()}</td>
                    <td>
                      {m.promptTokens.toLocaleString()} / {m.completionTokens.toLocaleString()}
                    </td>
                    <td>{(m.p50Ms / 1000).toFixed(1)}s</td>
                    <td>{(m.p95Ms / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
                {!byModel.length ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      暂无用量数据
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="portal-panel">
          <div className="portal-panel-head">
            <h3>最近请求</h3>
            <span className="muted">共 {total} 条记录</span>
          </div>
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
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td>
                      <code>{r.model}</code>
                    </td>
                    <td>
                      <strong>{r.totalTokens.toLocaleString()}</strong>
                    </td>
                    <td>{r.promptTokens.toLocaleString()}</td>
                    <td>{r.completionTokens.toLocaleString()}</td>
                    <td>
                      {r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td>
                      <span className={`badge ${r.ok ? "ok" : "danger"}`}>
                        {r.ok ? "成功" : "失败"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="portal-btn ghost sm"
                        onClick={() => setOpenId(openId === r.id ? null : r.id)}
                      >
                        {openId === r.id ? "收起" : "内容"}
                      </button>
                    </td>
                  </tr>
                  {openId === r.id ? (
                    <tr className="portal-trace-row">
                      <td colSpan={8}>
                        <div className="portal-trace">
                          <div>
                            <div className="label">请求内容</div>
                            <pre>{r.requestPreview || "（无预览）"}</pre>
                          </div>
                          <div>
                            <div className="label">响应内容</div>
                            <pre>{r.responsePreview || r.error || "（无预览）"}</pre>
                          </div>
                          <div className="portal-trace-meta">
                            <span>消息数 {r.messageCount ?? 0}</span>
                            <span>{r.path || "—"}</span>
                            {r.error ? <span className="danger-text">{r.error}</span> : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {!requests.length ? (
                <tr>
                  <td colSpan={8} className="muted">
                    暂无请求记录
                  </td>
                </tr>
              ) : null}
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
      )}
    </div>
  );
}
