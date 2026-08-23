import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import SoftSelect from "../components/SoftSelect";
import { IconKey, IconPencil, IconUsers, IconWallet } from "../components/icons";
import { softAlert, softPrompt } from "../components/SoftDialog";
import ModalBackdrop from "../components/ModalBackdrop";

type CustomerRow = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  enabled: boolean;
  balance: number;
  totalRecharged: number;
  lastRechargedAt: string | Date | null;
  tokenCount: number;
  allowedModels?: string[];
  roleName: string;
  roleKey: string | null;
  createdAt: string | Date;
};

type TokenBrief = {
  id: string;
  name: string;
  keyPrefix: string;
  enabled: boolean;
  createdAt: string | Date;
  lastUsedAt: string | Date | null;
};

type Stats = {
  customerCount: number;
  keyCount: number;
  activeCount: number;
};

type PriceOpt = {
  id: string;
  externalModel: string;
  globalModel: string;
  enabled: boolean;
};

type FormState = {
  username: string;
  email: string;
  password: string;
  confirm: string;
};

type EditState = {
  id: string;
  username: string;
  email: string;
  balance: string;
  enabled: boolean;
  password: string;
  allowedModels: string[];
};

const emptyForm = (): FormState => ({
  username: "",
  email: "",
  password: "",
  confirm: "",
});

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function initials(name: string) {
  const s = name.trim();
  if (!s) return "?";
  return s.slice(0, 2).toUpperCase();
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
}

export default function CustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [keysFor, setKeysFor] = useState<CustomerRow | null>(null);
  const [keys, setKeys] = useState<TokenBrief[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [pricedModels, setPricedModels] = useState<string[]>([]);

  async function load(search = appliedQ) {
    try {
      const qs = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      const [list, st, pricing] = await Promise.all([
        api<{ data: CustomerRow[] }>(`/customers${qs}`),
        api<{ data: Stats }>("/customers/stats"),
        api<{ data: PriceOpt[] }>("/pricing").catch(() => ({ data: [] as PriceOpt[] })),
      ]);
      setRows(list.data);
      setStats(st.data);
      const names = [
        ...new Set(
          pricing.data
            .filter((p) => p.enabled)
            .flatMap((p) => [p.externalModel, p.globalModel].filter(Boolean)),
        ),
      ].sort((a, b) => a.localeCompare(b));
      setPricedModels(names);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => rows, [rows]);

  async function createCustomer(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/customers", {
        method: "POST",
        body: JSON.stringify({
          username: form.username,
          displayName: form.username,
          email: form.email || null,
          password: form.password,
        }),
      });
      setOpen(false);
      setForm(emptyForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const bal = Number(edit.balance);
    if (!Number.isFinite(bal) || bal < 0) {
      setError("余额无效");
      return;
    }
    if (edit.password && edit.password.length < 6) {
      setError("新密码至少 6 位");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/customers/${edit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          username: edit.username,
          email: edit.email || null,
          displayName: edit.username,
          enabled: edit.enabled,
          balance: bal,
          allowedModels: edit.allowedModels,
          ...(edit.password ? { password: edit.password } : {}),
        }),
      });
      setEdit(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  function toggleAllowedModel(model: string) {
    setEdit((s) => {
      if (!s) return s;
      const has = s.allowedModels.includes(model);
      return {
        ...s,
        allowedModels: has
          ? s.allowedModels.filter((m) => m !== model)
          : [...s.allowedModels, model],
      };
    });
  }

  async function recharge(u: CustomerRow) {
    const raw = await softPrompt({
      title: "客户充值",
      message: `为 ${u.username} 充值（单位：USD）`,
      placeholder: "例如 10.00",
      confirmText: "确认充值",
    });
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      await softAlert({ title: "无效金额", message: "请输入大于 0 的数字" });
      return;
    }
    try {
      await api(`/customers/${u.id}/recharge`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      await softAlert({ title: "完成", message: `已充值 ${money(amount)}` });
      await load();
    } catch (err) {
      await softAlert({
        title: "充值失败",
        message: err instanceof Error ? err.message : "充值失败",
      });
    }
  }

  async function openKeys(u: CustomerRow) {
    setKeysFor(u);
    try {
      const res = await api<{ data: TokenBrief[] }>(`/customers/${u.id}/tokens`);
      setKeys(res.data);
    } catch (err) {
      setKeys([]);
      setError(err instanceof Error ? err.message : "加载密钥失败");
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>客户管理</h2>
          <p>管理客户账户与 API 密钥分配。</p>
        </div>
        <div className="row-actions">
          <button className="btn" onClick={() => setOpen(true)}>
            + 新建客户
          </button>
        </div>
      </div>

      {error && !open && !edit ? <div className="alert">{error}</div> : null}

      <div className="grid-stats customers-stats">
        <div className="stat">
          <div className="label">
            <IconUsers size={14} /> 客户总数
          </div>
          <div className="value">{stats?.customerCount ?? "—"}</div>
        </div>
        <div className="stat">
          <div className="label">
            <IconKey size={14} /> 密钥总数
          </div>
          <div className="value">{stats?.keyCount ?? "—"}</div>
        </div>
        <div className="stat">
          <div className="label">
            <span className="dot-on" /> 活跃客户
          </div>
          <div className="value">{stats?.activeCount ?? "—"}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head customers-panel-head">
          <strong>全部客户</strong>
          <div className="row-actions">
            <input
              className="search"
              placeholder="支持用户名/邮箱模糊搜索"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setAppliedQ(q);
                  void load(q);
                }
              }}
            />
            <button
              className="btn"
              type="button"
              onClick={() => {
                setAppliedQ(q);
                void load(q);
              }}
            >
              搜索
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setQ("");
                setAppliedQ("");
                void load("");
              }}
            >
              重置
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>邮箱</th>
                <th>余额</th>
                <th>上次充值</th>
                <th>累计充值</th>
                <th>API 密钥</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="customer-user-cell">
                      <span className="customer-avatar">{initials(u.username)}</span>
                      <div>
                        <div className="customer-name-row">
                          <span>{u.username}</span>
                          {u.roleKey === "admin" ? (
                            <span className="role-chip">ADMIN</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{u.email || "—"}</td>
                  <td className="mono">{money(u.balance)}</td>
                  <td>{fmtDate(u.lastRechargedAt)}</td>
                  <td className="mono">{money(u.totalRecharged)}</td>
                  <td>
                    <span className="count-chip">{u.tokenCount}</span>
                  </td>
                  <td>
                    <span className={`status-text ${u.enabled ? "ok" : "off"}`}>
                      {u.enabled ? "正常" : "禁用"}
                    </span>
                  </td>
                  <td className="mono">{fmtDate(u.createdAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="充值"
                        onClick={() => void recharge(u)}
                      >
                        <IconWallet />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="编辑"
                        onClick={() =>
                          setEdit({
                            id: u.id,
                            username: u.username,
                            email: u.email || "",
                            balance: String(u.balance),
                            enabled: u.enabled,
                            password: "",
                            allowedModels: [...(u.allowedModels ?? [])],
                          })
                        }
                      >
                        <IconPencil />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="密钥管理"
                        onClick={() => void openKeys(u)}
                      >
                        <IconKey />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={9} className="empty">
                    暂无客户
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <ModalBackdrop onClose={() => setOpen(false)}>
          <form
            className="modal modal-user"
            onClick={(e) => e.stopPropagation()}
            onSubmit={createCustomer}
          >
            <div className="modal-user-head">
              <h3>新建客户</h3>
              <p>创建门户客户账号，默认角色为「用户」</p>
            </div>
            {error ? <div className="alert">{error}</div> : null}
            <div className="modal-user-grid">
              <label className="stack-field">
                <span>
                  用户名 <em>*</em>
                </span>
                <input
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9_]+"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
              </label>
              <label className="stack-field">
                <span>邮箱</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label className="stack-field">
                <span>
                  密码 <em>*</em>
                </span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </label>
              <label className="stack-field">
                <span>
                  确认密码 <em>*</em>
                </span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.confirm}
                  onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn" disabled={busy}>
                {busy ? "创建中…" : "创建"}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      ) : null}

      {edit ? (
        <ModalBackdrop onClose={() => setEdit(null)}>
          <form
            className="modal modal-user modal-customer-edit"
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveEdit}
          >
            <div className="modal-user-head modal-head-row">
              <div>
                <h3>编辑客户</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="关闭"
                onClick={() => setEdit(null)}
              >
                ×
              </button>
            </div>
            {error ? <div className="alert">{error}</div> : null}

            <div className="modal-section-label">账户信息</div>
            <div className="modal-user-grid">
              <label className="stack-field">
                <span>用户名</span>
                <input
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9_]+"
                  value={edit.username}
                  onChange={(e) =>
                    setEdit((s) => (s ? { ...s, username: e.target.value } : s))
                  }
                />
              </label>
              <label className="stack-field">
                <span>邮箱</span>
                <input
                  type="email"
                  value={edit.email}
                  onChange={(e) =>
                    setEdit((s) => (s ? { ...s, email: e.target.value } : s))
                  }
                />
              </label>
              <label className="stack-field">
                <span>余额</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={edit.balance}
                  onChange={(e) =>
                    setEdit((s) => (s ? { ...s, balance: e.target.value } : s))
                  }
                />
              </label>
              <label className="stack-field">
                <span>状态</span>
                <SoftSelect
                  ariaLabel="状态"
                  value={edit.enabled ? "1" : "0"}
                  onChange={(v) =>
                    setEdit((s) => (s ? { ...s, enabled: v === "1" } : s))
                  }
                  options={[
                    { value: "1", label: "正常" },
                    { value: "0", label: "禁用" },
                  ]}
                />
              </label>
            </div>

            <label className="stack-field">
              <span>新密码 (可选)</span>
              <input
                type="password"
                minLength={6}
                placeholder="留空则不修改登录密码"
                value={edit.password}
                onChange={(e) =>
                  setEdit((s) => (s ? { ...s, password: e.target.value } : s))
                }
              />
            </label>

            <div className="stack-field">
              <span>模型权限</span>
              <p className="muted" style={{ margin: "0 0 8px" }}>
                不勾选任何项表示不限制，可使用全部已定价模型。
              </p>
              {pricedModels.length ? (
                <div className="model-perm-list">
                  {pricedModels.map((m) => (
                    <label key={m} className="model-perm-item">
                      <input
                        type="checkbox"
                        checked={edit.allowedModels.includes(m)}
                        onChange={() => toggleAllowedModel(m)}
                      />
                      <span className="mono">{m}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="model-perm-empty">暂无已定价模型。</div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}>
                取消
              </button>
              <button className="btn" disabled={busy}>
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      ) : null}

      {keysFor ? (
        <ModalBackdrop onClose={() => setKeysFor(null)}>
          <div className="modal modal-user" onClick={(e) => e.stopPropagation()}>
            <div className="modal-user-head">
              <h3>API 密钥 · {keysFor.username}</h3>
              <p>该客户绑定的密钥列表</p>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>前缀</th>
                    <th>状态</th>
                    <th>最近使用</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id}>
                      <td>{k.name}</td>
                      <td className="mono">{k.keyPrefix}…</td>
                      <td>{k.enabled ? "启用" : "禁用"}</td>
                      <td>{fmtDate(k.lastUsedAt)}</td>
                    </tr>
                  ))}
                  {!keys.length ? (
                    <tr>
                      <td colSpan={4} className="empty">
                        暂无密钥 ·{" "}
                        <Link to="/admin/tokens">去密钥管理创建</Link>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <Link className="btn ghost" to="/admin/tokens">
                打开密钥管理
              </Link>
              <button type="button" className="btn" onClick={() => setKeysFor(null)}>
                关闭
              </button>
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </>
  );
}
