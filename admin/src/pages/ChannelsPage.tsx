import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { PROVIDERS, providerById, providerLabel } from "../lib/providers";

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

type FormState = {
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  models: string;
  weight: number;
  priority: number;
  enabled: boolean;
  timeoutMs: number;
  remark: string;
};

const emptyForm = (): FormState => ({
  name: "",
  type: "openai",
  baseUrl: providerById("openai").baseUrl,
  apiKey: "",
  models: "",
  weight: 1,
  priority: 0,
  enabled: true,
  timeoutMs: 120000,
  remark: "",
});

const STEPS = ["选择模型厂商", "填写密钥", "设置与启用"] as const;

export default function ChannelsPage() {
  const [rows, setRows] = useState<Channel[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "on" | "off">("all");
  const [providerQ, setProviderQ] = useState("");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
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
        r.type.toLowerCase().includes(s) ||
        providerLabel(r.type).toLowerCase().includes(s) ||
        r.models.some((m) => m.toLowerCase().includes(s))
      );
    });
  }, [rows, q, filter]);

  const providersFiltered = useMemo(() => {
    const s = providerQ.trim().toLowerCase();
    if (!s) return PROVIDERS;
    return PROVIDERS.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        p.desc.toLowerCase().includes(s) ||
        p.id.toLowerCase().includes(s),
    );
  }, [providerQ]);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm());
    setStep(0);
    setProviderQ("");
    setOpen(true);
  }

  function startEdit(row: Channel) {
    setEditing(row);
    setForm({
      name: row.name,
      type: row.type,
      baseUrl: row.baseUrl,
      apiKey: "",
      models: row.models.join(", "),
      weight: row.weight,
      priority: row.priority,
      enabled: row.enabled,
      timeoutMs: row.timeoutMs,
      remark: row.remark ?? "",
    });
    setStep(1);
    setOpen(true);
  }

  function pickProvider(id: string) {
    const p = providerById(id);
    setForm((f) => ({
      ...f,
      type: id,
      baseUrl: p.baseUrl || f.baseUrl,
      name: f.name || p.name,
      models: "",
    }));
    setStep(1);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editing && step < 2) {
      setStep((s) => Math.min(2, s + 1));
      return;
    }
    setError("");
    const payload = {
      name: form.name.trim() || providerLabel(form.type),
      type: form.type,
      baseUrl: form.baseUrl.trim(),
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
        if (!form.apiKey) throw new Error("请填写 API Key");
        if (!form.baseUrl.trim()) throw new Error("请填写 Base URL");
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
    if (!confirm(`删除供应商「${row.name}」？`)) return;
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
        results.push(`${row.name}: ${res.ok ? "OK" : "FAIL"} ${res.latencyMs}ms`);
      } catch {
        results.push(`${row.name}: ERROR`);
      }
    }
    setTesting(null);
    setTestMsg(results.join(" · ") || "没有启用中的供应商");
  }

  const modelsHint = providerById(form.type).modelsHint;

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>供应商管理</h2>
          <p>接入 OpenAI / Claude / Gemini 等常见上游，支持权重与连通性测试</p>
        </div>
        <div className="row-actions">
          <button className="btn ghost" onClick={testAll} disabled={!!testing}>
            测试全部启用
          </button>
          <button className="btn" onClick={startCreate}>
            添加供应商
          </button>
        </div>
      </div>

      {error && !open ? <div className="alert">{error}</div> : null}
      {testMsg ? (
        <div className={`alert ${testMsg.includes("失败") || testMsg.includes("FAIL") ? "" : "ok"}`}>
          {testMsg}
        </div>
      ) : null}

      <div className="toolbar">
        <input
          className="search"
          placeholder="搜索名称 / 厂商 / URL / 模型"
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
                      <span className="badge blue">{providerLabel(r.type)}</span>
                    </div>
                    <div
                      className="mono"
                      style={{ color: "var(--muted)", fontSize: "0.75rem", marginTop: 4 }}
                    >
                      {r.apiKey}
                    </div>
                  </td>
                  <td
                    className="mono"
                    style={{ fontSize: "0.8rem", maxWidth: 220, wordBreak: "break-all" }}
                  >
                    {r.baseUrl}
                  </td>
                  <td style={{ maxWidth: 180 }}>
                    {r.models.slice(0, 3).join(", ") || "（未限制）"}
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
                    暂无供应商，点击「添加供应商」接入上游
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
            className="modal modal-lg"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmit}
          >
            <div className="wizard-head">
              <div>
                <h3>{editing ? "编辑供应商" : "连接 AI 模型"}</h3>
                <p className="wizard-sub">
                  {editing
                    ? "修改供应商配置后保存即可生效"
                    : "添加一个新的 AI 提供商到中转平台"}
                </p>
              </div>
            </div>

            {!editing ? (
              <div className="wizard-steps">
                {STEPS.map((label, i) => (
                  <div
                    key={label}
                    className={`wizard-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
                  >
                    <span className="wizard-num">{i + 1}</span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {error && open ? <div className="alert">{error}</div> : null}

            {!editing && step === 0 ? (
              <div className="provider-step">
                <div className="toolbar" style={{ marginBottom: 12 }}>
                  <input
                    className="search"
                    style={{ maxWidth: "100%" }}
                    placeholder="搜索提供商… 例如 OpenAI / Gemini"
                    value={providerQ}
                    onChange={(e) => setProviderQ(e.target.value)}
                  />
                </div>
                <div className="provider-list">
                  {providersFiltered.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className={`provider-item ${form.type === p.id ? "active" : ""}`}
                      onClick={() => pickProvider(p.id)}
                    >
                      <div>
                        <strong>{p.name}</strong>
                        <div className="provider-desc">{p.desc}</div>
                      </div>
                      {form.type === p.id ? <span className="badge blue">已选</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {(editing || step >= 1) && (editing || step === 1) ? (
              <div className="form-grid">
                <label>
                  供应商名称
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={providerLabel(form.type)}
                  />
                </label>
                <label>
                  模型厂商
                  <select
                    value={form.type}
                    onChange={(e) => {
                      const id = e.target.value;
                      const p = providerById(id);
                      setForm({
                        ...form,
                        type: id,
                        baseUrl: p.baseUrl || form.baseUrl,
                        models: "",
                      });
                    }}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Base URL
                  <input
                    required
                    value={form.baseUrl}
                    onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                    placeholder="https://api.example.com/v1"
                  />
                </label>
                <label>
                  API Key {editing ? "（留空则不修改）" : ""}
                  <input
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder={editing ? "不变" : "sk-..."}
                    autoComplete="off"
                  />
                </label>
              </div>
            ) : null}

            {(editing || step === 2) && (editing || step === 2) ? (
              <div className="form-grid">
                {!editing ? (
                  <div className="alert info" style={{ marginBottom: 0 }}>
                    当前厂商：<strong>{providerLabel(form.type)}</strong>
                  </div>
                ) : null}
                <label>
                  模型列表
                  <input
                    value={form.models}
                    onChange={(e) => setForm({ ...form, models: e.target.value })}
                    placeholder={modelsHint}
                  />
                </label>
                <p className="field-hint">
                  逗号分隔；留空表示不按模型过滤该供应商；填写 * 表示匹配全部模型名
                </p>
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
                <div className="switch-row">
                  <div>
                    <strong>启用供应商</strong>
                    <div className="field-hint" style={{ margin: 0 }}>
                      关闭后不会参与路由转发
                    </div>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                    />
                    <span className="switch-slider" />
                  </label>
                </div>
              </div>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <div style={{ flex: 1 }} />
              {!editing && step > 0 ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  上一步
                </button>
              ) : null}
              {!editing && step < 2 ? (
                <button
                  type="button"
                  className="btn"
                  disabled={step === 0 && !form.type}
                  onClick={() => {
                    if (step === 1) {
                      if (!form.baseUrl.trim()) {
                        setError("请填写 Base URL");
                        return;
                      }
                      if (!form.apiKey.trim()) {
                        setError("请填写 API Key");
                        return;
                      }
                      setError("");
                    }
                    setStep((s) => s + 1);
                  }}
                >
                  下一步
                </button>
              ) : (
                <button className="btn">{editing ? "保存" : "完成并添加"}</button>
              )}
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
