import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import SoftSelect from "../components/SoftSelect";
import { IconPencil, IconTrash } from "../components/icons";
import { softConfirm } from "../components/SoftDialog";

const OTHER_PROVIDER = "__other__";

type PriceRow = {
  id: string;
  externalModel: string;
  globalModel: string;
  providerModel: string;
  channelId: string | null;
  channelName: string | null;
  inputPer1m: number;
  outputPer1m: number;
  cacheHitPer1m: number;
  costPer1m: number;
  grossMargin: number;
  priceDiff: number;
  enabled: boolean;
};

type Channel = {
  id: string;
  name: string;
  enabled: boolean;
  models: string[];
};

type CatalogModel = {
  id: string;
  model: string;
  channelIds: string[];
  selfBuilt?: boolean;
};

type FormState = {
  providerModel: string;
  channelId: string;
  inputPer1m: string;
  outputPer1m: string;
  cacheHitPer1m: string;
  costPer1m: string;
};

const emptyForm = (): FormState => ({
  providerModel: "",
  channelId: "",
  inputPer1m: "0",
  outputPer1m: "0",
  cacheHitPer1m: "0",
  costPer1m: "0",
});

type UpstreamGroup = { name: string; ratio: number };

type UpstreamMeta = {
  channelId: string;
  channelName: string;
  pricingUrl: string;
  pricingVersion: string;
  groups: UpstreamGroup[];
  defaultGroup: string | null;
  upstreamModelCount: number;
  channelModelCount: number;
  catalogModelCount: number;
};

type SyncScope = "channel" | "catalog" | "upstream";

function money(n: number) {
  return Number(n.toFixed(3)).toString();
}

export default function ModelPricingPage() {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "on" | "off">("all");
  const [priceFilter, setPriceFilter] = useState<"all" | "set" | "zero">("all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncMeta, setSyncMeta] = useState<UpstreamMeta | null>(null);
  const [syncMetaError, setSyncMetaError] = useState("");
  const [syncChannelId, setSyncChannelId] = useState("");
  const [syncGroup, setSyncGroup] = useState("");
  const [syncScope, setSyncScope] = useState<SyncScope>("channel");
  const [syncUpdateExisting, setSyncUpdateExisting] = useState(true);
  const [syncCreateMissing, setSyncCreateMissing] = useState(true);
  const [syncSetCost, setSyncSetCost] = useState(true);

  async function load() {
    try {
      const [p, c, m] = await Promise.all([
        api<{ data: PriceRow[] }>("/pricing"),
        api<{ data: Channel[] }>("/channels"),
        api<{ data: CatalogModel[] }>("/models"),
      ]);
      setRows(p.data);
      setChannels(c.data);
      setCatalog(m.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selfBuiltModels = useMemo(() => {
    const names = catalog
      .filter((r) => r.selfBuilt)
      .map((r) => r.model)
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (providerFilter === OTHER_PROVIDER) {
        if (r.channelId) return false;
      } else if (providerFilter !== "all" && r.channelId !== providerFilter) {
        return false;
      }
      if (statusFilter === "on" && !r.enabled) return false;
      if (statusFilter === "off" && r.enabled) return false;
      if (priceFilter === "set" && r.inputPer1m <= 0 && r.outputPer1m <= 0) {
        return false;
      }
      if (priceFilter === "zero" && (r.inputPer1m > 0 || r.outputPer1m > 0)) {
        return false;
      }
      if (!s) return true;
      return (
        r.externalModel.toLowerCase().includes(s) ||
        r.globalModel.toLowerCase().includes(s) ||
        (r.providerModel || "").toLowerCase().includes(s) ||
        (r.channelName || "").toLowerCase().includes(s)
      );
    });
  }, [rows, q, providerFilter, statusFilter, priceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectedChannel = channels.find((ch) => ch.id === form.channelId);
  const isOtherProvider = form.channelId === OTHER_PROVIDER;
  const channelModels = useMemo(() => {
    const base = isOtherProvider
      ? selfBuiltModels
      : (selectedChannel?.models ?? []).filter((m) => m && m !== "*");
    if (form.providerModel && !base.includes(form.providerModel)) {
      return [form.providerModel, ...base];
    }
    return base;
  }, [selectedChannel, form.providerModel, isOtherProvider, selfBuiltModels]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(r: PriceRow) {
    setEditingId(r.id);
    setForm({
      providerModel: r.providerModel || r.globalModel || "",
      channelId: r.channelId || OTHER_PROVIDER,
      inputPer1m: String(r.inputPer1m),
      outputPer1m: String(r.outputPer1m),
      cacheHitPer1m: String(r.cacheHitPer1m ?? 0),
      costPer1m: String(r.costPer1m),
    });
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const channelIdRaw = form.channelId.trim();
    const providerModel = form.providerModel.trim();
    if (!channelIdRaw) {
      setError("请选择归属服务商");
      return;
    }
    if (!providerModel) {
      setError("请选择供应商模型");
      return;
    }
    setBusy(true);
    setError("");
    const channelId = channelIdRaw === OTHER_PROVIDER ? null : channelIdRaw;
    const body = {
      externalModel: providerModel,
      globalModel: providerModel,
      providerModel,
      channelId,
      inputPer1m: Number(form.inputPer1m) || 0,
      outputPer1m: Number(form.outputPer1m) || 0,
      cacheHitPer1m: Number(form.cacheHitPer1m) || 0,
      costPer1m: Number(form.costPer1m) || 0,
      enabled: true,
    };
    try {
      if (editingId) {
        await api(`/pricing/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await api("/pricing", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: PriceRow) {
    const label = r.providerModel || r.externalModel;
    const ok = await softConfirm({
      title: "删除定价",
      message: `确定删除「${label}」的价格配置？`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    await api(`/pricing/${r.id}`, { method: "DELETE" });
    await load();
  }

  async function loadUpstreamMeta(channelId: string) {
    setSyncMetaError("");
    setSyncMeta(null);
    if (!channelId) return;
    try {
      const res = await api<{ data: UpstreamMeta }>(
        `/pricing/upstream-meta?channelId=${encodeURIComponent(channelId)}`,
      );
      setSyncMeta(res.data);
      setSyncGroup(res.data.defaultGroup || res.data.groups[0]?.name || "");
    } catch (e) {
      setSyncMetaError(e instanceof Error ? e.message : "无法读取上游定价");
    }
  }

  function openSyncModal() {
    const initial =
      providerFilter !== "all" && providerFilter !== OTHER_PROVIDER
        ? providerFilter
        : channels[0]?.id || "";
    setSyncOpen(true);
    setSyncMsg("");
    setSyncMetaError("");
    setSyncChannelId(initial);
    setSyncScope("channel");
    setSyncUpdateExisting(true);
    setSyncCreateMissing(true);
    setSyncSetCost(true);
    if (initial) void loadUpstreamMeta(initial);
  }

  async function runUpstreamSync() {
    if (!syncChannelId) {
      setSyncMetaError("请选择服务商");
      return;
    }
    if (!syncGroup) {
      setSyncMetaError("请选择上游计费分组");
      return;
    }
    setSyncBusy(true);
    setSyncMsg("");
    setSyncMetaError("");
    try {
      const res = await api<{
        ok: boolean;
        targeted: number;
        created: number;
        updated: number;
        skipped: number;
        missingUpstream: number;
        group: string;
        pricingVersion?: string;
      }>("/pricing/sync-upstream", {
        method: "POST",
        body: JSON.stringify({
          channelId: syncChannelId,
          group: syncGroup,
          scope: syncScope,
          updateExisting: syncUpdateExisting,
          createMissing: syncCreateMissing,
          setCostFromUpstream: syncSetCost,
        }),
      });
      setSyncMsg(
        `同步完成：目标 ${res.targeted} 个，新建 ${res.created}，更新 ${res.updated}，跳过 ${res.skipped}${
          res.missingUpstream ? `，上游无定价 ${res.missingUpstream}` : ""
        }`,
      );
      setSyncOpen(false);
      await load();
    } catch (e) {
      setSyncMetaError(e instanceof Error ? e.message : "同步失败");
    } finally {
      setSyncBusy(false);
    }
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(pageRows.map((r) => r.id)));
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const noChannels = channels.length === 0;

  return (
    <>
      <div className="topbar pricing-topbar">
        <div className="page-head">
          <h2>方案与定价中心</h2>
          <p>设置和服务提供商的价格，所有价格都和服务商的账号绑定</p>
        </div>
      </div>

      <div className="toolbar pricing-filters">
        <input
          className="search"
          placeholder="搜索模型或服务商..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <SoftSelect
          className="soft-select-filter soft-select-sm"
          ariaLabel="服务商"
          value={providerFilter}
          onChange={(v) => {
            setProviderFilter(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "服务商：全部" },
            { value: OTHER_PROVIDER, label: "服务商：其他服务商" },
            ...channels.map((ch) => ({ value: ch.id, label: ch.name })),
          ]}
        />
        <SoftSelect
          className="soft-select-filter soft-select-sm"
          ariaLabel="状态"
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v as "all" | "on" | "off");
            setPage(1);
          }}
          options={[
            { value: "all", label: "状态：全部" },
            { value: "on", label: "状态：启用" },
            { value: "off", label: "状态：禁用" },
          ]}
        />
        <SoftSelect
          className="soft-select-filter soft-select-sm"
          ariaLabel="价格"
          value={priceFilter}
          onChange={(v) => {
            setPriceFilter(v as "all" | "set" | "zero");
            setPage(1);
          }}
          options={[
            { value: "all", label: "价格：全部" },
            { value: "set", label: "价格：已配置" },
            { value: "zero", label: "价格：未配置" },
          ]}
        />
        <div className="pricing-filters-actions">
          <button
            className="btn ghost"
            type="button"
            disabled={noChannels}
            onClick={openSyncModal}
          >
            从上游同步定价
          </button>
          <button className="btn" type="button" onClick={openCreate}>
            + 配置新价格
          </button>
        </div>
      </div>

      {error && !open && !syncOpen ? <div className="alert">{error}</div> : null}
      {syncMsg ? <div className="alert ok">{syncMsg}</div> : null}

      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={
                      pageRows.length > 0 &&
                      pageRows.every((r) => selected.has(r.id))
                    }
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="全选"
                  />
                </th>
                <th>供应商模型</th>
                <th>归属服务商账户</th>
                <th>输入 $/1M</th>
                <th>输出 $/1M</th>
                <th>缓存命中 $/1M</th>
                <th>进价</th>
                <th>毛利率</th>
                <th>实际差价</th>
                <th>运维操作</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={(e) => toggleOne(r.id, e.target.checked)}
                      aria-label={`选择 ${r.providerModel || r.externalModel}`}
                    />
                  </td>
                  <td className="mono">
                    {r.providerModel || r.externalModel || "—"}
                  </td>
                  <td>{r.channelName || "其他服务商"}</td>
                  <td className="mono">{money(r.inputPer1m)}</td>
                  <td className="mono">{money(r.outputPer1m)}</td>
                  <td className="mono">{money(r.cacheHitPer1m ?? 0)}</td>
                  <td className="mono">{money(r.costPer1m)}</td>
                  <td className="mono">{r.grossMargin.toFixed(1)}%</td>
                  <td className="mono">{money(r.priceDiff)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="编辑"
                        onClick={() => openEdit(r)}
                      >
                        <IconPencil />
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="删除"
                        onClick={() => void remove(r)}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!pageRows.length ? (
                <tr>
                  <td colSpan={10} className="empty pricing-empty">
                    {noChannels ? (
                      <>
                        无法找到配置信息，无任何接入代理上游。点击面板的工具栏里的{" "}
                        <Link to="/admin/channels">+ 服务商账户</Link>{" "}
                        进行建立关联，而后激活价格板块。也可选择「其他服务商」为路由管理创建的自建模型定价。
                      </>
                    ) : (
                      "暂无价格配置，点击「配置新价格」开始。"
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="pricing-footer">
          <span>{filtered.length} 条数据</span>
          <div className="row-actions">
            <span>
              当前页码 {page}/{pageCount}
            </span>
            <button
              type="button"
              className="btn ghost sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            <button
              type="button"
              className="btn ghost sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {syncOpen ? (
        <div className="modal-backdrop" onClick={() => !syncBusy && setSyncOpen(false)}>
          <div
            className="modal modal-user"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-user-head">
              <h3>从上游同步定价</h3>
              <p>
                读取 NewAPI 兼容站点的 <code>/api/pricing</code>，批量写入输入 / 输出 / 缓存命中价格（USD / 百万
                tokens）
              </p>
            </div>
            {syncMetaError ? <div className="alert">{syncMetaError}</div> : null}
            <div className="modal-user-grid">
              <label className="stack-field">
                <span>服务商</span>
                <SoftSelect
                  ariaLabel="同步服务商"
                  value={syncChannelId}
                  onChange={(v) => {
                    setSyncChannelId(v);
                    void loadUpstreamMeta(v);
                  }}
                  options={channels.map((ch) => ({
                    value: ch.id,
                    label: ch.name,
                  }))}
                  placeholder="选择已接入的上游"
                />
              </label>
              <label className="stack-field">
                <span>上游计费分组</span>
                <SoftSelect
                  ariaLabel="上游分组"
                  value={syncGroup}
                  onChange={setSyncGroup}
                  options={(syncMeta?.groups ?? []).map((g) => ({
                    value: g.name,
                    label: `${g.name} · ${g.ratio}x`,
                  }))}
                  placeholder={syncMeta ? "选择分组" : "先选择服务商"}
                />
              </label>
              <label className="stack-field">
                <span>同步范围</span>
                <SoftSelect
                  ariaLabel="同步范围"
                  value={syncScope}
                  onChange={(v) => setSyncScope(v as SyncScope)}
                  options={[
                    {
                      value: "channel",
                      label: `供应商模型列表${
                        syncMeta?.channelModelCount
                          ? ` (${syncMeta.channelModelCount})`
                          : ""
                      }`,
                    },
                    {
                      value: "catalog",
                      label: `模型管理已映射${
                        syncMeta?.catalogModelCount
                          ? ` (${syncMeta.catalogModelCount})`
                          : ""
                      }`,
                    },
                    {
                      value: "upstream",
                      label: `上游全部可售模型${
                        syncMeta?.upstreamModelCount
                          ? ` (${syncMeta.upstreamModelCount})`
                          : ""
                      }`,
                    },
                  ]}
                />
              </label>
            </div>
            {syncMeta ? (
              <p className="field-hint pricing-sync-meta">
                定价源：<span className="mono">{syncMeta.pricingUrl}</span>
                {syncMeta.pricingVersion ? ` · 版本 ${syncMeta.pricingVersion.slice(0, 8)}` : ""}
              </p>
            ) : null}
            <div className="pricing-sync-options">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={syncUpdateExisting}
                  onChange={(e) => setSyncUpdateExisting(e.target.checked)}
                />
                <span>更新已有定价</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={syncCreateMissing}
                  onChange={(e) => setSyncCreateMissing(e.target.checked)}
                />
                <span>为未配置模型新建定价</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={syncSetCost}
                  onChange={(e) => setSyncSetCost(e.target.checked)}
                />
                <span>将上游输入价写入进价</span>
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn ghost"
                disabled={syncBusy}
                onClick={() => setSyncOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn"
                disabled={syncBusy || !syncChannelId || !syncGroup}
                onClick={() => void runUpstreamSync()}
              >
                {syncBusy ? "同步中…" : "开始同步"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form
            className="modal modal-user"
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
          >
            <div className="modal-user-head">
              <h3>{editingId ? "编辑价格" : "配置新价格"}</h3>
              <p>价格与服务商账户绑定，单位为 USD / 百万 tokens</p>
            </div>
            {error ? <div className="alert">{error}</div> : null}
            <div className="modal-user-grid">
              <label className="stack-field">
                <span>
                  归属服务商 <em>*</em>
                </span>
                <SoftSelect
                  ariaLabel="服务商"
                  value={form.channelId}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      channelId: v,
                      providerModel: "",
                    }))
                  }
                  options={[
                    { value: OTHER_PROVIDER, label: "其他服务商" },
                    ...channels.map((ch) => ({
                      value: ch.id,
                      label: ch.name,
                    })),
                  ]}
                  placeholder="先选择服务商"
                />
              </label>
              <label className="stack-field">
                <span>
                  供应商模型 <em>*</em>
                </span>
                <SoftSelect
                  ariaLabel="供应商模型"
                  value={form.providerModel}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, providerModel: v }))
                  }
                  options={channelModels.map((m) => ({
                    value: m,
                    label: m,
                  }))}
                  placeholder={
                    !form.channelId
                      ? "请先选择服务商"
                      : channelModels.length === 0
                        ? isOtherProvider
                          ? "暂无自建路由模型"
                          : "该服务商暂无模型"
                        : "选择模型"
                  }
                />
              </label>
              <label className="stack-field">
                <span>输入 $/1M</span>
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  value={form.inputPer1m}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, inputPer1m: e.target.value }))
                  }
                />
              </label>
              <label className="stack-field">
                <span>输出 $/1M</span>
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  value={form.outputPer1m}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, outputPer1m: e.target.value }))
                  }
                />
              </label>
              <label className="stack-field">
                <span>输入（缓存命中）$/1M</span>
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  value={form.cacheHitPer1m}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cacheHitPer1m: e.target.value }))
                  }
                />
              </label>
              <label className="stack-field">
                <span>进价 $/1M</span>
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  value={form.costPer1m}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, costPer1m: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn" disabled={busy}>
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
