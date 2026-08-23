import { FormEvent, useEffect, useMemo, useState } from "react";
import { portalApi } from "../../lib/api";
import { copyText } from "../../lib/copy";
import SoftToast from "../../components/SoftToast";
import { softConfirm } from "../../components/SoftDialog";
import ModalBackdrop from "../../components/ModalBackdrop";
import {
  IconCopy,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconTrash,
} from "../../components/icons";

type KeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  key: string | null;
  lastUsedAt: string | Date | null;
  createdAt: string | Date;
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

export default function PortalKeysPage() {
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [kw, setKw] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KeyRow | null>(null);
  const [name, setName] = useState("");
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
  }, []);

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.keyPrefix.toLowerCase().includes(q) ||
        (revealedKeys[r.id] ?? "").toLowerCase().includes(q),
    );
  }, [rows, kw, revealedKeys]);

  function startCreate() {
    setEditing(null);
    setName("");
    setCreatedKey(null);
    setError("");
    setOpen(true);
  }

  function startEdit(row: KeyRow) {
    setEditing(row);
    setName(row.name);
    setCreatedKey(null);
    setError("");
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editing) {
        await portalApi(`/keys/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name }),
        });
        setOpen(false);
      } else {
        const res = await portalApi<{ key: string }>("/keys", {
          method: "POST",
          body: JSON.stringify({ name, quota: 1_000_000 }),
        });
        setCreatedKey(res.key);
        if (res.key) {
          // keep for reveal after create
        }
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
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
          <p>创建与管理您的访问密钥，保障 StarConverge 接入安全</p>
        </div>
      </div>

      {error && !open ? <div className="alert">{error}</div> : null}

      <div className="portal-toolbar ak-toolbar">
        <input
          className="search portal-search"
          placeholder="按名称或密钥前缀搜索"
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
                <th>创建日期</th>
                <th>最新使用日期</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const full = revealedKeys[r.id] ?? null;
                const revealed = revealId === r.id && !!full;
                const shown = revealed && full ? full : maskKey(r.key, r.keyPrefix);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
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
                    <td className="mono">{ymd(r.createdAt)}</td>
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
                  <td colSpan={5} className="empty">
                    暂无密钥，点击右上角创建
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
            className="modal modal-sm"
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
                  : "为密钥起一个便于识别的名称"}
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
              <label className="stack-field">
                <span>
                  输入API Key的名称 <em>*</em>
                </span>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="输入API Key的名称"
                />
              </label>
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
