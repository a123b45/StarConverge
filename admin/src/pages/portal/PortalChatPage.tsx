import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { portalApi } from "../../lib/api";
import { IconMore, IconSidebar } from "../../components/icons";
import SoftSelect from "../../components/SoftSelect";
import { softConfirm, softPrompt } from "../../components/SoftDialog";

type Msg = { role: "user" | "assistant"; content: string; at: number; model?: string };
type Session = {
  id: string;
  title: string;
  messages: Msg[];
  pinned?: boolean;
  updatedAt?: number;
};

const STORE = "sc_portal_chats";

function sortSessions(list: Session[]): Session[] {
  return [...list].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
}

function loadSessions(): Session[] {
  try {
    return sortSessions(JSON.parse(localStorage.getItem(STORE) || "[]") as Session[]);
  } catch {
    return [];
  }
}

function saveSessions(list: Session[]) {
  localStorage.setItem(STORE, JSON.stringify(list));
}

export default function PortalChatPage() {
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string>(() => sessions[0]?.id ?? "");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyId, setKeyId] = useState("");
  const [keys, setKeys] = useState<{ id: string; name: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  useEffect(() => {
    portalApi<{ data: { model: string }[] }>("/models").then((r) => {
      const ids = r.data.map((m) => m.model);
      setModels(ids);
      if (ids[0]) setModel(ids[0]);
    });
    portalApi<{ data: { id: string; name: string }[] }>("/keys").then(async (r) => {
      setKeys(r.data);
      if (r.data[0]) {
        setKeyId(r.data[0].id);
        const full = await portalApi<{ key: string | null }>(`/keys/${r.data[0].id}`);
        if (full.key) setApiKey(full.key);
      }
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, busy]);

  useEffect(() => {
    if (!menuId) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      const el = t as HTMLElement;
      if (el.closest?.(".ds-session-more")) return;
      setMenuId(null);
      setMenuPos(null);
    }
    function onEsc(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuId(null);
        setMenuPos(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuId]);

  function persist(next: Session[]) {
    const sorted = sortSessions(next);
    setSessions(sorted);
    saveSessions(sorted);
  }

  function newChat() {
    const s: Session = {
      id: `s_${Date.now()}`,
      title: "新对话",
      messages: [],
      updatedAt: Date.now(),
    };
    persist([s, ...sessions]);
    setActiveId(s.id);
    setError("");
    setMenuId(null);
  }

  async function pickKey(id: string) {
    setKeyId(id);
    const full = await portalApi<{ key: string | null }>(`/keys/${id}`);
    if (full.key) setApiKey(full.key);
  }

  function openSessionMenu(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    e.preventDefault();
    if (menuId === id) {
      setMenuId(null);
      setMenuPos(null);
      return;
    }
    const btn = e.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    const width = 148;
    let left = r.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setMenuPos({ top: r.bottom + 4, left });
    setMenuId(id);
  }

  async function renameSession(id: string) {
    setMenuId(null);
    setMenuPos(null);
    const cur = sessions.find((s) => s.id === id);
    if (!cur) return;
    const name = await softPrompt({
      title: "重命名对话",
      message: "输入新的对话标题",
      defaultValue: cur.title,
      placeholder: "对话标题",
      confirmText: "保存",
      minLength: 1,
    });
    if (name == null) return;
    const title = name.trim();
    if (!title) return;
    persist(
      sessions.map((s) =>
        s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
      ),
    );
  }

  function togglePin(id: string) {
    setMenuId(null);
    setMenuPos(null);
    persist(
      sessions.map((s) =>
        s.id === id ? { ...s, pinned: !s.pinned, updatedAt: Date.now() } : s,
      ),
    );
  }

  async function deleteSession(id: string) {
    setMenuId(null);
    setMenuPos(null);
    const cur = sessions.find((s) => s.id === id);
    const ok = await softConfirm({
      title: "删除对话",
      message: `确定删除「${cur?.title || "未命名"}」吗？此操作不可恢复。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const next = sessions.filter((s) => s.id !== id);
    persist(next);
    if (activeId === id) {
      setActiveId(next[0]?.id ?? "");
    }
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!input.trim() || !apiKey || !model) return;
    let current = active;
    if (!current) {
      current = {
        id: `s_${Date.now()}`,
        title: "新对话",
        messages: [],
        updatedAt: Date.now(),
      };
      persist([current, ...sessions]);
      setActiveId(current.id);
    }

    setBusy(true);
    setError("");
    const userMsg: Msg = { role: "user", content: input.trim(), at: Date.now() };
    const withUser: Session = {
      ...current,
      title: current.messages.length ? current.title : userMsg.content.slice(0, 28),
      messages: [...current.messages, userMsg],
      updatedAt: Date.now(),
    };
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === withUser.id);
      const next = sortSessions(
        exists
          ? prev.map((s) => (s.id === withUser.id ? withUser : s))
          : [withUser, ...prev],
      );
      saveSessions(next);
      return next;
    });
    setInput("");

    try {
      const res = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: withUser.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.error || res.statusText);
      }
      const content =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.text ??
        JSON.stringify(data);
      const assistant: Msg = {
        role: "assistant",
        content: String(content),
        at: Date.now(),
        model,
      };
      const final: Session = {
        ...withUser,
        messages: [...withUser.messages, assistant],
        updatedAt: Date.now(),
      };
      setSessions((prev) => {
        const next = sortSessions(prev.map((s) => (s.id === final.id ? final : s)));
        saveSessions(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className={`ds-chat${sideCollapsed ? " side-collapsed" : ""}`}>
      <aside className="ds-side">
        <button className="ds-new" type="button" onClick={newChat}>
          <span>+</span> 开启新对话
        </button>
        <div className="ds-side-label">历史对话</div>
        <div className="ds-session-list">
          {sessions.length === 0 ? (
            <p className="ds-side-empty">暂无会话</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`ds-session-item${s.id === activeId ? " active" : ""}${
                  s.pinned ? " pinned" : ""
                }`}
              >
                <button
                  type="button"
                  className="ds-session-main"
                  onClick={() => setActiveId(s.id)}
                  title={s.title}
                >
                  {s.pinned ? <span className="ds-session-pin" aria-hidden /> : null}
                  <span className="ds-session-title">{s.title || "未命名"}</span>
                </button>
                <button
                  type="button"
                  className={`ds-session-more${menuId === s.id ? " open" : ""}`}
                  aria-label="更多操作"
                  title="更多操作"
                  onClick={(e) => openSessionMenu(e, s.id)}
                >
                  <IconMore size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="ds-main">
        <header className="ds-toolbar">
          <div className="ds-title">
            <button
              type="button"
              className="ds-side-toggle"
              title={sideCollapsed ? "展开历史对话" : "收起历史对话"}
              aria-label={sideCollapsed ? "展开历史对话" : "收起历史对话"}
              onClick={() => setSideCollapsed((v) => !v)}
            >
              <IconSidebar />
            </button>
            <h1>{active?.title || "对话测试"}</h1>
            <span className="ds-online">
              <i />
              在线
            </span>
          </div>
          <div className="ds-toolbar-right">
            <label className="ds-select">
              <span>模型</span>
              <SoftSelect
                className="soft-select-filter soft-select-sm"
                ariaLabel="模型"
                value={model}
                onChange={setModel}
                options={
                  models.length === 0
                    ? [{ value: "", label: "暂无模型" }]
                    : models.map((m) => ({ value: m, label: m }))
                }
              />
            </label>
            <label className="ds-select">
              <span>密钥</span>
              <SoftSelect
                className="soft-select-filter soft-select-sm"
                ariaLabel="密钥"
                value={keyId}
                onChange={(id) => void pickKey(id)}
                options={
                  keys.length === 0
                    ? [{ value: "", label: "未创建" }]
                    : keys.map((k) => ({ value: k.id, label: k.name }))
                }
              />
            </label>
          </div>
        </header>

        <div className="ds-messages">
          {!active?.messages.length ? (
            <div className="ds-welcome">
              <div className="ds-welcome-mark">in</div>
              <h2>开始一次对话测试</h2>
              <p>选择模型与 API 密钥后，在下方输入消息即可调用网关。</p>
              {!apiKey ? (
                <p className="ds-hint">
                  还没有密钥？先去 <Link to="/app/keys">API 密钥</Link> 创建。
                </p>
              ) : null}
            </div>
          ) : (
            <div className="ds-thread">
              {active.messages.map((m, i) => (
                <div key={i} className={`ds-msg ${m.role}`}>
                    <div className="ds-avatar">{m.role === "user" ? "你" : "in"}</div>
                  <div className="ds-msg-body">
                    <div className="ds-msg-text">{m.content}</div>
                    <div className="ds-msg-meta">
                      {new Date(m.at).toLocaleTimeString()}
                      {m.model ? ` · ${m.model}` : ""}
                    </div>
                  </div>
                </div>
              ))}
              {busy ? (
                <div className="ds-msg assistant">
                  <div className="ds-avatar">in</div>
                  <div className="ds-msg-body">
                    <div className="ds-typing">正在生成…</div>
                  </div>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="ds-composer-wrap">
          {error ? <div className="ds-error">{error}</div> : null}
          <form className="ds-composer" onSubmit={(e) => void send(e)}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                !apiKey
                  ? "请先创建 API 密钥…"
                  : model
                    ? `给 ${model} 发送消息`
                    : "请先选择模型…"
              }
              rows={1}
              disabled={busy || !apiKey || !model}
            />
            <div className="ds-composer-bar">
              <span className="ds-composer-tip">Enter 发送 · Shift+Enter 换行</span>
              <button
                type="submit"
                className="ds-send"
                disabled={busy || !apiKey || !model || !input.trim()}
                aria-label="发送"
              >
                ↑
              </button>
            </div>
          </form>
        </div>
      </section>
      {menuId && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              className="ds-session-menu"
              style={{ top: menuPos.top, left: menuPos.left }}
              role="menu"
            >
              <button type="button" role="menuitem" onClick={() => void renameSession(menuId)}>
                重命名
              </button>
              <button type="button" role="menuitem" onClick={() => togglePin(menuId)}>
                {sessions.find((s) => s.id === menuId)?.pinned ? "取消置顶" : "置顶"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => void deleteSession(menuId)}
              >
                删除
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
