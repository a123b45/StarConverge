import { FormEvent, useEffect, useMemo, useState } from "react";
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

type TestResult = {
  ok: boolean;
  statusCode: number;
  latencyMs: number;
  preview?: string;
  error?: string;
  url?: string;
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
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "on" | "off">("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState("");

  async function load() {
    const res = await api<{ data: Channel[] }>("/channels");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "on" && !r.enabled) return false;
      if (filter === "off" && r.enabled) return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        r.name.toLowerCase().includes(s) ||
        r.baseUrl.toLowerCase().includes(s) ||
        r.models.some((m) => m.toLowerCase().includes(s))
      );
    });
  }, [rows, q, filter]);

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
    if (!confirm(`删除渠道「${row.name}」？`)) return;
    await api(`/channels/${row.id}`, { method: "DELETE" });
    await load();
  }

  async function testOne(row: Channel) {
    setTesting(row.id);
    setTestMsg("");
    try {
      const res = await api<TestResult>(`/channels/${row.id}/test`, { method: "POST" });
      setTestMsg(
        res.ok
          ? `「${row.name}」可用 · ${res.latencyMs}ms · HTTP ${res.statusCode}`
          : `「${row.name}」失败 · ${res.latencyMs}ms · ${res.error || `HTTP ${res.statusCode}`}`,
      );
    } catch (err) {
      setTestMsg(err instanceof Error ? err.message : "测试失败");
    } finally {
      setTesting(null);
    }
  }

  async function testAll() {
    setTestMsg("正在批量测试…");
    const results: string[] = [];
    for (const row of rows.filter((r) => r.enabled)) {
      setTesting(row.id);
      try {
        const res = await api<TestResult>(`/channels/${row.id}/test`, { method: "POST" });
        results.push(
          `${row.name}: ${res.ok ? "OK" : "FAIL"} ${res.latencyMs}ms`,
        );
      } catch {
        results.push(`${row.name}: ERROR`);
      }
    }
    setTesting(null);
    setTestMsg(results.join(" · ") || "没有启用中的渠道");
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>渠道管理</h2>
          <p>上游 OpenAI 兼容通道，支持权重、优先级与连通性测试</p>
        </div>
        <div className="row-actions">
          <button className="btn ghost" onClick={testAll} disabled={!!testing}>
            测试全部启用
          </button>
          <button className="btn" onClick={startCreate}>
            添加渠道
          </button>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {testMsg ? (
        <div className={`alert ${testMsg.includes("失败") || testMsg.includes("FAIL") ? "" : "ok"}`}>
          {testMsg}
        </div>
      ) : null}

      <div className="toolbar">
        <input
          className="search"
          placeholder="搜索名称 / URL / 模型"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="field"
          style={{ width: 140 }}
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="all">全部状态</option>
          <option value="on">仅启用</option>
          <option value="off">仅禁用</option>
        </select>
      </div>

      <div className="panel">
        <div className="table-wrap">
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
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    <div style={{ marginTop: 4 }}>
                      <span className="badge blue">{r.type}</span>
                    </div>
                    <div className="mono" style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 4 }}>
                      {r.apiKey}
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: "0.8rem", maxWidth: 220, wordBreak: "break-all" }}>
                    {r.baseUrl}
                  </td>
                  <td style={{ maxWidth: 180 }}>
                    {r.models.slice(0, 3).join(", ") || "*"}
                    {r.models.length > 3 ? ` +${r.models.length - 3}` : ""}
                  </td>
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
                      <button
                        className="btn ghost sm"
                        disabled={testing === r.id}
                        onClick={() => testOne(r)}
                      >
                        {testing === r.id ? "测试中" : "测试"}
                      </button>
                      <button className="btn ghost sm" onClick={() => startEdit(r)}>
                        编辑
                      </button>
                      <button className="btn ghost sm" onClick={() => toggle(r)}>
                        {r.enabled ? "禁用" : "启用"}
                      </button>
                      <button className="btn danger sm" onClick={() => remove(r)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={6} className="empty">
                    暂无渠道，点击「添加渠道」接入上游
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
            <h3>{editing ? "编辑渠道" : "添加渠道"}</h3>
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
                类型
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="openai">OpenAI 兼容</option>
                  <option value="custom">自定义</option>
                </select>
              </label>
              <label>
                Base URL
                <input
                  required
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
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
