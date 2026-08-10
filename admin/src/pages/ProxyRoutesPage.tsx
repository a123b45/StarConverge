import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";

type ProxyRoute = {
  id: string;
  name: string;
  pathPrefix: string;
  targetUrl: string;
  authHeader: string | null;
  stripPrefix: boolean;
  enabled: boolean;
  requireToken: boolean;
  timeoutMs: number;
  remark: string | null;
};

export default function ProxyRoutesPage() {
  const [rows, setRows] = useState<ProxyRoute[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    pathPrefix: "/proxy/demo",
    targetUrl: "https://httpbin.org",
    authHeader: "",
    stripPrefix: true,
    enabled: true,
    requireToken: true,
    timeoutMs: 30000,
    remark: "",
  });
  const [error, setError] = useState("");

  async function load() {
    const res = await api<{ data: ProxyRoute[] }>("/proxy-routes");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/proxy-routes", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          authHeader: form.authHeader || null,
          timeoutMs: Number(form.timeoutMs),
        }),
      });
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function remove(row: ProxyRoute) {
    if (!confirm(`删除模型「${row.name}」？`)) return;
    await api(`/proxy-routes/${row.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>模型管理</h2>
          <p>管理自定义模型代理路径，将 /proxy 前缀转发到上游服务</p>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>
          新建模型
        </button>
      </div>
      {error ? <div className="alert">{error}</div> : null}
      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>名称</th>
                <th>路径前缀</th>
                <th>目标</th>
                <th>鉴权</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="mono">{r.pathPrefix}</td>
                  <td className="mono" style={{ fontSize: "0.85rem" }}>
                    {r.targetUrl}
                  </td>
                  <td>{r.requireToken ? "需要 Token" : "公开"}</td>
                  <td>
                    <span className={`badge ${r.enabled ? "on" : "off"}`}>
                      {r.enabled ? "启用" : "禁用"}
                    </span>
                  </td>
                  <td>
                    <button className="btn danger sm" onClick={() => remove(r)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="empty">
                    例如：/proxy/weather → https://api.weather.example
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
            <h3>新建模型代理</h3>
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
                路径前缀
                <input
                  required
                  value={form.pathPrefix}
                  onChange={(e) => setForm({ ...form, pathPrefix: e.target.value })}
                />
              </label>
              <label>
                目标 URL
                <input
                  required
                  value={form.targetUrl}
                  onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
                />
              </label>
              <label>
                注入 Authorization（可选）
                <input
                  value={form.authHeader}
                  onChange={(e) => setForm({ ...form, authHeader: e.target.value })}
                  placeholder="Bearer xxx"
                />
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.stripPrefix}
                  onChange={(e) => setForm({ ...form, stripPrefix: e.target.checked })}
                />
                去掉路径前缀再转发
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.requireToken}
                  onChange={(e) => setForm({ ...form, requireToken: e.target.checked })}
                />
                需要客户端 Token
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
