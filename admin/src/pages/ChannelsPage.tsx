import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

type Channel = {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  weight: number;
  priority: number;
  enabled: boolean;
  timeoutMs: number;
  remark: string | null;
};

const empty = {
  name: "",
  type: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  models: "gpt-4o-mini,gpt-4o",
  weight: 1,
  priority: 0,
  enabled: true,
  timeoutMs: 120000,
  remark: "",
};

export default function ChannelsPage() {
  const [rows, setRows] = useState<Channel[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  async function load() {
    const res = await api<{ data: Channel[] }>("/channels");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  function startCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function startEdit(row: Channel) {
    setEditing(row);
    setForm({
      name: row.name,
      type: row.type,
      baseUrl: row.baseUrl,
      apiKey: "",
      models: row.models.join(","),
      weight: row.weight,
      priority: row.priority,
      enabled: row.enabled,
      timeoutMs: row.timeoutMs,
      remark: row.remark ?? "",
    });
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payload = {
      name: form.name,
      type: form.type,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey || undefined,
      models: form.models
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      weight: Number(form.weight),
      priority: Number(form.priority),
      enabled: form.enabled,
      timeoutMs: Number(form.timeoutMs),
      remark: form.remark,
    };
    try {
      if (editing) {
        await api(`/channels/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        if (!form.apiKey) throw new Error("请填写上游 API Key");
        await api("/channels", { method: "POST", body: JSON.stringify(payload) });
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function toggle(row: Channel) {
    await api(`/channels/${row.id}`, {
      method: "PUT",
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    await load();
  }

  async function remove(row: Channel) {
    if (!confirm(`删除通道「${row.name}」？`)) return;
    await api(`/channels/${row.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>上游通道</h2>
          <p>配置 OpenAI 兼容上游，支持权重与优先级故障切换</p>
        </div>
        <button className="btn" onClick={startCreate}>
          新建通道
        </button>
      </div>
      {error ? <div className="alert">{error}</div> : null}
      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>Base URL</th>
              <th>模型</th>
              <th>权重/优先级</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <div className="mono" style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                    {r.apiKey}
                  </div>
                </td>
                <td className="mono" style={{ fontSize: "0.85rem" }}>
                  {r.baseUrl}
                </td>
                <td>{r.models.slice(0, 4).join(", ") || "*"}</td>
                <td className="mono">
                  {r.weight} / {r.priority}
                </td>
                <td>
                  <span className={`badge ${r.enabled ? "on" : "off"}`}>
                    {r.enabled ? "启用" : "禁用"}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button className="btn ghost" onClick={() => startEdit(r)}>
                      编辑
                    </button>
                    <button className="btn ghost" onClick={() => toggle(r)}>
                      {r.enabled ? "禁用" : "启用"}
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
                  还没有通道，先创建一个上游
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
            <h3>{editing ? "编辑通道" : "新建通道"}</h3>
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
                Base URL
                <input
                  required
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                />
              </label>
              <label>
                上游 API Key {editing ? "（留空则不修改）" : ""}
                <input
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder={editing ? "不变" : "sk-..."}
                />
              </label>
              <label>
                模型列表（逗号分隔，* 表示全部）
                <input
                  value={form.models}
                  onChange={(e) => setForm({ ...form, models: e.target.value })}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <label>
                  权重
                  <input
                    type="number"
                    value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
                  />
                </label>
                <label>
                  优先级
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                  />
                </label>
                <label>
                  超时(ms)
                  <input
                    type="number"
                    value={form.timeoutMs}
                    onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label>
                备注
                <input
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                />
                启用
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn">保存</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
