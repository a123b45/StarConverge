import { FormEvent, ReactNode, useEffect, useState } from "react";
import {
  IconBell,
  IconLang,
  IconMoon,
  IconSun,
} from "./icons";
import {
  applyChromePrefs,
  chromeCopy,
  getLang,
  getTheme,
  setLang as persistLang,
  setTheme as persistTheme,
  type LangMode,
  type ThemeMode,
} from "../lib/chrome";
import { portalApi } from "../lib/api";

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
  onUserUpdated?: (user: UserInfo) => void;
};

export default function TopTools({
  leading,
  user,
  onLogout,
  editable = false,
  onUserUpdated,
}: Props) {
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window !== "undefined" ? getTheme() : "light",
  );
  const [lang, setLang] = useState<LangMode>(() =>
    typeof window !== "undefined" ? getLang() : "zh",
  );
  const [userOpen, setUserOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const t = chromeCopy[lang];

  useEffect(() => {
    applyChromePrefs();
  }, []);

  useEffect(() => {
    setDisplayName(user.displayName || "");
  }, [user.displayName]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = e.target as HTMLElement | null;
      if (!el?.closest(".chrome-menu")) {
        setUserOpen(false);
        setNotifyOpen(false);
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
        <button
          type="button"
          className="portal-tool-btn"
          title={t.lang}
          onClick={() => setLang(persistLang(lang === "zh" ? "en" : "zh"))}
        >
          <IconLang />
        </button>
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
              setNotifyOpen((v) => !v);
              setUserOpen(false);
            }}
          >
            <IconBell />
            <span className="portal-tool-badge dot" />
          </button>
          {notifyOpen ? (
            <div className="portal-user-dropdown chrome-dropdown">
              <div className="portal-user-meta">
                <strong>{t.notify}</strong>
                <span>{t.noNotify}</span>
              </div>
              <div className="chrome-notify-item">{t.notifySample}</div>
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
        <div
          className="modal-backdrop"
          onClick={() => setAccountOpen(false)}
        >
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
        </div>
      ) : null}
    </>
  );
}
