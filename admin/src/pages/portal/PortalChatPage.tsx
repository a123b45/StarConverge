import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "../../lib/api";
import { IconSidebar } from "../../components/icons";

type Msg = { role: "user" | "assistant"; content: string; at: number; model?: string };
type Session = { id: string; title: string; messages: Msg[] };

const STORE = "sc_portal_chats";

function loadSessions(): Session[] {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "[]") as Session[];
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
  const [keys, setKeys] = useState<{ id: string; name: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sideCollapsed, setSideCollapsed] = useState(false);
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
        const full = await portalApi<{ key: string | null }>(`/keys/${r.data[0].id}`);
        if (full.key) setApiKey(full.key);
      }
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, busy]);

  function persist(next: Session[]) {
    setSessions(next);
    saveSessions(next);
  }

  function newChat() {
    const s: Session = {
      id: `s_${Date.now()}`,
      title: "新对话",
      messages: [],
    };
    persist([s, ...sessions]);
    setActiveId(s.id);
    setError("");
  }

  async function pickKey(id: string) {
    const full = await portalApi<{ key: string | null }>(`/keys/${id}`);
    if (full.key) setApiKey(full.key);
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!input.trim() || !apiKey || !model) return;
    let current = active;
    if (!current) {
      current = { id: `s_${Date.now()}`, title: "新对话", messages: [] };
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
    };
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === withUser.id);
      const next = exists
        ? prev.map((s) => (s.id === withUser.id ? withUser : s))
        : [withUser, ...prev];
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
      };
      setSessions((prev) => {
        const next = prev.map((s) => (s.id === final.id ? final : s));
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
              <button
                key={s.id}
                type="button"
                className={s.id === activeId ? "active" : ""}
                onClick={() => setActiveId(s.id)}
                title={s.title}
              >
                {s.title || "未命名"}
              </button>
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
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {models.length === 0 ? <option value="">暂无模型</option> : null}
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="ds-select">
              <span>密钥</span>
              <select
                defaultValue={keys[0]?.id}
                onChange={(e) => void pickKey(e.target.value)}
              >
                {keys.length === 0 ? <option value="">未创建</option> : null}
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <div className="ds-messages">
          {!active?.messages.length ? (
            <div className="ds-welcome">
              <div className="ds-welcome-mark">SC</div>
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
                  <div className="ds-avatar">{m.role === "user" ? "你" : "SC"}</div>
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
                  <div className="ds-avatar">SC</div>
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
    </div>
  );
}
