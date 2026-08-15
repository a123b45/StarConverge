import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { IconEye, IconEyeOff } from "../components/icons";
import SoftSelect from "../components/SoftSelect";

type RoleOpt = { id: string; name: string; key: string };

type UserRow = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  enabled: boolean;
  createdAt: string | Date;
  lastLoginAt: string | Date | null;
  tokenCount: number;
  quota: number;
  usedQuota: number;
  roleId: string | null;
  roleName: string;
};

type FormState = {
  username: string;
  displayName: string;
  email: string;
  password: string;
  confirm: string;
  roleId: string;
};

const emptyForm = (): FormState => ({
  username: "",
  displayName: "",
  email: "",
  password: "",
  confirm: "",
  roleId: "",
});

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editRoleId, setEditRoleId] = useState<Record<string, string>>({});

  async function load() {
    try {
      const [u, r] = await Promise.all([
        api<{ data: UserRow[] }>("/users"),
        api<{ data: RoleOpt[] }>("/roles"),
      ]);
      setRows(u.data);
      setRoles(r.data.map((x) => ({ id: x.id, name: x.name, key: x.key })));
      const map: Record<string, string> = {};
      for (const row of u.data) {
        if (row.roleId) map[row.id] = row.roleId;
      }
      setEditRoleId(map);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!form.roleId && roles.length) {
      const portal = roles.find((r) => r.key === "portal_user") ?? roles[0];
      if (portal) setForm((f) => ({ ...f, roleId: portal.id }));
    }
  }, [roles, form.roleId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (u) =>
        u.username.toLowerCase().includes(s) ||
        (u.displayName || "").toLowerCase().includes(s) ||
        (u.email || "").toLowerCase().includes(s) ||
        (u.roleName || "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    if (!form.roleId) {
      setError("请选择角色");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          username: form.username,
          displayName: form.displayName || form.username,
          email: form.email || null,
          password: form.password,
          roleId: form.roleId,
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

  async function toggle(u: UserRow) {
    await api(`/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !u.enabled }),
    });
    await load();
  }

  async function resetPassword(u: UserRow) {
    const password = window.prompt(`为 ${u.username} 设置新密码（至少 6 位）`);
    if (!password || password.length < 6) return;
    await api(`/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ password }),
    });
    alert("密码已更新");
  }

  async function changeRole(u: UserRow, roleId: string) {
    setEditRoleId((m) => ({ ...m, [u.id]: roleId }));
    await api(`/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ roleId }),
    });
    await load();
  }

  async function remove(u: UserRow) {
    if (!window.confirm(`删除用户 ${u.username} 及其 API 密钥？`)) return;
    await api(`/users/${u.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>用户管理</h2>
          <p>创建账号、分配角色权限，并管理启用状态</p>
        </div>
        <div className="row-actions">
          <input
            className="search"
            placeholder="搜索用户…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn" onClick={() => setOpen(true)}>
            + 创建用户
          </button>
        </div>
      </div>

      {error && !open ? <div className="alert">{error}</div> : null}

      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>账号</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>密钥 / 配额</th>
                <th>状态</th>
                <th>最近登录</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="mono">{u.username}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {u.displayName || "—"}
                    </div>
                  </td>
                  <td>{u.email || "—"}</td>
                  <td>
                    <SoftSelect
                      className="soft-select-filter soft-select-sm"
                      ariaLabel="角色"
                      value={editRoleId[u.id] || u.roleId || ""}
                      onChange={(v) => void changeRole(u, v)}
                      options={roles.map((r) => ({ value: r.id, label: r.name }))}
                    />
                  </td>
                  <td className="mono">
                    {u.tokenCount} 钥 · {u.usedQuota.toLocaleString()} /{" "}
                    {u.quota < 0 ? "∞" : u.quota.toLocaleString()}
                  </td>
                  <td>
                    <span className={`badge ${u.enabled ? "on" : "off"}`}>
                      {u.enabled ? "启用" : "禁用"}
                    </span>
                  </td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>
                    {u.lastLoginAt
                      ? new Date(u.lastLoginAt).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn ghost sm" onClick={() => void toggle(u)}>
                        {u.enabled ? "禁用" : "启用"}
                      </button>
                      <button
                        className="btn ghost sm"
                        onClick={() => void resetPassword(u)}
                      >
                        重置密码
                      </button>
                      <button className="btn danger sm" onClick={() => void remove(u)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={7} className="empty">
                    暂无用户
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
            className="modal modal-user"
            onClick={(e) => e.stopPropagation()}
            onSubmit={createUser}
          >
            <div className="modal-user-head">
              <h3>创建用户</h3>
              <p>填写账号信息并选择角色，将自动继承该角色权限</p>
            </div>
            {error ? <div className="alert">{error}</div> : null}

            <div className="modal-user-grid">
              <label className="stack-field">
                <span>
                  名称 <em>*</em>
                </span>
                <input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="显示名称"
                />
              </label>
              <label className="stack-field">
                <span>
                  用户名 <em>*</em>
                </span>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                  minLength={3}
                  placeholder="登录用户名"
                />
              </label>
              <label className="stack-field">
                <span>邮箱</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="用于找回密码（可选）"
                />
              </label>
              <div className="stack-field">
                <span>
                  角色 <em>*</em>
                </span>
                <SoftSelect
                  className="soft-select-filter"
                  ariaLabel="角色"
                  value={form.roleId}
                  onChange={(v) => setForm({ ...form, roleId: v })}
                  options={roles.map((r) => ({ value: r.id, label: r.name }))}
                />
              </div>
              <label className="stack-field">
                <span>
                  密码 <em>*</em>
                </span>
                <div className="pwd-wrap">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    minLength={6}
                    placeholder="至少 6 位"
                  />
                  <button
                    type="button"
                    className="pwd-toggle"
                    onClick={() => setShowPwd((v) => !v)}
                  >
                    {showPwd ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
              </label>
              <label className="stack-field">
                <span>
                  确认密码 <em>*</em>
                </span>
                <input
                  type={showPwd ? "text" : "password"}
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  required
                  minLength={6}
                  placeholder="再次输入密码"
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
        </div>
      ) : null}
    </>
  );
}
