import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import ModelPicker from "../components/ModelPicker";
import {
  IconCopy,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconTrash,
} from "../components/icons";

type Token = {
  id: string;
  name: string;
  keyPrefix: string;
  key: string | null;
  quota: number;
  usedQuota: number;
  remainingQuota: number;
  rateLimit: number;
  enabled: boolean;
  allowedModels: string[];
  groupName: string;
  ipAllowlist: string[];
  lastUsedAt: string | Date | null;
  remark: string | null;
  createdAt: string | Date;
};

type FormState = {
  name: string;
  groupName: string;
  quotaUnlimited: boolean;
  quota: number;
  rateUnlimited: boolean;
  rateLimit: number;
  allowedModels: string[];
  ipAllowlistText: string;
  remark: string;
  enabled: boolean;
};

const emptyForm = (): FormState => ({
  name: "",
  groupName: "",
  quotaUnlimited: true,
  quota: 1_000_000,
  rateUnlimited: false,
  rateLimit: 60,
  allowedModels: [],
  ipAllowlistText: "",
  remark: "",
  enabled: true,
});

function ymd(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIpText(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function TokensPage() {
  const [rows, setRows] = useState<Token[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>(["*"]);
  const [kw, setKw] = useState("");
  const [keyQ, setKeyQ] = useState("");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Token | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  async function load() {
    const [tok, models] = await Promise.all([
      api<{ data: Token[] }>("/tokens"),
      api<{ data: string[] }>("/available-models"),
    ]);
    setRows(
      tok.data.map((t) => ({
        ...t,
        groupName: t.groupName ?? "",
        ipAllowlist: t.ipAllowlist ?? [],
        remainingQuota:
          t.remainingQuota ??
          (t.quota < 0 ? -1 : Math.max(0, t.quota - t.usedQuota)),
      })),
    );
    setModelOptions(models.data.length ? models.data : ["*"]);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const g = (r.groupName || "").trim();
      if (g) set.add(g);
    }
    return [...set].sort();
  }, [rows]);

  const modelTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (!r.allowedModels.length) set.add("*");
      else r.allowedModels.forEach((m) => set.add(m));
    }
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const ks = kw.trim().toLowerCase();
    const keyS = keyQ.trim().toLowerCase();
    return rows.filter((r) => {
      if (ks) {
        const hit =
          r.name.toLowerCase().includes(ks) ||
          (r.remark ?? "").toLowerCase().includes(ks) ||
          (r.groupName ?? "").toLowerCase().includes(ks);
        if (!hit) return false;
      }
      if (keyS) {
        const hit =
          r.keyPrefix.toLowerCase().includes(keyS) ||
          (r.key ?? "").toLowerCase().includes(keyS);
        if (!hit) return false;
      }
      if (groupFilter) {
        if ((r.groupName || "").trim() !== groupFilter) return false;
      }
      if (modelFilter) {
        if (modelFilter === "*") {
          if (r.allowedModels.length > 0) return false;
        } else if (!r.allowedModels.includes(modelFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [rows, kw, keyQ, groupFilter, modelFilter]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  function startCreate() {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function startEdit(row: Token) {
    setEditing(row);
    setForm({
      name: row.name,
      groupName: row.groupName || "",
      quotaUnlimited: row.quota < 0,
      quota: row.quota < 0 ? 1_000_000 : row.quota,
      rateUnlimited: row.rateLimit <= 0,
      rateLimit: row.rateLimit <= 0 ? 60 : row.rateLimit,
      allowedModels: [...row.allowedModels],
      ipAllowlistText: (row.ipAllowlist ?? []).join("\n"),
      remark: row.remark || "",
      enabled: row.enabled,
    });
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payload = {
      name: form.name,
      groupName: form.groupName,
      quota: form.quotaUnlimited ? -1 : Number(form.quota),
      rateLimit: form.rateUnlimited ? 0 : Number(form.rateLimit),
      allowedModels: form.allowedModels,
      ipAllowlist: parseIpText(form.ipAllowlistText),
      remark: form.remark,
      enabled: form.enabled,
    };
    try {
      if (editing) {
        await api(`/tokens/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        flash("密钥已更新");
      } else {
        await api<{ data: Token; key: string }>("/tokens", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        flash("密钥已创建，可在列表中查看/复制");
      }
      setOpen(false);
      setEditing(null);
      setForm(emptyForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function remove(row: Token) {
    if (!confirm(`删除密钥「${row.name}」？`)) return;
    await api(`/tokens/${row.id}`, { method: "DELETE" });
    await load();
  }

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key);
    flash("已复制密钥");
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>密钥管理</h2>
          <p>精细控制配额、分组、模型与 IP；支持关键字与密钥双搜索</p>
        </div>
        <button className="btn" onClick={startCreate}>
          创建密钥
        </button>
      </div>

      {error && !open ? <div className="alert">{error}</div> : null}
      {toast ? <div className="alert ok">{toast}</div> : null}

      <div className="tk-filters">
        <div className="tk-search-row">
          <input
            className="search"
            placeholder="关键字：名称 / 分组 / 备注"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
          <input
            className="search"
            placeholder="密钥：前缀或完整 sk-…"
            value={keyQ}
            onChange={(e) => setKeyQ(e.target.value)}
          />
        </div>

        <div className="tk-tag-row">
          <span className="tk-tag-label">分组</span>
          <button
            type="button"
            className={`tk-tag${!groupFilter ? " on" : ""}`}
            onClick={() => setGroupFilter(null)}
          >
            全部
          </button>
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              className={`tk-tag${groupFilter === g ? " on" : ""}`}
              onClick={() => setGroupFilter(groupFilter === g ? null : g)}
            >
              {g}
            </button>
          ))}
          {!groups.length ? <span className="tk-tag-empty">暂无分组标签</span> : null}
        </div>

        <div className="tk-tag-row">
          <span className="tk-tag-label">模型</span>
          <button
            type="button"
            className={`tk-tag${!modelFilter ? " on" : ""}`}
            onClick={() => setModelFilter(null)}
          >
            全部
          </button>
          {modelTags.map((m) => (
            <button
              key={m}
              type="button"
              className={`tk-tag${modelFilter === m ? " on" : ""}`}
              onClick={() => setModelFilter(modelFilter === m ? null : m)}
            >
              {m === "*" ? "全部模型" : m}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="table tk-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>状态</th>
                <th>剩余 / 总额度</th>
                <th>分组</th>
                <th>密钥</th>
                <th>可用模型</th>
                <th>IP 限制</th>
                <th>创建日期</th>
                <th>最后使用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const remaining =
                  r.quota < 0 ? "∞" : (r.remainingQuota ?? 0).toLocaleString();
                const total = r.quota < 0 ? "∞" : r.quota.toLocaleString();
                const revealed = revealId === r.id && !!r.key;
                const masked =
                  r.key && r.key.length > 12
                    ? `${r.key.slice(0, 10)}${"•".repeat(10)}`
                    : r.key
                      ? `${r.keyPrefix}${"•".repeat(12)}`
                      : `${r.keyPrefix}…`;
                const shown = revealed && r.key ? r.key : masked;
                const modelsLabel = !r.allowedModels.length
                  ? "全部模型"
                  : r.allowedModels.slice(0, 2).join(", ") +
                    (r.allowedModels.length > 2
                      ? ` +${r.allowedModels.length - 2}`
                      : "");
                const ipLabel = !r.ipAllowlist?.length
                  ? "不限"
                  : r.ipAllowlist.length <= 2
                    ? r.ipAllowlist.join(", ")
                    : `${r.ipAllowlist[0]} 等${r.ipAllowlist.length}条`;
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      {r.remark ? (
                        <div className="tk-sub">{r.remark}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge ${r.enabled ? "on" : "off"}`}>
                        {r.enabled ? "启用" : "禁用"}
                      </span>
                    </td>
                    <td className="mono">
                      {remaining} / {total}
                    </td>
                    <td>{r.groupName?.trim() || "—"}</td>
                    <td className="key-td">
                      <div className="key-cell">
                        <span
                          className={`key-pill mono ${revealed ? "is-revealed" : "is-masked"}`}
                          title={revealed && r.key ? r.key : undefined}
                        >
                          {shown}
                        </span>
                        {r.key ? (
                          <span className="key-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              title={revealed ? "隐藏密钥" : "显示密钥"}
                              onClick={() =>
                                setRevealId((id) => (id === r.id ? null : r.id))
                              }
                            >
                              {revealed ? <IconEyeOff /> : <IconEye />}
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              title="复制密钥"
                              onClick={() => void copyKey(r.key!)}
                            >
                              <IconCopy />
                            </button>
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td title={r.allowedModels.join(", ") || "全部模型"}>
                      <span className="tk-models">{modelsLabel}</span>
                    </td>
                    <td className="mono" title={(r.ipAllowlist ?? []).join("\n")}>
                      {ipLabel}
                    </td>
                    <td className="mono">{ymd(r.createdAt)}</td>
                    <td className="mono">{ymd(r.lastUsedAt)}</td>
                    <td>
                      <div className="tk-ops">
                        <button
                          type="button"
                          className="icon-btn"
                          title="修改"
                          onClick={() => startEdit(r)}
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
                );
              })}
              {!filtered.length ? (
                <tr>
                  <td colSpan={10} className="empty">
                    没有匹配的密钥
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form
            className="modal modal-token"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmit}
          >
            <div className="modal-user-head">
              <h3>{editing ? "修改密钥" : "创建密钥"}</h3>
              <p>配置分组、模型白名单与 IP 限制</p>
            </div>
            {error ? <div className="alert">{error}</div> : null}
            <div className="modal-user-grid">
              <label className="stack-field">
                <span>
                  名称 <em>*</em>
                </span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：内部测试"
                />
              </label>
              <label className="stack-field">
                <span>分组</span>
                <input
                  value={form.groupName}
                  onChange={(e) => setForm({ ...form, groupName: e.target.value })}
                  placeholder="如：内部 / 客户A"
                  list="token-group-list"
                />
                <datalist id="token-group-list">
                  {groups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </label>
              <label className="stack-field">
                <span>状态</span>
                <select
                  value={form.enabled ? "1" : "0"}
                  onChange={(e) =>
                    setForm({ ...form, enabled: e.target.value === "1" })
                  }
                >
                  <option value="1">启用</option>
                  <option value="0">禁用</option>
                </select>
              </label>
              <label className="stack-field">
                <span>备注</span>
                <input
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                />
              </label>
              <label className="stack-field">
                <span>配额（Token）</span>
                <div className="rate-row">
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={form.quotaUnlimited}
                      onChange={(e) =>
                        setForm({ ...form, quotaUnlimited: e.target.checked })
                      }
                    />
                    不限额
                  </label>
                  <input
                    type="number"
                    min={1}
                    disabled={form.quotaUnlimited}
                    value={form.quota}
                    onChange={(e) =>
                      setForm({ ...form, quota: Number(e.target.value) })
                    }
                  />
                </div>
              </label>
              <label className="stack-field">
                <span>每分钟限流</span>
                <div className="rate-row">
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={form.rateUnlimited}
                      onChange={(e) =>
                        setForm({ ...form, rateUnlimited: e.target.checked })
                      }
                    />
                    不限流
                  </label>
                  <input
                    type="number"
                    min={1}
                    disabled={form.rateUnlimited}
                    value={form.rateLimit}
                    onChange={(e) =>
                      setForm({ ...form, rateLimit: Number(e.target.value) })
                    }
                  />
                </div>
              </label>
            </div>
            <label className="stack-field" style={{ marginTop: 12 }}>
              <span>可用模型</span>
              <ModelPicker
                options={modelOptions}
                value={form.allowedModels}
                onChange={(allowedModels) => setForm({ ...form, allowedModels })}
              />
            </label>
            <label className="stack-field" style={{ marginTop: 12 }}>
              <span>IP 限制</span>
              <textarea
                className="tk-ip-area"
                rows={3}
                value={form.ipAllowlistText}
                onChange={(e) =>
                  setForm({ ...form, ipAllowlistText: e.target.value })
                }
                placeholder={"留空不限制\n每行一个 IP 或 CIDR，如：\n1.2.3.4\n10.0.0.0/8"}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn">{editing ? "保存" : "创建"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
