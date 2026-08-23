import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconBell,
  IconLang,
  IconMoon,
  IconSun,
} from "./icons";
import {
  applyChromePrefs,
  chromeCopy,
  formatUserNotification,
  getLang,
  getTheme,
  LANG_OPTIONS,
  setLang as persistLang,
  setTheme as persistTheme,
  type LangMode,
  type ThemeMode,
} from "../lib/chrome";
import { portalApi } from "../lib/api";
import ModalBackdrop from "./ModalBackdrop";

type UserInfo = {
  username: string;
  displayName?: string | null;
};

type Props = {
  leading?: ReactNode;
  user: UserInfo;
  onLogout: () => void;
  /** Portal users can edit profile via API */
  editable?: boolean;
  /** Show portal model/price notifications */
  notificationsEnabled?: boolean;
  onUserUpdated?: (user: UserInfo) => void;
};

type PortalNotice = {
  id: string;
  type: "models" | "pricing";
  models: string[];
  body: string;
  createdAt: number;
  updatedAt: number;
  unread: boolean;
};

export default function TopTools({
  leading,
  user,
  onLogout,
  editable = false,
  notificationsEnabled = false,
  onUserUpdated,
}: Props) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window !== "undefined" ? getTheme() : "light",
  );
  const [lang, setLang] = useState<LangMode>(() =>
    typeof window !== "undefined" ? getLang() : "zh",
  );
  const [userOpen, setUserOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [notices, setNotices] = useState<PortalNotice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const t = chromeCopy[lang];

  useEffect(() => {
    applyChromePrefs();
  }, []);

  useEffect(() => {
    setDisplayName(user.displayName || "");
  }, [user.displayName]);

  useEffect(() => {
    if (!notificationsEnabled) return;
    let cancelled = false;
    async function loadNotices() {
      try {
        const res = await portalApi<{
          unreadCount: number;
          data: PortalNotice[];
        }>("/notifications");
        if (cancelled) return;
        setNotices(res.data ?? []);
        setUnreadCount(res.unreadCount ?? 0);
      } catch {
        if (!cancelled) {
          setNotices([]);
          setUnreadCount(0);
        }
      }
    }
    void loadNotices();
    const timer = window.setInterval(() => void loadNotices(), 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [notificationsEnabled]);

  async function markNoticesRead() {
    if (!notificationsEnabled || unreadCount === 0) return;
    try {
      await portalApi("/notifications/read", { method: "POST" });
      setUnreadCount(0);
      setNotices((prev) => prev.map((n) => ({ ...n, unread: false })));
    } catch {
      /* keep badge until next poll */
    }
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = e.target as HTMLElement | null;
      if (!el?.closest(".chrome-menu")) {
        setUserOpen(false);
        setNotifyOpen(false);
        setLangOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    if (!editable) return;
    setSaving(true);
    setError("");
    try {
      const body: { displayName?: string; password?: string } = {
        displayName: displayName.trim(),
      };
      if (password.trim()) body.password = password.trim();
      const res = await portalApi<UserInfo>("/me", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onUserUpdated?.(res);
      setPassword("");
      setAccountOpen(false);
      setToast(lang === "zh" ? "已保存" : "Saved");
      setTimeout(() => setToast(""), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="portal-top-right chrome-tools">
        {leading}
        <div className="chrome-menu">
          <button
            type="button"
            className="portal-tool-btn"
            title={t.lang}
            aria-expanded={langOpen}
            onClick={(e) => {
              e.stopPropagation();
              setLangOpen((v) => !v);
              setNotifyOpen(false);
              setUserOpen(false);
            }}
          >
            <IconLang />
          </button>
          {langOpen ? (
            <div className="portal-user-dropdown chrome-dropdown chrome-lang-menu">
              <div className="portal-user-meta">
                <strong>{t.lang}</strong>
                <span>
                  {LANG_OPTIONS.find((o) => o.id === lang)?.label || lang}
                </span>
              </div>
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={lang === opt.id ? "is-active" : undefined}
                  onClick={() => {
                    setLang(persistLang(opt.id));
                    setLangOpen(false);
                  }}
                >
                  <span>{opt.label}</span>
                  <em>{opt.native}</em>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={`portal-tool-btn theme-toggle${theme === "dark" ? " is-dark" : ""}`}
          title={theme === "light" ? t.themeLight : t.themeDark}
          aria-label={theme === "light" ? t.themeLight : t.themeDark}
          aria-pressed={theme === "dark"}
          onClick={() => {
            const next = persistTheme(theme === "light" ? "dark" : "light");
            setTheme(next);
          }}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </button>
        <div className="chrome-menu">
          <button
            type="button"
            className="portal-tool-btn"
            title={t.notify}
            onClick={(e) => {
              e.stopPropagation();
              const next = !notifyOpen;
              setNotifyOpen(next);
              setUserOpen(false);
              setLangOpen(false);
              if (next) void markNoticesRead();
            }}
          >
            <IconBell />
            {notificationsEnabled && unreadCount > 0 ? (
              <span className="portal-tool-badge dot" />
            ) : null}
          </button>
          {notifyOpen ? (
            <div className="portal-user-dropdown chrome-dropdown chrome-notify-menu">
              <div className="portal-user-meta">
                <strong>{t.notify}</strong>
                <span>
                  {notificationsEnabled && notices.length ? t.notify : t.noNotify}
                </span>
              </div>
              {notificationsEnabled && notices.length ? (
                <div className="chrome-notify-list">
                  {notices.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`chrome-notify-item${n.unread ? " is-unread" : ""}`}
                      onClick={() => {
                        setNotifyOpen(false);
                        navigate("/app/models");
                      }}
                    >
                      <em>
                        {n.type === "pricing" ? t.notifyTypePricing : t.notifyTypeModels}
                      </em>
                      <span>
                        {formatUserNotification(lang, n.type, n.models, n.body)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="chrome-notify-empty">{t.noNotify}</div>
              )}
            </div>
          ) : null}
        </div>
        <div className="chrome-menu">
          <button
            type="button"
            className="portal-tool-btn portal-avatar-btn"
            title={user.displayName || user.username}
            onClick={(e) => {
              e.stopPropagation();
              setUserOpen((v) => !v);
              setNotifyOpen(false);
              setLangOpen(false);
            }}
          >
            <span className="portal-avatar">
              {(user.displayName || user.username || "U")
                .slice(0, 1)
                .toUpperCase()}
            </span>
          </button>
          {userOpen ? (
            <div className="portal-user-dropdown chrome-dropdown">
              <div className="portal-user-meta">
                <strong>{user.displayName || user.username}</strong>
                <span>{user.username}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUserOpen(false);
                  setAccountOpen(true);
                }}
              >
                {t.account}
              </button>
              <button type="button" className="danger" onClick={onLogout}>
                {t.logout}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {toast ? <div className="chrome-toast">{toast}</div> : null}

      {accountOpen ? (
        <ModalBackdrop onClose={() => setAccountOpen(false)}>
          <form
            className="modal chrome-account-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveAccount}
          >
            <h3>{t.profile}</h3>
            {error ? <div className="alert">{error}</div> : null}
            <div className="form-grid">
              <label>
                用户名
                <input value={user.username} disabled />
              </label>
              <label>
                {t.displayName}
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={!editable}
                  placeholder={user.username}
                />
              </label>
              {editable ? (
                <label>
                  {t.password}
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    minLength={6}
                  />
                </label>
              ) : (
                <p className="muted" style={{ margin: 0, gridColumn: "1 / -1" }}>
                  管理员账号由环境变量配置，请修改 server/.env 中的密码。
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setAccountOpen(false)}
              >
                {t.cancel}
              </button>
              {editable ? (
                <button className="btn" disabled={saving}>
                  {saving ? "…" : t.save}
                </button>
              ) : null}
            </div>
          </form>
        </ModalBackdrop>
      ) : null}
    </>
  );
}
