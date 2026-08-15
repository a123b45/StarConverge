import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { copyText } from "../lib/copy";
import SoftToast from "../components/SoftToast";
import { softConfirm } from "../components/SoftDialog";
import { IconCopy, IconEye, IconEyeOff, IconPencil, IconTrash } from "../components/icons";

type Token = {
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
  if (key && key.length > 12) {
    return `${key.slice(0, 7)}*****${key.slice(-4)}`;
  }
  return `${prefix}*****`;
}

export default function ApiKeysPage() {
  const [rows, setRows] = useState<Token[]>([]);
  const [kw, setKw] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Token | null>(null);
  const [name, setName] = useState("");
  const [revealId, setRevealId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"ok" | "err">("ok");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  async function load() {
    const tok = await api<{ data: Token[] }>("/tokens");
    setRows(tok.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.keyPrefix.toLowerCase().includes(q) ||
        (r.key ?? "").toLowerCase().includes(q),
    );
  }, [rows, kw]);

  function startCreate() {
    setEditing(null);
    setName("");
    setCreatedKey(null);
    setOpen(true);
  }

  function startEdit(row: Token) {
    setEditing(row);
    setName(row.name);
    setCreatedKey(null);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editing) {
        await api(`/tokens/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ name }),
        });
        setOpen(false);
      } else {
        const res = await api<{ data: Token; key: string }>("/tokens", {
          method: "POST",
          body: JSON.stringify({
            name,
            quota: -1,
            rateLimit: 60,
            allowedModels: [],
            ipRules: [],
            routeIds: [],
            concurrency: 0,
            enabled: true,
          }),
        });
        setCreatedKey(res.key);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function remove(row: Token) {
    const ok = await softConfirm({
      title: "删除密钥",
      message: `确定删除密钥「${row.name}」？此操作不可恢复。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    await api(`/tokens/${row.id}`, { method: "DELETE" });
    await load();
  }

  async function copyKey(key: string) {
    const ok = await copyText(key);
    setToastTone(ok ? "ok" : "err");
    setToast(ok ? "复制成功!" : "复制失败");
  }

  return (
    <>
      <SoftToast
        message={toast}
        tone={toastTone}
        onDone={() => setToast(null)}
      />

      <div className="topbar">
        <div className="page-head">
          <h2>API 密钥</h2>
          <p>创建与删除访问密钥；限额与路由请到「密钥管理」配置</p>
        </div>
        <button className="btn" onClick={startCreate}>
          创建 API Key
        </button>
      </div>

      {error && !open ? <div className="alert">{error}</div> : null}

      <div className="ak-toolbar">
        <input
          className="search"
          placeholder="按名称或密钥前缀搜索"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
        />
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
                const revealed = revealId === r.id && !!r.key;
                const shown = revealed && r.key ? r.key : maskKey(r.key, r.keyPrefix);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                    </td>
                    <td className="key-td">
                      <div className="key-cell">
                        <span className={`key-pill mono ${revealed ? "is-revealed" : "is-masked"}`}>
                          {shown}
                        </span>
                        {r.key ? (
                          <span className="key-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              title={revealed ? "隐藏" : "显示"}
                              onClick={() =>
                                setRevealId((id) => (id === r.id ? null : r.id))
                              }
                            >
                              {revealed ? <IconEyeOff /> : <IconEye />}
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              title="复制"
                              onClick={() => void copyKey(r.key!)}
                            >
                              <IconCopy />
                            </button>
                          </span>
                        ) : null}
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
        <div className="modal-backdrop" onClick={() => !createdKey && setOpen(false)}>
          <form
            className="modal modal-sm"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmit}
          >
            <div className="modal-user-head">
              <h3>{editing ? "修改 API 密钥" : createdKey ? "密钥已创建" : "创建 API Key"}</h3>
              <p>
                {createdKey
                  ? "请立即复制完整密钥，关闭后仅能查看脱敏值"
                  : "仅管理密钥本身；配额/路由/限流请在「密钥管理」中配置"}
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
                  <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                    取消
                  </button>
                  <button className="btn">{editing ? "保存" : "创建"}</button>
                </>
              )}
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
