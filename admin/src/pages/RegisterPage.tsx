import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authApi, getRole, getToken, setSession } from "../lib/api";
import { useI18n } from "../lib/i18n";
import {
  IconEyeOff,
  IconEyeOpen,
  IconLock,
  IconMail,
  IconPerson,
} from "../components/icons";
import BrandLogo from "../components/BrandLogo";

export default function RegisterPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [captchaId, setCaptchaId] = useState("");
  const [captchaImg, setCaptchaImg] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);

  const loadCaptcha = useCallback(async () => {
    try {
      const res = await authApi<{ data: { captchaId: string; image: string } }>("/captcha");
      setCaptchaId(res.data.captchaId);
      setCaptchaImg(res.data.image);
      setCaptcha("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.register.captchaLoadFail"));
    }
  }, [t]);

  useEffect(() => {
    void loadCaptcha();
  }, [loadCaptcha]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendCode() {
    setSending(true);
    setError("");
    setHint("");
    try {
      const res = await authApi<{ message?: string }>("/register/send-code", {
        method: "POST",
        body: JSON.stringify({ email, captchaId, captcha }),
      });
      setHint(res.message || t("auth.register.codeSent"));
      setCooldown(60);
      setCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.sendFail"));
      await loadCaptcha();
    } finally {
      setSending(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await authApi<{
        token: string;
        role: "user";
        redirect: string;
      }>("/register", {
        method: "POST",
        body: JSON.stringify({ username, password, email, code }),
      });
      setSession(res.token, res.role);
      navigate(res.redirect || "/app/models");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.registerFail"));
    } finally {
      setLoading(false);
    }
  }

  if (getToken()) {
    return <Navigate to={getRole() === "user" ? "/app/models" : "/admin"} replace />;
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
            {t("auth.register.heroTitle")}
            <br />
            <span>{t("auth.register.heroSub")}</span>
          </h1>
          <p className="auth-hero-lead">{t("auth.register.heroLead")}</p>
          <ul className="auth-features">
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>{t("auth.register.f1")}</strong>
                <p>{t("auth.register.f1b")}</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>{t("auth.register.f2")}</strong>
                <p>{t("auth.register.f2b")}</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>{t("auth.register.f3")}</strong>
                <p>{t("auth.register.f3b")}</p>
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
              <em>{t("auth.register.badge")}</em>
            </div>
            <h2>{t("auth.register.title")}</h2>
            <p>{t("auth.register.subtitle")}</p>
          </div>

          {error ? <div className="alert">{error}</div> : null}
          {hint ? <div className="alert ok">{hint}</div> : null}

          <label className="auth-field">
            <span>{t("auth.register.usernameLabel")}</span>
            <div className="auth-input">
              <IconPerson />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder={t("auth.register.usernamePh")}
                required
                minLength={3}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>{t("auth.register.emailLabel")}</span>
            <div className="auth-input">
              <IconMail />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setCodeSent(false);
                }}
                autoComplete="email"
                placeholder={t("auth.register.emailPh")}
                required
              />
            </div>
          </label>

          <label className="auth-field">
            <span>{t("auth.register.captchaLabel")}</span>
            <div className="auth-captcha-row">
              <button
                type="button"
                className="auth-captcha-img"
                onClick={() => {
                  if (!codeSent) void loadCaptcha();
                }}
                title={codeSent ? t("auth.register.captchaVerified") : t("auth.register.captchaRefresh")}
                disabled={codeSent}
              >
                {captchaImg ? (
                  <img src={captchaImg} alt={t("auth.register.captchaAlt")} />
                ) : (
                  <span>{t("common.loading")}</span>
                )}
              </button>
              <div className="auth-input">
                <input
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value.toUpperCase())}
                  autoComplete="off"
                  placeholder={t("auth.register.captchaPh")}
                  required={!codeSent}
                  minLength={codeSent ? undefined : 5}
                  maxLength={8}
                  spellCheck={false}
                  disabled={codeSent}
                />
              </div>
            </div>
          </label>

          <label className="auth-field">
            <span>{t("auth.register.emailCodeLabel")}</span>
            <div className="auth-code-row">
              <div className="auth-input">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={t("auth.register.emailCodePh")}
                  required
                  minLength={6}
                  maxLength={6}
                />
              </div>
              <button
                type="button"
                className="auth-send-code"
                disabled={sending || cooldown > 0 || !email || captcha.trim().length < 5}
                onClick={() => void sendCode()}
              >
                {sending
                  ? t("auth.register.sending")
                  : cooldown > 0
                    ? `${cooldown}s`
                    : t("auth.register.sendCode")}
              </button>
            </div>
          </label>

          <label className="auth-field">
            <span>{t("auth.register.passwordLabel")}</span>
            <div className="auth-input">
              <IconLock />
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={t("auth.register.passwordPh")}
                required
                minLength={6}
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

          <button className="auth-submit" disabled={loading}>
            {loading ? t("auth.register.submitting") : t("auth.register.submit")}
            {!loading ? <span aria-hidden>→</span> : null}
          </button>

          <p className="auth-switch">
            {t("auth.register.hasAccount")}{" "}
            <Link to="/login">{t("auth.register.loginLink")}</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
