import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

type ModelRoute = {
  id: string;
  model: string;
  channelIds: string[];
  rewriteModel: string | null;
  enabled: boolean;
};

type Channel = { id: string; name: string };

export default function ModelsPage() {
  const [rows, setRows] = useState<ModelRoute[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    model: "",
    channelIds: [] as string[],
    rewriteModel: "",
    enabled: true,
  });
  const [error, setError] = useState("");

  async function load() {
    const [m, c] = await Promise.all([
      api<{ data: ModelRoute[] }>("/models"),
      api<{ data: Channel[] }>("/channels"),
    ]);
    setRows(m.data);
    setChannels(c.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/models", {
        method: "POST",
        body: JSON.stringify({
          model: form.model,
          channelIds: form.channelIds,
          rewriteModel: form.rewriteModel || null,
          enabled: form.enabled,
        }),
      });
      setOpen(false);
      setForm({ model: "", channelIds: [], rewriteModel: "", enabled: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function remove(row: ModelRoute) {
    if (!confirm(`删除模型路由「${row.model}」？`)) return;
    await api(`/models/${row.id}`, { method: "DELETE" });
    await load();
  }

  function channelName(id: string) {
    return channels.find((c) => c.id === id)?.name ?? id;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>模型路由</h2>
          <p>指定模型走哪些通道，可改写上游模型名</p>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>
          新建路由
        </button>
      </div>
      {error ? <div className="alert">{error}</div> : null}
      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>模型</th>
              <th>通道顺序</th>
              <th>改写</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.model}</td>
                <td>
                  {r.channelIds.length
                    ? r.channelIds.map(channelName).join(" → ")
                    : "自动匹配通道模型列表"}
                </td>
                <td className="mono">{r.rewriteModel || "—"}</td>
                <td>
                  <span className={`badge ${r.enabled ? "on" : "off"}`}>
                    {r.enabled ? "启用" : "禁用"}
                  </span>
                </td>
                <td>
                  <button className="btn danger" onClick={() => remove(r)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={5} className="empty">
                  可依赖通道模型列表自动路由，也可在此精确绑定
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
            <h3>新建模型路由</h3>
            <div className="form-grid">
              <label>
                对外模型名
                <input
                  required
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="gpt-4o-mini"
                />
              </label>
              <label>
                通道（可多选，顺序即优先级）
                <select
                  multiple
                  value={form.channelIds}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      channelIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                    })
                  }
                  style={{ minHeight: 120 }}
                >
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                上游改写模型名（可选）
                <input
                  value={form.rewriteModel}
                  onChange={(e) => setForm({ ...form, rewriteModel: e.target.value })}
                />
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
