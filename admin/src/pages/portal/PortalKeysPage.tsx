import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "../../lib/api";
import { copyText } from "../../lib/copy";
import SoftToast from "../../components/SoftToast";
import { softConfirm } from "../../components/SoftDialog";
import ModalBackdrop from "../../components/ModalBackdrop";
import ModelPicker from "../../components/ModelPicker";
import {
  IconCopy,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconTrash,
} from "../../components/icons";
import { normalizeIpRules, type IpRule } from "../../lib/ip-rules";

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  key: string | null;
  lastUsedAt: string | Date | null;
  createdAt: string | Date;
  enabled?: boolean;
  quota?: number;
  usedQuota?: number;
  remainingQuota?: number;
  dailyQuota?: number;
  monthlyQuota?: number;
  rateLimit?: number;
  allowedModels?: string[];
  ipRules?: IpRule[];
  remark?: string | null;
  expiresAt?: string | Date | null;
};

function ymd(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function maskKey(key: string | null, prefix: string): string {
  if (key && key.length > 12 && !key.includes("•")) {
    return `${key.slice(0, 7)}*****${key.slice(-4)}`;
  }
  if (prefix) return `${prefix}*****`;
  return "sk-*****";
}

function quotaLabel(n?: number) {
  if (n == null || n < 0) return "不限";
  return n.toLocaleString();
}

type FormState = {
  name: string;
  remark: string;
  enabled: boolean;
  quota: string;
  dailyQuota: string;
  monthlyQuota: string;
  rateLimit: string;
  allowedModels: string[];
  ipText: string;
};

const emptyForm: FormState = {
  name: "",
  remark: "",
  enabled: true,
  quota: "",
  dailyQuota: "",
  monthlyQuota: "",
  rateLimit: "60",
  allowedModels: [],
  ipText: "",
};

function parseQuota(raw: string): number {
  const t = raw.trim();
  if (!t) return -1;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : -1;
}

export default function PortalKeysPage() {
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [kw, setKw] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KeyRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"ok" | "err">("ok");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  async function load() {
    const res = await portalApi<{ data: KeyRow[] }>("/keys");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "加载失败"),
    );
    portalApi<{ data: { model: string; retired?: boolean }[] }>("/models")
      .then((r) =>
        setModels(
          [...new Set((r.data ?? []).filter((m) => !m.retired).map((m) => m.model))],
        ),
      )
      .catch(() => setModels([]));
  }, []);

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.keyPrefix.toLowerCase().includes(q) ||
        (r.remark || "").toLowerCase().includes(q) ||
        (revealedKeys[r.id] ?? "").toLowerCase().includes(q),
    );
  }, [rows, kw, revealedKeys]);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setCreatedKey(null);
    setError("");
    setOpen(true);
  }

  function startEdit(row: KeyRow) {
    setEditing(row);
    setForm({
      name: row.name,
      remark: row.remark || "",
      enabled: row.enabled !== false,
      quota: row.quota != null && row.quota >= 0 ? String(row.quota) : "",
      dailyQuota: row.dailyQuota != null && row.dailyQuota >= 0 ? String(row.dailyQuota) : "",
      monthlyQuota:
        row.monthlyQuota != null && row.monthlyQuota >= 0 ? String(row.monthlyQuota) : "",
      rateLimit: String(row.rateLimit ?? 60),
      allowedModels: row.allowedModels ?? [],
      ipText: (row.ipRules ?? [])
        .filter((r) => r.action === "ALLOW")
        .map((r) => r.ip)
        .join("\n"),
    });
    setCreatedKey(null);
    setError("");
    setOpen(true);
  }

  function payload() {
    const ipRules = normalizeIpRules(
      form.ipText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
    return {
      name: form.name.trim(),
      remark: form.remark.trim(),
      enabled: form.enabled,
      quota: parseQuota(form.quota),
      dailyQuota: parseQuota(form.dailyQuota),
      monthlyQuota: parseQuota(form.monthlyQuota),
      rateLimit: Math.max(0, Number(form.rateLimit) || 0),
      allowedModels: form.allowedModels,
      ipRules,
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editing) {
        await portalApi(`/keys/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload()),
        });
        setOpen(false);
      } else {
        const res = await portalApi<{ key: string }>("/keys", {
          method: "POST",
          body: JSON.stringify(payload()),
        });
        setCreatedKey(res.key);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function toggleEnabled(row: KeyRow) {
    try {
      await portalApi(`/keys/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !(row.enabled !== false) }),
      });
      await load();
    } catch (e) {
      setToastTone("err");
      setToast(e instanceof Error ? e.message : "更新失败");
    }
  }

  async function ensureFullKey(id: string): Promise<string | null> {
    if (revealedKeys[id]) return revealedKeys[id];
    const res = await portalApi<{ key: string | null }>(`/keys/${id}`);
    if (res.key) {
      setRevealedKeys((m) => ({ ...m, [id]: res.key! }));
      return res.key;
    }
    return null;
  }

  async function toggleReveal(row: KeyRow) {
    if (revealId === row.id) {
      setRevealId(null);
      return;
    }
    try {
      await ensureFullKey(row.id);
      setRevealId(row.id);
    } catch (e) {
      setToastTone("err");
      setToast(e instanceof Error ? e.message : "无法查看密钥");
    }
  }

  async function remove(row: KeyRow) {
    const ok = await softConfirm({
      title: "删除密钥",
      message: `确定删除密钥「${row.name}」？此操作不可恢复。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    await portalApi(`/keys/${row.id}`, { method: "DELETE" });
    setRevealId((id) => (id === row.id ? null : id));
    setRevealedKeys((m) => {
      const next = { ...m };
      delete next[row.id];
      return next;
    });
    await load();
  }

  async function copyKey(text: string) {
    const ok = await copyText(text);
    setToastTone(ok ? "ok" : "err");
    setToast(ok ? "复制成功!" : "复制失败");
  }

  async function copyRow(row: KeyRow) {
    try {
      const full = await ensureFullKey(row.id);
      if (!full) {
        setToastTone("err");
        setToast("无法复制密钥");
        return;
      }
      await copyKey(full);
    } catch (e) {
      setToastTone("err");
      setToast(e instanceof Error ? e.message : "复制失败");
    }
  }

  return (
    <div className="portal-page">
      <SoftToast message={toast} tone={toastTone} onDone={() => setToast(null)} />

      <div className="portal-hero">
        <div>
          <h1>API 密钥</h1>
          <p>一把密钥调用多家模型。可设日/月/总额度、模型范围和 IP 白名单。</p>
        </div>
      </div>

      {error && !open ? <div className="alert">{error}</div> : null}

      <div className="portal-toolbar ak-toolbar">
        <input
          className="search portal-search"
          placeholder="按名称、备注或密钥前缀搜索"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
        />
        <button type="button" className="portal-btn" onClick={startCreate}>
          创建 API Key
        </button>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="table ak-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>Key</th>
                <th>状态</th>
                <th>额度</th>
                <th>模型</th>
                <th>最新使用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const full = revealedKeys[r.id] ?? null;
                const revealed = revealId === r.id && !!full;
                const shown = revealed && full ? full : maskKey(r.key, r.keyPrefix);
                const on = r.enabled !== false;
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      {r.remark ? <div className="muted">{r.remark}</div> : null}
                    </td>
                    <td className="key-td">
                      <div className="key-cell">
                        <span
                          className={`key-pill mono ${revealed ? "is-revealed" : "is-masked"}`}
                        >
                          {shown}
                        </span>
                        <span className="key-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            title={revealed ? "隐藏" : "显示"}
                            onClick={() => void toggleReveal(r)}
                          >
                            {revealed ? <IconEyeOff /> : <IconEye />}
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="复制"
                            onClick={() => void copyRow(r)}
                          >
                            <IconCopy />
                          </button>
                        </span>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`badge ${on ? "ok" : "danger"}`}
                        onClick={() => void toggleEnabled(r)}
                        title={on ? "点击停用" : "点击启用"}
                      >
                        {on ? "启用" : "停用"}
                      </button>
                    </td>
                    <td className="mono">
                      {quotaLabel(r.remainingQuota ?? r.quota)}
                      {r.quota != null && r.quota >= 0 ? ` / ${quotaLabel(r.quota)}` : ""}
                    </td>
                    <td>
                      {(r.allowedModels ?? []).length
                        ? `${r.allowedModels!.length} 个`
                        : "全部"}
                    </td>
                    <td className="mono">{ymd(r.lastUsedAt)}</td>
                    <td>
                      <div className="tk-ops">
                        <button
                          type="button"
                          className="icon-btn"
                          title="修改"
                          onClick={() => startEdit(r)}
                        >
                          <IconPencil />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="删除"
                          onClick={() => void remove(r)}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length ? (
                <tr>
                  <td colSpan={7} className="empty">
                    <div className="portal-empty" style={{ padding: 24 }}>
                      <strong>还没有密钥</strong>
                      <p>创建一把 sk，填进 Cursor / Claude Code 就能调模型。</p>
                      <div className="portal-empty-actions">
                        <button type="button" className="portal-btn" onClick={startCreate}>
                          创建 API Key
                        </button>
                        <Link className="portal-btn ghost" to="/app/docs">
                          看接入说明
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <ModalBackdrop onClose={() => { if (!createdKey) setOpen(false); }}>
          <form
            className="modal modal-md"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmit}
          >
            <div className="modal-user-head">
              <h3>
                {editing ? "修改 API 密钥" : createdKey ? "密钥已创建" : "创建 API Key"}
              </h3>
              <p>
                {createdKey
                  ? "请立即复制完整密钥，关闭后仅能查看脱敏值"
                  : "额度留空表示不限，实际花费仍按账户余额扣费。"}
              </p>
            </div>
            {error ? <div className="alert">{error}</div> : null}
            {createdKey ? (
              <div className="ak-created">
                <code className="mono">{createdKey}</code>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void copyKey(createdKey)}
                >
                  复制
                </button>
              </div>
            ) : (
              <>
                <label className="stack-field">
                  <span>
                    名称 <em>*</em>
                  </span>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例如 Cursor / 测试"
                  />
                </label>
                <label className="stack-field">
                  <span>备注</span>
                  <input
                    value={form.remark}
                    onChange={(e) => setForm({ ...form, remark: e.target.value })}
                    placeholder="用途，方便自己认"
                  />
                </label>
                <label className="auth-check" style={{ margin: "4px 0 8px" }}>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  />
                  启用这把密钥
                </label>
                <div className="portal-estimate-grid">
                  <label className="stack-field">
                    <span>总额度（tokens）</span>
                    <input
                      value={form.quota}
                      onChange={(e) => setForm({ ...form, quota: e.target.value })}
                      placeholder="不限"
                    />
                  </label>
                  <label className="stack-field">
                    <span>日额度</span>
                    <input
                      value={form.dailyQuota}
                      onChange={(e) => setForm({ ...form, dailyQuota: e.target.value })}
                      placeholder="不限"
                    />
                  </label>
                  <label className="stack-field">
                    <span>月额度</span>
                    <input
                      value={form.monthlyQuota}
                      onChange={(e) => setForm({ ...form, monthlyQuota: e.target.value })}
                      placeholder="不限"
                    />
                  </label>
                  <label className="stack-field">
                    <span>每分钟请求上限</span>
                    <input
                      value={form.rateLimit}
                      onChange={(e) => setForm({ ...form, rateLimit: e.target.value })}
                    />
                  </label>
                </div>
                <label className="stack-field">
                  <span>可用模型（空 = 全部）</span>
                  <ModelPicker
                    options={models}
                    value={form.allowedModels}
                    onChange={(allowedModels) => setForm({ ...form, allowedModels })}
                  />
                </label>
                <label className="stack-field">
                  <span>IP 白名单（每行一个，空 = 不限）</span>
                  <textarea
                    rows={3}
                    value={form.ipText}
                    onChange={(e) => setForm({ ...form, ipText: e.target.value })}
                    placeholder="例如 1.2.3.4 或 10.0.0.0/24"
                  />
                </label>
              </>
            )}
            <div className="modal-actions">
              {createdKey ? (
                <button type="button" className="btn" onClick={() => setOpen(false)}>
                  完成
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setOpen(false)}
                  >
                    取消
                  </button>
                  <button className="btn">{editing ? "保存" : "创建"}</button>
                </>
              )}
            </div>
          </form>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}
