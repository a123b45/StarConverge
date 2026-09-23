import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authApi, getRole, getToken, setSession } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { IconEyeOff, IconEyeOpen, IconLock, IconPerson } from "../components/icons";
import BrandLogo from "../components/BrandLogo";

export default function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (getToken()) {
    return <Navigate to={getRole() === "user" ? "/app/models" : "/admin"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await authApi<{
        token: string;
        role: "admin" | "user";
        redirect: string;
      }>("/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setSession(res.token, res.role);
      if (!remember) {
        // sessionStorage fallback not implemented; token still in localStorage
      }
      navigate(res.redirect || (res.role === "admin" ? "/admin" : "/app/models"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.loginFail"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-split">
      <aside className="auth-hero">
        <div className="auth-hero-inner">
          <div className="auth-brand-row">
            <BrandLogo className="auth-logo" size={40} />
            <strong>{t("brand.name")}</strong>
          </div>
          <h1>
            {t("login.heroTitle")}
            <br />
            <span>{t("login.heroSub")}</span>
          </h1>
          <p className="auth-hero-lead">{t("login.heroLead")}</p>
          <ul className="auth-features">
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>{t("login.f1")}</strong>
                <p>{t("login.f1b")}</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>{t("login.f2")}</strong>
                <p>{t("login.f2b")}</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>{t("login.f3")}</strong>
                <p>{t("login.f3b")}</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>{t("login.f4")}</strong>
                <p>{t("login.f4b")}</p>
              </div>
            </li>
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        <form className="auth-panel" onSubmit={onSubmit}>
          <div className="auth-panel-head">
            <div className="auth-panel-brand">
              <BrandLogo className="auth-logo sm" size={30} />
              <strong>{t("brand.name")}</strong>
            </div>
            <h2>{t("auth.login.title")}</h2>
          </div>

          {error ? <div className="alert">{error}</div> : null}

          <label className="auth-field">
            <span>{t("auth.login.usernameLabel")}</span>
            <div className="auth-input">
              <IconPerson />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder={t("auth.login.usernamePh")}
                required
              />
            </div>
          </label>

          <label className="auth-field">
            <span>{t("auth.login.passwordLabel")}</span>
            <div className="auth-input">
              <IconLock />
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder={t("auth.login.passwordPh")}
                required
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? t("common.hidePassword") : t("common.showPassword")}
              >
                {showPwd ? <IconEyeOff /> : <IconEyeOpen />}
              </button>
            </div>
          </label>

          <div className="auth-row">
            <label className="auth-check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              {t("auth.login.remember")}
            </label>
            <Link className="auth-muted-link" to="/forgot-password">
              {t("auth.login.forgot")}
            </Link>
          </div>

          <button className="auth-submit" disabled={loading}>
            {loading ? t("auth.login.submitting") : t("auth.login.submit")}
            {!loading ? <span aria-hidden>→</span> : null}
          </button>

          <p className="auth-switch">
            {t("auth.login.noAccount")}{" "}
            <Link to="/register">{t("auth.login.registerLink")}</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
