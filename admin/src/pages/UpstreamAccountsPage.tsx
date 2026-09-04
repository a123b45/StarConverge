import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import SoftSelect from "../components/SoftSelect";
import { softConfirm } from "../components/SoftDialog";
import ModalBackdrop from "../components/ModalBackdrop";

type UpstreamRow = {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
  passwordSet: boolean;
  enabled: boolean;
  alertEnabled: boolean;
  alertThresholdUsd: number;
  lastQuota: number | null;
  balanceUsd: number;
  balanceCny: number;
  lastCheckedAt: string | null;
  lastError: string;
  low: boolean;
};

type FormState = {
  name: string;
  baseUrl: string;
  username: string;
  password: string;
  enabled: boolean;
  alertEnabled: boolean;
  alertThresholdUsd: string;
};

const emptyForm = (): FormState => ({
  name: "",
  baseUrl: "https://",
  username: "",
  password: "",
  enabled: true,
  alertEnabled: true,
  alertThresholdUsd: "1",
});

function moneyUsd(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(4)}`;
}

function fmtTime(iso: string | null) {
  if (!iso) return "尚未同步";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "尚未同步";
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function UpstreamAccountsPage() {
  const [rows, setRows] = useState<UpstreamRow[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UpstreamRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  async function load() {
    const res = await api<{ data: UpstreamRow[] }>("/upstream-accounts");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError("");
    setOpen(true);
  }

  function startEdit(row: UpstreamRow) {
    setEditing(row);
    setForm({
      name: row.name,
      baseUrl: row.baseUrl,
      username: row.username,
      password: "",
      enabled: row.enabled,
      alertEnabled: row.alertEnabled,
      alertThresholdUsd: String(row.alertThresholdUsd),
    });
    setError("");
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        username: form.username.trim(),
        password: form.password,
        enabled: form.enabled,
        alertEnabled: form.alertEnabled,
        alertThresholdUsd: Number(form.alertThresholdUsd),
      };
      if (editing) {
        await api(`/upstream-accounts/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        if (!payload.password) throw new Error("请填写上游密码");
        await api("/upstream-accounts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: UpstreamRow) {
    const ok = await softConfirm({
      title: "删除上游账户",
      message: `确定删除「${row.name}」？不会影响本站客户余额。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    await api(`/upstream-accounts/${row.id}`, { method: "DELETE" });
    await load();
  }

  async function syncOne(row: UpstreamRow) {
    setSyncing(row.id);
    setError("");
    try {
      await api(`/upstream-accounts/${row.id}/refresh`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失败");
    } finally {
      setSyncing(null);
    }
  }

  async function syncAll() {
    setSyncing("all");
    setError("");
    try {
      const res = await api<{ data: UpstreamRow[] }>("/upstream-accounts/refresh", {
        method: "POST",
      });
      setRows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失败");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="page-head">
          <h2>上游管理</h2>
          <p>
            查看中转站预付库存（网址、账户、余额），并设置余额告警。与门户客户余额不是同一本账。
          </p>
        </div>
        <div className="row-actions">
          <button className="btn ghost" onClick={() => void syncAll()} disabled={!!syncing}>
            {syncing === "all" ? "同步中…" : "全部同步"}
          </button>
          <button className="btn" onClick={startCreate}>
            添加上游
          </button>
        </div>
      </div>

      {error && !open ? <div className="alert">{error}</div> : null}

      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>名称</th>
                <th>网址</th>
                <th>账户</th>
                <th>余额</th>
                <th>告警</th>
                <th>同步</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    {!r.enabled ? (
                      <span className="badge off" style={{ marginLeft: 8 }}>
                        停用
                      </span>
                    ) : null}
                  </td>
                  <td className="mono ch-base-url">{r.baseUrl}</td>
                  <td className="mono">{r.username}</td>
                  <td>
                    {r.lastQuota == null && !r.lastError ? (
                      <span className="muted">尚未同步</span>
                    ) : (
                      <div>
                        <strong className={r.low ? "up-balance-low" : ""}>
                          {moneyUsd(r.balanceUsd)}
                        </strong>
                        <div className="muted" style={{ fontSize: 12 }}>
                          约 ¥{r.balanceCny.toFixed(2)}
                        </div>
                      </div>
                    )}
                    {r.lastError ? (
                      <div className="muted" style={{ color: "#b45309", fontSize: 12 }}>
                        {r.lastError}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {r.alertEnabled ? (
                      <span className={`badge ${r.low ? "off" : "on"}`}>
                        {r.low
                          ? `已低于 ${moneyUsd(r.alertThresholdUsd)}`
                          : `阈值 ${moneyUsd(r.alertThresholdUsd)}`}
                      </span>
                    ) : (
                      <span className="badge off">未开启</span>
                    )}
                  </td>
                  <td className="muted">{fmtTime(r.lastCheckedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn ghost sm"
                        disabled={syncing === r.id}
                        onClick={() => void syncOne(r)}
                      >
                        {syncing === r.id ? "同步中" : "同步"}
                      </button>
                      <button className="btn ghost sm" onClick={() => startEdit(r)}>
                        编辑
                      </button>
                      <button className="btn danger sm" onClick={() => void remove(r)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="empty">
                    还没有上游账户。添加后每 5 分钟自动拉取余额。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <ModalBackdrop onClose={() => setOpen(false)}>
          <form className="modal modal-md" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
            <h3>{editing ? "编辑上游账户" : "添加上游账户"}</h3>
            {error && open ? <div className="alert">{error}</div> : null}
            <div className="form-grid">
              <label>
                显示名称
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如 主站预付"
                />
              </label>
              <label>
                上游网址
                <input
                  required
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="https://example.com"
                />
              </label>
              <label>
                账户
                <input
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  autoComplete="off"
                />
              </label>
              <label>
                密码 {editing ? "（留空则不修改）" : ""}
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editing ? "不变" : ""}
                  autoComplete="new-password"
                />
              </label>
              <label>
                告警阈值（美元）
                <input
                  inputMode="decimal"
                  value={form.alertThresholdUsd}
                  onChange={(e) => setForm({ ...form, alertThresholdUsd: e.target.value })}
                />
              </label>
              <div className="stack-field">
                <span>余额告警</span>
                <SoftSelect
                  ariaLabel="余额告警"
                  value={form.alertEnabled ? "on" : "off"}
                  onChange={(v) => setForm({ ...form, alertEnabled: v === "on" })}
                  options={[
                    { value: "on", label: "开启，低于阈值时顶栏提示" },
                    { value: "off", label: "关闭" },
                  ]}
                />
              </div>
              <div className="switch-row">
                <div>
                  <strong>启用同步</strong>
                  <div className="field-hint" style={{ margin: 0 }}>
                    关闭后不再拉取余额，也不再告警
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
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                取消
              </button>
              <button className="btn" disabled={busy}>
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      ) : null}
    </>
  );
}
