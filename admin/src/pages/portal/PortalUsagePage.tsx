import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatTokens, portalApi } from "../../lib/api";
import { Link } from "react-router-dom";
import SoftSelect from "../../components/SoftSelect";
import ModalBackdrop from "../../components/ModalBackdrop";
import { copyText } from "../../lib/copy";
import {
  IconBolt,
  IconClock,
  IconDownload,
  IconHash,
  IconUpload,
  IconWallet,
} from "../../components/icons";

type Summary = {
  quota: number;
  usedQuota: number;
  balance?: number;
  totalRecharged?: number;
  totalCost?: number;
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
  cost?: number;
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
  models?: Array<{ model: string; calls: number; totalTokens: number }>;
};

type Req = {
  id: string;
  model: string | null;
  keyName?: string;
  path?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number | null;
  ok: boolean;
  statusCode?: number;
  createdAt: string | Date;
  error?: string | null;
};

type ReqDetail = Req & {
  requestPreview?: string | null;
  responsePreview?: string | null;
  channelName?: string | null;
  ip?: string | null;
  messageCount?: number;
};

function money(n: number, digits = 3) {
  return `$${n.toFixed(digits)}`;
}

function fmtLatency(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatLabel({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="label portal-stat-label">
      <span className="portal-stat-icon">{icon}</span>
      {children}
    </div>
  );
}

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
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [keys, setKeys] = useState<{ id: string; name: string }[]>([]);
  const [tokenId, setTokenId] = useState("");
  const [status, setStatus] = useState("");
  const [fromDays, setFromDays] = useState("30");
  const [detail, setDetail] = useState<ReqDetail | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

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
      const from = Date.now() - Number(fromDays || 30) * 86400_000;
      const q = [
        model ? `model=${encodeURIComponent(model)}` : "",
        tokenId ? `tokenId=${encodeURIComponent(tokenId)}` : "",
        status ? `status=${encodeURIComponent(status)}` : "",
        `from=${from}`,
      ]
        .filter(Boolean)
        .join("&");
      const usage = await portalApi<{
        summary: Summary;
        byModel: ByModel[];
        daily?: Daily[];
      }>(`/usage?from=${from}${model ? `&model=${encodeURIComponent(model)}` : ""}`);
      setSummary(usage.summary);
      setByModel(usage.byModel);
      setDaily(usage.daily ?? []);
      if (!model) {
        setModelOptions(usage.byModel.map((m) => m.model));
      } else if (!modelOptions.length) {
        const all = await portalApi<{ byModel: ByModel[] }>(`/usage?from=${from}`);
        setModelOptions(all.byModel.map((m) => m.model));
      }
      const req = await portalApi<{
        data: Req[];
        totalPages: number;
        page: number;
        total: number;
      }>(`/usage/requests?page=${p}&pageSize=20&${q}`);
      setRequests(req.data);
      setTotalPages(req.totalPages);
      setPage(req.page);
      setTotal(req.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    portalApi<{ data: { id: string; name: string }[] }>("/keys")
      .then((r) => setKeys(r.data ?? []))
      .catch(() => setKeys([]));
  }, []);

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, tokenId, status, fromDays]);

  async function openDetail(id: string) {
    try {
      const res = await portalApi<{ data: ReqDetail }>(`/usage/requests/${id}`);
      setDetail(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法加载详情");
    }
  }

  const balance = summary?.balance ?? 0;
  const totalRecharged = summary?.totalRecharged ?? 0;
  const totalCost = summary?.totalCost ?? 0;
  const pool = totalRecharged > 0 ? totalRecharged : balance + totalCost;
  const balancePct =
    pool > 0
      ? Math.min(100, Math.max(0, (balance / pool) * 100))
      : balance > 0
        ? 100
        : 0;

  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>用量与链路</h1>
          <p>调用趋势、模型明细与请求链路记录</p>
        </div>
        <div className="portal-hero-actions portal-usage-filters">
          <SoftSelect
            className="soft-select-filter"
            ariaLabel="时间范围"
            value={fromDays}
            onChange={setFromDays}
            options={[
              { value: "1", label: "近 1 天" },
              { value: "7", label: "近 7 天" },
              { value: "30", label: "近 30 天" },
            ]}
          />
          <SoftSelect
            className="soft-select-filter"
            ariaLabel="模型筛选"
            value={model}
            onChange={setModel}
            options={[
              { value: "", label: "全部模型" },
              ...modelOptions.map((m) => ({ value: m, label: m })),
            ]}
          />
          <SoftSelect
            className="soft-select-filter"
            ariaLabel="密钥筛选"
            value={tokenId}
            onChange={setTokenId}
            options={[
              { value: "", label: "全部密钥" },
              ...keys.map((k) => ({ value: k.id, label: k.name })),
            ]}
          />
          <SoftSelect
            className="soft-select-filter"
            ariaLabel="状态"
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: "全部状态" },
              { value: "ok", label: "成功" },
              { value: "error", label: "失败" },
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
              <div className="portal-stat wide portal-stat-money">
                <StatLabel icon={<IconWallet size={14} />}>
                  总消费 / 总余额
                </StatLabel>
                <div className="value portal-stat-balance">
                  <strong>{money(totalCost)}</strong>
                  <span> / {money(balance, 2)}</span>
                </div>
                <div className="bar" title={`剩余 ${balancePct.toFixed(0)}%`}>
                  <i style={{ width: `${balancePct}%` }} />
                </div>
              </div>
              <div className="portal-stat">
                <StatLabel icon={<IconHash size={14} />}>总调用次数</StatLabel>
                <div className="value">{summary.calls}</div>
              </div>
              <div className="portal-stat">
                <StatLabel icon={<IconDownload size={14} />}>总输入 TOKEN</StatLabel>
                <div className="value">{formatTokens(summary.promptTokens)}</div>
              </div>
              <div className="portal-stat">
                <StatLabel icon={<IconUpload size={14} />}>总输出 TOKEN</StatLabel>
                <div className="value">
                  {formatTokens(summary.completionTokens)}
                </div>
              </div>
              <div className="portal-stat">
                <StatLabel icon={<IconBolt size={14} />}>总 TOKENS</StatLabel>
                <div className="value">{formatTokens(summary.totalTokens)}</div>
              </div>
              <div className="portal-stat portal-stat-latency">
                <StatLabel icon={<IconClock size={14} />}>延迟</StatLabel>
                <div className="portal-latency-grid">
                  <div>
                    <span className="portal-latency-k">P50</span>
                    <strong>{fmtLatency(summary.p50Ms)}</strong>
                  </div>
                  <div>
                    <span className="portal-latency-k">P95</span>
                    <strong>{fmtLatency(summary.p95Ms)}</strong>
                  </div>
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
                    <div key={d.date} className="portal-bar-col">
                      <div className="portal-bar-hit">
                        <div
                          className="portal-bar"
                          style={{ height: `${Math.max(8, (d.calls / maxCalls) * 100)}%` }}
                        />
                        <div className="portal-bar-tip" role="tooltip">
                          <strong>{d.date}</strong>
                          <em>合计 {d.calls} 次</em>
                          {(d.models?.length ? d.models : []).map((m) => (
                            <span key={m.model}>
                              {m.model}
                              <b>{m.calls}</b>
                            </span>
                          ))}
                          {!d.models?.length ? <span>暂无模型明细</span> : null}
                        </div>
                      </div>
                      <span>{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="portal-panel">
                <h3>Tokens 使用趋势</h3>
                <div className="portal-bars">
                  {daily.map((d) => (
                    <div key={`t-${d.date}`} className="portal-bar-col">
                      <div className="portal-bar-hit">
                        <div
                          className="portal-bar tokens"
                          style={{
                            height: `${Math.max(8, (d.totalTokens / maxTokens) * 100)}%`,
                          }}
                        />
                        <div className="portal-bar-tip" role="tooltip">
                          <strong>{d.date}</strong>
                          <em>合计 {d.totalTokens.toLocaleString()} tokens</em>
                          {(d.models?.length ? d.models : []).map((m) => (
                            <span key={m.model}>
                              {m.model}
                              <b>{m.totalTokens.toLocaleString()}</b>
                            </span>
                          ))}
                          {!d.models?.length ? <span>暂无模型明细</span> : null}
                        </div>
                      </div>
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
                  <th>消耗金额</th>
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
                      {m.promptTokens.toLocaleString()} /{" "}
                      {m.completionTokens.toLocaleString()}
                    </td>
                    <td>{money(m.cost ?? 0)}</td>
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
        </>
      ) : (
        <div className="portal-panel portal-trace-panel">
          <div className="portal-panel-head">
            <h3>最近请求</h3>
            <span className="muted">共 {total} 条记录</span>
          </div>
          <div className="portal-table-wrap">
            <table className="portal-table portal-trace-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>模型</th>
                  <th>调用 Key</th>
                  <th>TOKENS</th>
                  <th>输入</th>
                  <th>输出</th>
                  <th>延迟</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr
                    key={r.id}
                    className="portal-trace-row"
                    onClick={() => void openDetail(r.id)}
                  >
                    <td className="portal-trace-time">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <code>{r.model}</code>
                    </td>
                    <td className="portal-trace-key">{r.keyName || "—"}</td>
                    <td>
                      <strong>{r.totalTokens.toLocaleString()}</strong>
                    </td>
                    <td>{r.promptTokens.toLocaleString()}</td>
                    <td>{r.completionTokens.toLocaleString()}</td>
                    <td>
                      {r.durationMs != null
                        ? `${(r.durationMs / 1000).toFixed(1)}s`
                        : "—"}
                    </td>
                    <td>
                      <span className={`badge ${r.ok ? "ok" : "danger"}`}>
                        {r.ok ? "成功" : "失败"}
                      </span>
                    </td>
                  </tr>
                ))}
                {!requests.length ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      <div className="portal-empty" style={{ padding: 16 }}>
                        <strong>暂无请求记录</strong>
                        <p>先去对话测试或客户端里跑一笔，再回到这里看链路。</p>
                        <Link className="portal-btn" to="/app/chat">
                          去对话测试
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
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

      {detail ? (
        <ModalBackdrop onClose={() => setDetail(null)}>
          <div className="modal modal-md portal-trace" onClick={(e) => e.stopPropagation()}>
            <div className="modal-user-head">
              <h3>请求详情</h3>
              <p>
                {detail.model} · {new Date(detail.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="copy-row">
              <code>{detail.id}</code>
              <button
                type="button"
                className="portal-btn ghost sm"
                onClick={async () => {
                  const ok = await copyText(detail.id);
                  setCopied(ok);
                  window.setTimeout(() => setCopied(false), 1200);
                }}
              >
                {copied ? "已复制" : "复制请求 ID"}
              </button>
            </div>
            <p className="muted">
              状态 {detail.statusCode ?? (detail.ok ? 200 : "失败")} · Key {detail.keyName || "—"} ·
              渠道 {detail.channelName || "—"} · IP {detail.ip || "—"}
            </p>
            {detail.error ? <div className="alert">{detail.error}</div> : null}
            <h4>请求预览</h4>
            <pre>{detail.requestPreview || "—"}</pre>
            <h4>响应预览</h4>
            <pre>{detail.responsePreview || "—"}</pre>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setDetail(null)}>
                关闭
              </button>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}
