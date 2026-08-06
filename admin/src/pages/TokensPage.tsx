import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

type Token = {
  id: string;
  name: string;
  keyPrefix: string;
  quota: number;
  usedQuota: number;
  rateLimit: number;
  enabled: boolean;
  allowedModels: string[];
  remark: string | null;
};

export default function TokensPage() {
  const [rows, setRows] = useState<Token[]>([]);
  const [open, setOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState("");
  const [form, setForm] = useState({
    name: "",
    quota: -1,
    rateLimit: 60,
    allowedModels: "",
    remark: "",
  });
  const [error, setError] = useState("");

  async function load() {
    const res = await api<{ data: Token[] }>("/tokens");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await api<{ data: Token; key: string }>("/tokens", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          quota: Number(form.quota),
          rateLimit: Number(form.rateLimit),
          allowedModels: form.allowedModels
            .split(/[,，\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          remark: form.remark,
        }),
      });
      setCreatedKey(res.key);
      setOpen(false);
      setForm({ name: "", quota: -1, rateLimit: 60, allowedModels: "", remark: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  async function toggle(row: Token) {
    await api(`/tokens/${row.id}`, {
      method: "PUT",
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    await load();
  }

  async function resetQuota(row: Token) {
    await api(`/tokens/${row.id}`, {
      method: "PUT",
      body: JSON.stringify({ usedQuota: 0 }),
    });
    await load();
  }

  async function remove(row: Token) {
    if (!confirm(`删除密钥「${row.name}」？`)) return;
    await api(`/tokens/${row.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>访问密钥</h2>
          <p>下发给客户端的 sk 密钥，支持配额与限流</p>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>
          新建密钥
        </button>
      </div>
      {error ? <div className="alert">{error}</div> : null}
      {createdKey ? (
        <div className="alert ok">
          密钥只显示一次，请立即保存：
          <div className="mono" style={{ marginTop: 8, wordBreak: "break-all" }}>
            {createdKey}
          </div>
          <button
            className="btn ghost"
            style={{ marginTop: 10 }}
            onClick={() => {
              navigator.clipboard.writeText(createdKey);
            }}
          >
            复制
          </button>
        </div>
      ) : null}
      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>前缀</th>
              <th>用量</th>
              <th>限流</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  {r.allowedModels.length ? (
                    <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                      模型: {r.allowedModels.join(", ")}
                    </div>
                  ) : null}
                </td>
                <td className="mono">{r.keyPrefix}…</td>
                <td className="mono">
                  {r.usedQuota} / {r.quota < 0 ? "∞" : r.quota}
                </td>
                <td className="mono">{r.rateLimit}/min</td>
                <td>
                  <span className={`badge ${r.enabled ? "on" : "off"}`}>
                    {r.enabled ? "启用" : "禁用"}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button className="btn ghost" onClick={() => toggle(r)}>
                      {r.enabled ? "禁用" : "启用"}
                    </button>
                    <button className="btn ghost" onClick={() => resetQuota(r)}>
                      清零用量
                    </button>
                    <button className="btn danger" onClick={() => remove(r)}>
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6} className="empty">
                  暂无密钥
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
            <h3>新建密钥</h3>
            <div className="form-grid">
              <label>
                名称
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                配额（Token 数，-1 无限）
                <input
                  type="number"
                  value={form.quota}
                  onChange={(e) => setForm({ ...form, quota: Number(e.target.value) })}
                />
              </label>
              <label>
                每分钟限流
                <input
                  type="number"
                  value={form.rateLimit}
                  onChange={(e) => setForm({ ...form, rateLimit: Number(e.target.value) })}
                />
              </label>
              <label>
                允许模型（空=全部）
                <input
                  value={form.allowedModels}
                  onChange={(e) => setForm({ ...form, allowedModels: e.target.value })}
                  placeholder="gpt-4o-mini, gpt-4o"
                />
              </label>
              <label>
                备注
                <input
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn">创建</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
