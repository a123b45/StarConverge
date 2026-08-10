import { FormEvent, useEffect, useMemo, useState } from "react";
import { portalApi } from "../../lib/api";

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
  const [keys, setKeys] = useState<{ id: string; name: string; key: string | null }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    portalApi<{ data: { id: string; name: string; key: string | null }[] }>("/keys").then(
      async (r) => {
        setKeys(r.data);
        if (r.data[0]) {
          const full = await portalApi<{ key: string | null }>(`/keys/${r.data[0].id}`);
          if (full.key) setApiKey(full.key);
        }
      },
    );
  }, []);

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
    const next = [s, ...sessions];
    persist(next);
    setActiveId(s.id);
  }

  async function pickKey(id: string) {
    const full = await portalApi<{ key: string | null }>(`/keys/${id}`);
    if (full.key) setApiKey(full.key);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || !active || !apiKey || !model) return;
    setBusy(true);
    setError("");
    const userMsg: Msg = { role: "user", content: input.trim(), at: Date.now() };
    const withUser = {
      ...active,
      title: active.messages.length ? active.title : userMsg.content.slice(0, 24),
      messages: [...active.messages, userMsg],
    };
    persist(sessions.map((s) => (s.id === active.id ? withUser : s)));
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
        const next = prev.map((s) => (s.id === active.id ? final : s));
        saveSessions(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-chat">
      <aside className="portal-chat-side">
        <button className="portal-btn" type="button" onClick={newChat}>
          + 新对话
        </button>
        <div className="portal-chat-list">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={s.id === activeId ? "active" : ""}
              onClick={() => setActiveId(s.id)}
            >
              {s.title || "未命名"}
            </button>
          ))}
        </div>
      </aside>
      <section className="portal-chat-main">
        <header>
          <div>
            <strong>StarConverge 助手</strong>
            <span className="ok-dot">系统在线</span>
          </div>
          <div className="portal-chat-controls">
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              onChange={(e) => void pickKey(e.target.value)}
              defaultValue={keys[0]?.id}
            >
              {keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </div>
        </header>
        {error ? <div className="alert">{error}</div> : null}
        <div className="portal-chat-messages">
          {!active?.messages.length ? (
            <div className="portal-empty">选择模型后开始对话测试</div>
          ) : (
            active.messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                <div className="content">{m.content}</div>
                <div className="meta">
                  {new Date(m.at).toLocaleTimeString()}
                  {m.model ? ` · ${m.model}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
        <form className="portal-chat-input" onSubmit={send}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={model ? `发送消息给 ${model}…` : "请先选择模型"}
            disabled={busy || !apiKey}
          />
          <button className="portal-btn" disabled={busy || !apiKey}>
            发送
          </button>
        </form>
        {!apiKey ? (
          <p className="muted" style={{ padding: "0 16px 12px" }}>
            请先在「API 密钥」创建密钥后再测试
          </p>
        ) : null}
      </section>
    </div>
  );
}
