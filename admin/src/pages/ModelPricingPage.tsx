import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import SoftSelect from "../components/SoftSelect";
import { IconPencil, IconTrash } from "../components/icons";
import { softConfirm } from "../components/SoftDialog";

type PriceRow = {
  id: string;
  externalModel: string;
  globalModel: string;
  providerModel: string;
  channelId: string | null;
  channelName: string | null;
  inputPer1m: number;
  outputPer1m: number;
  costPer1m: number;
  grossMargin: number;
  priceDiff: number;
  enabled: boolean;
};

type Channel = { id: string; name: string; enabled: boolean };

type FormState = {
  externalModel: string;
  globalModel: string;
  providerModel: string;
  channelId: string;
  inputPer1m: string;
  outputPer1m: string;
  costPer1m: string;
  enabled: boolean;
};

const emptyForm = (): FormState => ({
  externalModel: "",
  globalModel: "",
  providerModel: "",
  channelId: "",
  inputPer1m: "0",
  outputPer1m: "0",
  costPer1m: "0",
  enabled: true,
});

function money(n: number) {
  return n.toFixed(2);
}

export default function ModelPricingPage() {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
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

  async function load() {
    try {
      const [p, c] = await Promise.all([
        api<{ data: PriceRow[] }>("/pricing"),
        api<{ data: Channel[] }>("/channels"),
      ]);
      setRows(p.data);
      setChannels(c.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (providerFilter !== "all" && r.channelId !== providerFilter) return false;
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
      externalModel: r.externalModel,
      globalModel: r.globalModel,
      providerModel: r.providerModel || "",
      channelId: r.channelId || "",
      inputPer1m: String(r.inputPer1m),
      outputPer1m: String(r.outputPer1m),
      costPer1m: String(r.costPer1m),
      enabled: r.enabled,
    });
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      externalModel: form.externalModel.trim(),
      globalModel: form.globalModel.trim(),
      providerModel: form.providerModel.trim() || null,
      channelId: form.channelId || null,
      inputPer1m: Number(form.inputPer1m) || 0,
      outputPer1m: Number(form.outputPer1m) || 0,
      costPer1m: Number(form.costPer1m) || 0,
      enabled: form.enabled,
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
    const ok = await softConfirm({
      title: "删除定价",
      message: `确定删除「${r.externalModel}」的价格配置？`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    await api(`/pricing/${r.id}`, { method: "DELETE" });
    await load();
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
      <div className="topbar">
        <div className="page-head">
          <h2>方案与定价中心</h2>
          <p>设置和服务提供商的价格，所有价格都和服务商的账号绑定</p>
        </div>
        <div className="row-actions pricing-toolbar">
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
          <button className="btn" type="button" onClick={openCreate}>
            + 配置新价格
          </button>
        </div>
      </div>

      {error && !open ? <div className="alert">{error}</div> : null}

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
                <th>对外模型名</th>
                <th>全局模型名</th>
                <th>供应商模型</th>
                <th>归属服务商账户</th>
                <th>输入 $/1M</th>
                <th>输出 $/1M</th>
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
                      aria-label={`选择 ${r.externalModel}`}
                    />
                  </td>
                  <td className="mono">{r.externalModel}</td>
                  <td className="mono">{r.globalModel}</td>
                  <td className="mono">{r.providerModel || "—"}</td>
                  <td>{r.channelName || "—"}</td>
                  <td className="mono">{money(r.inputPer1m)}</td>
                  <td className="mono">{money(r.outputPer1m)}</td>
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
                  <td colSpan={11} className="empty pricing-empty">
                    {noChannels ? (
                      <>
                        无法找到配置信息，无任何接入代理上游。点击面板的工具栏里的{" "}
                        <Link to="/admin/channels">+ 服务商账户</Link>{" "}
                        进行建立关联，而后激活价格板块。
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
            <label>
              对外模型名
              <input
                required
                value={form.externalModel}
                onChange={(e) =>
                  setForm((f) => ({ ...f, externalModel: e.target.value }))
                }
              />
            </label>
            <label>
              全局模型名
              <input
                required
                value={form.globalModel}
                onChange={(e) =>
                  setForm((f) => ({ ...f, globalModel: e.target.value }))
                }
              />
            </label>
            <label>
              供应商模型
              <input
                value={form.providerModel}
                onChange={(e) =>
                  setForm((f) => ({ ...f, providerModel: e.target.value }))
                }
              />
            </label>
            <label>
              归属服务商
              <SoftSelect
                ariaLabel="服务商"
                value={form.channelId}
                onChange={(v) => setForm((f) => ({ ...f, channelId: v }))}
                options={[
                  { value: "", label: "未绑定" },
                  ...channels.map((ch) => ({ value: ch.id, label: ch.name })),
                ]}
                placeholder="选择服务商"
              />
            </label>
            <div className="form-grid-2">
              <label>
                输入 $/1M
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.inputPer1m}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, inputPer1m: e.target.value }))
                  }
                />
              </label>
              <label>
                输出 $/1M
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.outputPer1m}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, outputPer1m: e.target.value }))
                  }
                />
              </label>
            </div>
            <label>
              进价 $/1M
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.costPer1m}
                onChange={(e) =>
                  setForm((f) => ({ ...f, costPer1m: e.target.value }))
                }
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, enabled: e.target.checked }))
                }
              />
              启用
            </label>
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
