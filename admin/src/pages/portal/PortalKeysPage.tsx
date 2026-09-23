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
  IconSettings,
  IconTrash,
} from "../../components/icons";
import { normalizeIpRules, type IpRule } from "../../lib/ip-rules";
import { useI18n } from "../../lib/i18n";

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

function quotaLabel(n: number | undefined, unlimited: string) {
  if (n == null || n < 0) return unlimited;
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
  const v = raw.trim();
  if (!v) return -1;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : -1;
}

export default function PortalKeysPage() {
  const { t } = useI18n();
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
  const [advOpen, setAdvOpen] = useState(false);

  async function load() {
    const res = await portalApi<{ data: KeyRow[] }>("/keys");
    setRows(res.data);
  }

  useEffect(() => {
    load().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : t("common.loadFail")),
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
    setAdvOpen(false);
    setOpen(true);
  }

  function startEdit(row: KeyRow) {
    const models = row.allowedModels ?? [];
    const ipText = (row.ipRules ?? [])
      .filter((r) => r.action === "ALLOW")
      .map((r) => r.ip)
      .join("\n");
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
      allowedModels: models,
      ipText,
    });
    setCreatedKey(null);
    setError("");
    setAdvOpen(models.length > 0 || Boolean(ipText.trim()));
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
      setError(err instanceof Error ? err.message : t("common.saveFail"));
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
      setToast(e instanceof Error ? e.message : t("common.updateFail"));
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
      setToast(e instanceof Error ? e.message : t("common.cannotRevealKey"));
    }
  }

  async function remove(row: KeyRow) {
    const ok = await softConfirm({
      title: t("keys.deleteTitle"),
      message: t("keys.deleteMsg", { name: row.name }),
      confirmText: t("common.delete"),
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
    setToast(ok ? t("common.copyOk") : t("common.copyFail"));
  }

  async function copyRow(row: KeyRow) {
    try {
      const full = await ensureFullKey(row.id);
      if (!full) {
        setToastTone("err");
        setToast(t("common.cannotCopyKey"));
        return;
      }
      await copyKey(full);
    } catch (e) {
      setToastTone("err");
      setToast(e instanceof Error ? e.message : t("common.copyFail"));
    }
  }

  return (
    <div className="portal-page">
      <SoftToast message={toast} tone={toastTone} onDone={() => setToast(null)} />

      <div className="portal-hero">
        <div>
          <h1>{t("keys.title")}</h1>
          <p>{t("keys.lead")}</p>
        </div>
      </div>

      {error && !open ? <div className="alert">{error}</div> : null}

      <div className="portal-toolbar ak-toolbar">
        <input
          className="search portal-search"
          placeholder={t("keys.searchPh")}
          value={kw}
          onChange={(e) => setKw(e.target.value)}
        />
        <button type="button" className="portal-btn" onClick={startCreate}>
          {t("keys.createBtn")}
        </button>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="table ak-table">
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("keys.colKey")}</th>
                <th>{t("common.status")}</th>
                <th>{t("keys.colQuota")}</th>
                <th>{t("keys.colModels")}</th>
                <th>{t("keys.colLastUsed")}</th>
                <th>{t("common.operations")}</th>
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
                            title={revealed ? t("common.hide") : t("common.show")}
                            onClick={() => void toggleReveal(r)}
                          >
                            {revealed ? <IconEyeOff /> : <IconEye />}
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title={t("common.copy")}
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
                        title={on ? t("common.clickDisable") : t("common.clickEnable")}
                      >
                        {on ? t("common.enabled") : t("common.disabled")}
                      </button>
                    </td>
                    <td className="mono">
                      {quotaLabel(r.remainingQuota ?? r.quota, t("common.unlimited"))}
                      {r.quota != null && r.quota >= 0
                        ? ` / ${quotaLabel(r.quota, t("common.unlimited"))}`
                        : ""}
                    </td>
                    <td>
                      {(r.allowedModels ?? []).length
                        ? t("common.countItems", { n: r.allowedModels!.length })
                        : t("keys.allModels")}
                    </td>
                    <td className="mono">{ymd(r.lastUsedAt)}</td>
                    <td>
                      <div className="tk-ops">
                        <button
                          type="button"
                          className="icon-btn"
                          title={t("common.edit")}
                          onClick={() => startEdit(r)}
                        >
                          <IconPencil />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title={t("common.delete")}
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
                      <strong>{t("keys.emptyTitle")}</strong>
                      <p>{t("keys.emptyBody")}</p>
                      <div className="portal-empty-actions">
                        <button type="button" className="portal-btn" onClick={startCreate}>
                          {t("keys.createBtn")}
                        </button>
                        <Link className="portal-btn ghost" to="/app/docs">
                          {t("keys.viewDocs")}
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
                {editing
                  ? t("keys.modalEdit")
                  : createdKey
                    ? t("keys.modalCreated")
                    : t("keys.modalCreate")}
              </h3>
              <p>
                {createdKey ? t("keys.modalCreatedHint") : t("keys.modalFormHint")}
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
                  {t("common.copy")}
                </button>
              </div>
            ) : (
              <>
                <label className="stack-field">
                  <span>
                    {t("common.name")} <em>{t("common.requiredMark")}</em>
                  </span>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder={t("keys.namePh")}
                  />
                </label>
                <label className="stack-field">
                  <span>{t("common.remark")}</span>
                  <input
                    value={form.remark}
                    onChange={(e) => setForm({ ...form, remark: e.target.value })}
                    placeholder={t("keys.remarkPh")}
                  />
                </label>
                <label className="auth-check" style={{ margin: "4px 0 8px" }}>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  />
                  {t("keys.enableKey")}
                </label>
                <div className="portal-estimate-grid">
                  <label className="stack-field">
                    <span>{t("keys.quotaTotal")}</span>
                    <input
                      value={form.quota}
                      onChange={(e) => setForm({ ...form, quota: e.target.value })}
                      placeholder={t("common.unlimited")}
                    />
                  </label>
                  <label className="stack-field">
                    <span>{t("keys.quotaDaily")}</span>
                    <input
                      value={form.dailyQuota}
                      onChange={(e) => setForm({ ...form, dailyQuota: e.target.value })}
                      placeholder={t("common.unlimited")}
                    />
                  </label>
                  <label className="stack-field">
                    <span>{t("keys.quotaMonthly")}</span>
                    <input
                      value={form.monthlyQuota}
                      onChange={(e) => setForm({ ...form, monthlyQuota: e.target.value })}
                      placeholder={t("common.unlimited")}
                    />
                  </label>
                  <label className="stack-field">
                    <span>{t("keys.rateLimit")}</span>
                    <input
                      value={form.rateLimit}
                      onChange={(e) => setForm({ ...form, rateLimit: e.target.value })}
                    />
                  </label>
                </div>
                <div className={`portal-adv ${advOpen ? "is-open" : ""}`}>
                  <button
                    type="button"
                    className="portal-adv-toggle"
                    aria-expanded={advOpen}
                    onClick={() => setAdvOpen((v) => !v)}
                  >
                    <span className="portal-adv-icon" aria-hidden>
                      <IconSettings size={16} />
                    </span>
                    <span className="portal-adv-copy">
                      <strong>{t("keys.advTitle")}</strong>
                      <small>{t("keys.advSub")}</small>
                    </span>
                    <span className="portal-adv-chevron" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M6 9l6 6 6-6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                  {advOpen ? (
                    <div className="portal-adv-body">
                      <label className="stack-field">
                        <span>{t("keys.allowedModels")}</span>
                        <ModelPicker
                          options={models}
                          value={form.allowedModels}
                          onChange={(allowedModels) => setForm({ ...form, allowedModels })}
                        />
                        <p className="muted portal-adv-hint">{t("keys.allowedModelsHint")}</p>
                      </label>
                      <label className="stack-field">
                        <span>{t("keys.ipAllowlist")}</span>
                        <textarea
                          className="portal-ip-area mono"
                          rows={4}
                          value={form.ipText}
                          onChange={(e) => setForm({ ...form, ipText: e.target.value })}
                          placeholder={t("keys.ipPh")}
                        />
                        <p className="muted portal-adv-hint">{t("keys.ipWarn")}</p>
                      </label>
                    </div>
                  ) : null}
                </div>
              </>
            )}
            <div className="modal-actions">
              {createdKey ? (
                <button type="button" className="btn" onClick={() => setOpen(false)}>
                  {t("common.done")}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setOpen(false)}
                  >
                    {t("common.cancel")}
                  </button>
                  <button className="btn">
                    {editing ? t("common.save") : t("common.create")}
                  </button>
                </>
              )}
            </div>
          </form>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}
