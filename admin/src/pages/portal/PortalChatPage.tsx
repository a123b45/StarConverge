import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { portalApi } from "../../lib/api";
import { IconMore, IconSidebar, IconStop } from "../../components/icons";
import SoftSelect from "../../components/SoftSelect";
import BrandLogo from "../../components/BrandLogo";
import { softConfirm, softPrompt } from "../../components/SoftDialog";
import { detectModelModality } from "../../lib/model-taxonomy";
import { useI18n } from "../../lib/i18n";

type Msg = {
  role: "user" | "assistant";
  content: string;
  images?: string[];
  at: number;
  model?: string;
  variant?: "balance" | "aborted" | "error";
};
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

function toApiContent(text: string, imgs: string[]) {
  if (!imgs.length) return text;
  return [
    { type: "text" as const, text },
    ...imgs.map((url) => ({ type: "image_url" as const, image_url: { url } })),
  ];
}

/** Successful turns only. Failed / aborted user+assistant pairs stay on screen but are not billed or sent upstream. */
function historyForApi(messages: Msg[]): Array<{ role: string; content: unknown }> {
  const out: Array<{ role: string; content: unknown }> = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (m.role !== "user") {
      i += 1;
      continue;
    }
    const following: Msg[] = [];
    let j = i + 1;
    while (j < messages.length && messages[j]!.role === "assistant") {
      following.push(messages[j]!);
      j += 1;
    }
    const succeeded = following.filter((a) => !a.variant);
    const isCurrentSend =
      j === messages.length && following.length === 0 && !m.variant;
    if (!m.variant && (isCurrentSend || succeeded.length > 0)) {
      out.push({ role: "user", content: toApiContent(m.content, m.images ?? []) });
      for (const a of succeeded) {
        out.push({ role: "assistant", content: a.content });
      }
    }
    i = j;
  }
  return out;
}

export default function PortalChatPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string>(() => sessions[0]?.id ?? "");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState(params.get("model") || "");
  const [compareOn, setCompareOn] = useState(Boolean(params.get("compare")));
  const [compareModel, setCompareModel] = useState(
    (params.get("compare") || "").split(",")[0] || "",
  );
  const [apiKey, setApiKey] = useState("");
  const [keyId, setKeyId] = useState("");
  const [keys, setKeys] = useState<{ id: string; name: string }[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  async function refreshBalance() {
    try {
      const me = await portalApi<{ balance?: number; totalRecharged?: number }>("/me");
      window.dispatchEvent(
        new CustomEvent("sc:balance-updated", {
          detail: { balance: me.balance ?? 0, totalRecharged: me.totalRecharged },
        }),
      );
    } catch {
      /* keep last known */
    }
  }

  useEffect(() => {
    portalApi<{ data: { model: string; retired?: boolean }[] }>("/models").then((r) => {
      const ids = r.data.filter((m) => !m.retired).map((m) => m.model);
      setModels(ids);
      setModel((cur) => cur || ids[0] || "");
      setCompareModel((cur) => cur || ids.find((id) => id !== (params.get("model") || ids[0])) || "");
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
      title: t("chat.newSession"),
      messages: [],
      updatedAt: Date.now(),
    };
    persist([s, ...sessions]);
    setActiveId(s.id);
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
      title: t("chat.renameTitle"),
      message: t("chat.renameMsg"),
      defaultValue: cur.title,
      placeholder: t("chat.renamePh"),
      confirmText: t("common.save"),
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
      title: t("chat.deleteTitle"),
      message: t("chat.deleteMsg", {
        title: cur?.title || t("common.unnamed"),
      }),
      confirmText: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    const next = sessions.filter((s) => s.id !== id);
    persist(next);
    if (activeId === id) {
      setActiveId(next[0]?.id ?? "");
    }
  }

  function upsertSession(next: Session) {
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === next.id);
      const list = exists
        ? prev.map((s) => (s.id === next.id ? next : s))
        : [next, ...prev];
      const sorted = sortSessions(list);
      saveSessions(sorted);
      return sorted;
    });
  }

  function stopGenerating() {
    abortRef.current?.abort();
  }

  async function readSse(
    res: Response,
    onDelta: (text: string) => void,
  ): Promise<string> {
    if (!res.body) {
      const data = await res.json().catch(() => ({}));
      return String(
        data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "",
      );
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
          };
          const piece =
            json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
          if (piece) {
            full += piece;
            onDelta(full);
          }
        } catch {
          /* ignore */
        }
      }
    }
    return full;
  }

  async function completeOne(
    modelId: string,
    messages: Array<{ role: string; content: unknown }>,
    onDelta?: (text: string) => void,
  ) {
    const res = await fetch("/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: abortRef.current?.signal,
      body: JSON.stringify({
        model: modelId,
        stream: Boolean(onDelta),
        messages,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const raw =
        (typeof data?.error?.message === "string" && data.error.message) ||
        (typeof data?.error === "string" && data.error) ||
        res.statusText;
      const err = new Error(String(raw));
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    if (onDelta) return readSse(res, onDelta);
    const data = await res.json().catch(() => ({}));
    return String(
      data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "",
    );
  }

  async function send(e?: FormEvent, preset?: string) {
    e?.preventDefault();
    const text = (preset ?? input).trim();
    if (busy || (!text && !images.length) || !apiKey || !model) return;
    let current = active;
    if (!current) {
      current = {
        id: `s_${Date.now()}`,
        title: t("chat.newSession"),
        messages: [],
        updatedAt: Date.now(),
      };
      persist([current, ...sessions]);
      setActiveId(current.id);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    const userMsg: Msg = {
      role: "user",
      content: text,
      images: images.length ? [...images] : undefined,
      at: Date.now(),
    };
    const withUser: Session = {
      ...current,
      title: current.messages.length
        ? current.title
        : (text || t("chat.imageTitle")).slice(0, 28),
      messages: [...current.messages, userMsg],
      updatedAt: Date.now(),
    };
    upsertSession(withUser);
    setInput("");
    setImages([]);

    const history = historyForApi(withUser.messages);
    const targets = compareOn && compareModel && compareModel !== model
      ? [model, compareModel]
      : [model];

    try {
      if (targets.length === 1) {
        const placeholder: Msg = {
          role: "assistant",
          content: "",
          at: Date.now(),
          model,
        };
        upsertSession({
          ...withUser,
          messages: [...withUser.messages, placeholder],
          updatedAt: Date.now(),
        });
        const content = await completeOne(model, history, (full) => {
          upsertSession({
            ...withUser,
            messages: [
              ...withUser.messages,
              { ...placeholder, content: full, at: Date.now() },
            ],
            updatedAt: Date.now(),
          });
        });
        upsertSession({
          ...withUser,
          messages: [
            ...withUser.messages,
            { ...placeholder, content: content || t("chat.emptyReply"), at: Date.now() },
          ],
          updatedAt: Date.now(),
        });
      } else {
        const results = await Promise.all(
          targets.map(async (mid) => {
            try {
              const content = await completeOne(mid, history);
              return { mid, content, err: null as string | null, status: 200 };
            } catch (err) {
              const status = (err as Error & { status?: number }).status ?? 0;
              return {
                mid,
                content: err instanceof Error ? err.message : t("common.failure"),
                err: "error" as const,
                status,
              };
            }
          }),
        );
        const extras: Msg[] = results.map((r) =>
          r.err
            ? assistantFromError(r.status, r.content, r.mid)
            : {
                role: "assistant" as const,
                content: r.content || t("chat.emptyReply"),
                at: Date.now(),
                model: r.mid,
              },
        );
        const allFailed = extras.length > 0 && extras.every((m) => m.variant);
        upsertSession({
          ...withUser,
          messages: [
            ...withUser.messages.slice(0, -1),
            allFailed ? { ...userMsg, variant: extras[0]!.variant } : userMsg,
            ...extras,
          ],
          updatedAt: Date.now(),
        });
      }
      void refreshBalance();
    } catch (err) {
      const aborted =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      const status = (err as Error & { status?: number }).status ?? 0;
      const assistant = aborted
        ? {
            role: "assistant" as const,
            content: t("chat.stopped"),
            at: Date.now(),
            model,
            variant: "aborted" as const,
          }
        : assistantFromError(
            status,
            err instanceof Error ? err.message : t("common.sendFail"),
          );
      upsertSession({
        ...withUser,
        messages: [
          ...withUser.messages.slice(0, -1),
          { ...userMsg, variant: assistant.variant },
          assistant,
        ],
        updatedAt: Date.now(),
      });
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function assistantFromError(status: number, raw: string, mid = model): Msg {
    const text = raw.trim();
    const balanceFail =
      status === 402 ||
      /余额不足|insufficient_balance|insufficient_quota/i.test(text);
    if (balanceFail) {
      return {
        role: "assistant",
        content: t("chat.balanceError"),
        at: Date.now(),
        model: mid,
        variant: "balance",
      };
    }
    const upstreamFail =
      status >= 500 ||
      /upstream failed|服务暂时不可用|channel\s+.+:\s*\d{3}/i.test(text);
    return {
      role: "assistant",
      content: upstreamFail
        ? t("chat.upstreamError")
        : text || t("common.sendFail"),
      at: Date.now(),
      model: mid,
      variant: "error",
    };
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
          <span>+</span> {t("chat.newChat")}
        </button>
        <div className="ds-side-label">{t("chat.history")}</div>
        <div className="ds-session-list">
          {sessions.length === 0 ? (
            <p className="ds-side-empty">{t("chat.noSessions")}</p>
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
                  <span className="ds-session-title">{s.title || t("common.unnamed")}</span>
                </button>
                <button
                  type="button"
                  className={`ds-session-more${menuId === s.id ? " open" : ""}`}
                  aria-label={t("chat.moreActions")}
                  title={t("chat.moreActions")}
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
              title={sideCollapsed ? t("chat.expandHistory") : t("chat.collapseHistory")}
              aria-label={sideCollapsed ? t("chat.expandHistory") : t("chat.collapseHistory")}
              onClick={() => setSideCollapsed((v) => !v)}
            >
              <IconSidebar />
            </button>
            <h1>{active?.title || t("chat.defaultTitle")}</h1>
            <span className="ds-online">
              <i />
              {t("chat.online")}
            </span>
          </div>
          <div className="ds-toolbar-right">
            <label className="ds-select">
              <span>{t("chat.modelLabel")}</span>
              <SoftSelect
                className="soft-select-filter soft-select-sm"
                ariaLabel={t("chat.modelLabel")}
                value={model}
                onChange={setModel}
                options={
                  models.length === 0
                    ? [{ value: "", label: t("chat.noModels") }]
                    : models.map((m) => ({ value: m, label: m }))
                }
              />
            </label>
            <button
              type="button"
              className={`portal-btn ghost sm${compareOn ? " is-on" : ""}`}
              onClick={() => setCompareOn((v) => !v)}
            >
              {t("chat.compare")}
            </button>
            {compareOn ? (
              <label className="ds-select">
                <span>{t("chat.compareModel")}</span>
                <SoftSelect
                  className="soft-select-filter soft-select-sm"
                  ariaLabel={t("chat.compareModel")}
                  value={compareModel}
                  onChange={setCompareModel}
                  options={models
                    .filter((m) => m !== model)
                    .map((m) => ({ value: m, label: m }))}
                />
              </label>
            ) : null}
            <label className="ds-select">
              <span>{t("chat.keyLabel")}</span>
              <SoftSelect
                className="soft-select-filter soft-select-sm"
                ariaLabel={t("chat.keyLabel")}
                value={keyId}
                onChange={(id) => void pickKey(id)}
                options={
                  keys.length === 0
                    ? [{ value: "", label: t("chat.noKey") }]
                    : keys.map((k) => ({ value: k.id, label: k.name }))
                }
              />
            </label>
          </div>
        </header>

        <div className="ds-messages">
          {!active?.messages.length ? (
            <div className="ds-welcome">
              <div className="ds-welcome-mark">
                <BrandLogo size={32} />
              </div>
              <h2>{t("chat.welcomeTitle")}</h2>
              <p>{t("chat.welcomeBody")}</p>
              {!apiKey ? (
                <p className="ds-hint">
                  {t("chat.noKeyHint")}{" "}
                  <Link to="/app/keys">{t("keys.title")}</Link> {t("chat.noKeyHintSuffix")}
                </p>
              ) : (
                <div className="ds-presets">
                  {[t("chat.preset1"), t("chat.preset2"), t("chat.preset3")].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="ds-preset"
                      onClick={() => void send(undefined, p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="ds-thread">
              {active.messages.map((m, i) => (
                <div key={i} className={`ds-msg ${m.role}`}>
                    <div className="ds-avatar">
                      {m.role === "user" ? t("chat.you") : <BrandLogo size={18} />}
                    </div>
                  <div className="ds-msg-body">
                    <div
                      className={`ds-msg-text${m.variant === "aborted" ? " muted" : ""}`}
                    >
                      {m.images?.length ? (
                        <div className="ds-msg-imgs">
                          {m.images.map((src) => (
                            <img key={src.slice(0, 24)} src={src} alt="" />
                          ))}
                        </div>
                      ) : null}
                      {m.variant === "balance" ? (
                        <>
                          {t("chat.balanceLow")}{" "}
                          <Link to="/app/recharge">{t("chat.topUp")}</Link>
                        </>
                      ) : (
                        m.content
                      )}
                    </div>
                    <div className="ds-msg-meta">
                      {new Date(m.at).toLocaleTimeString()}
                      {m.model ? ` · ${m.model}` : ""}
                    </div>
                  </div>
                </div>
              ))}
              {busy && active.messages[active.messages.length - 1]?.role !== "assistant" ? (
                <div className="ds-msg assistant">
                  <div className="ds-avatar">
                    <BrandLogo size={18} />
                  </div>
                  <div className="ds-msg-body">
                    <div className="ds-typing">{t("chat.generating")}</div>
                  </div>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="ds-composer-wrap">
          <form className="ds-composer" onSubmit={(e) => void send(e)}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                !apiKey
                  ? t("chat.phNeedKey")
                  : model
                    ? t("chat.phSendTo", { model })
                    : t("chat.phPickModel")
              }
              rows={1}
              disabled={!apiKey || !model}
            />
            {images.length ? (
              <div className="ds-pending-imgs">
                {images.map((src, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    title={t("chat.removeImage")}
                  >
                    <img src={src} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="ds-composer-bar">
              <span className="ds-composer-tip">
                {t("chat.composerTip")}
              </span>
              <span className="ds-composer-tools">
                {detectModelModality(model) === "multimodal" ? (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f || !f.type.startsWith("image/")) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const url = String(reader.result || "");
                          if (url) setImages((prev) => [...prev, url].slice(0, 4));
                        };
                        reader.readAsDataURL(f);
                      }}
                    />
                    <button
                      type="button"
                      className="portal-btn ghost sm"
                      onClick={() => fileRef.current?.click()}
                    >
                      {t("chat.image")}
                    </button>
                  </>
                ) : null}
              </span>
              {busy ? (
                <button
                  type="button"
                  className="ds-send ds-send-stop"
                  onClick={stopGenerating}
                  aria-label={t("chat.stopGen")}
                  title={t("chat.stopGen")}
                >
                  <IconStop size={12} />
                </button>
              ) : (
                <button
                  type="submit"
                  className="ds-send"
                  disabled={!apiKey || !model || (!input.trim() && !images.length)}
                  aria-label={t("chat.send")}
                >
                  ↑
                </button>
              )}
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
                {t("chat.rename")}
              </button>
              <button type="button" role="menuitem" onClick={() => togglePin(menuId)}>
                {sessions.find((s) => s.id === menuId)?.pinned
                  ? t("chat.unpin")
                  : t("chat.pin")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => void deleteSession(menuId)}
              >
                {t("common.delete")}
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
