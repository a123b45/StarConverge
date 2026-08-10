import { useEffect, useState } from "react";
import { api } from "../lib/api";

type UserRow = {
  id: string;
  username: string;
  displayName: string | null;
  enabled: boolean;
  createdAt: string | Date;
  tokenCount: number;
  quota: number;
  usedQuota: number;
};

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    username: "",
    password: "",
    displayName: "",
  });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await api<{ data: UserRow[] }>("/users");
      setRows(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ username: "", password: "", displayName: "" });
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

  async function remove(u: UserRow) {
    if (!window.confirm(`删除用户 ${u.username} 及其 API 密钥？`)) return;
    await api(`/users/${u.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>客户管理</h2>
          <p className="muted">创建、禁用普通用户账号，并重置密码</p>
        </div>
      </div>
      {error ? <div className="alert">{error}</div> : null}

      <form className="card form-grid" onSubmit={createUser} style={{ marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>新建客户</h3>
        <div className="row-3">
          <label>
            用户名
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              minLength={3}
            />
          </label>
          <label>
            显示名
            <input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </label>
          <label>
            初始密码
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
            />
          </label>
        </div>
        <button className="btn" disabled={busy}>
          {busy ? "创建中…" : "创建用户"}
        </button>
      </form>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>显示名</th>
              <th>密钥数</th>
              <th>配额用量</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="mono">{u.username}</td>
                <td>{u.displayName || "—"}</td>
                <td>{u.tokenCount}</td>
                <td className="mono">
                  {u.usedQuota.toLocaleString()} / {u.quota < 0 ? "∞" : u.quota.toLocaleString()}
                </td>
                <td>
                  <span className={`badge ${u.enabled ? "ok" : "danger"}`}>
                    {u.enabled ? "启用" : "禁用"}
                  </span>
                </td>
                <td className="row-actions">
                  <button className="btn ghost sm" onClick={() => void toggle(u)}>
                    {u.enabled ? "禁用" : "启用"}
                  </button>
                  <button className="btn ghost sm" onClick={() => void resetPassword(u)}>
                    重置密码
                  </button>
                  <button className="btn ghost sm danger-text" onClick={() => void remove(u)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6} className="muted">
                  暂无客户，可在上方创建或让用户自助注册
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
