import { FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { authApi, getRole, getToken } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { IconMail } from "../components/icons";
import BrandLogo from "../components/BrandLogo";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [loading, setLoading] = useState(false);

  if (getToken()) {
    return <Navigate to={getRole() === "user" ? "/app/models" : "/admin"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setDone(false);
    setResetUrl("");
    try {
      const res = await authApi<{
        ok: boolean;
        message: string;
        resetUrl?: string;
      }>("/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(res.message || t("auth.forgot.sentDefault"));
      if (res.resetUrl) setResetUrl(res.resetUrl);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.sendFail"));
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
            {t("auth.forgot.heroTitle")}
            <br />
            <span>{t("auth.forgot.heroSub")}</span>
          </h1>
          <p className="auth-hero-lead">{t("auth.forgot.heroLead")}</p>
        </div>
      </aside>

      <main className="auth-main">
        <form className="auth-panel" onSubmit={onSubmit}>
          <div className="auth-panel-head">
            <div className="auth-panel-brand">
              <BrandLogo className="auth-logo sm" size={30} />
              <strong>{t("brand.name")}</strong>
              <em>{t("auth.forgot.badge")}</em>
            </div>
            <h2>{t("auth.forgot.title")}</h2>
            <p>{t("auth.forgot.subtitle")}</p>
          </div>

          {error ? <div className="alert">{error}</div> : null}
          {done ? (
            <div className="alert ok">
              {message}
              {resetUrl ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>{t("auth.forgot.noMailHint")}</div>
                  <a href={resetUrl} style={{ wordBreak: "break-all" }}>
                    {resetUrl}
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}

          <label className="auth-field">
            <span>{t("auth.forgot.emailLabel")}</span>
            <div className="auth-input">
              <IconMail />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder={t("auth.forgot.emailPh")}
                required
              />
            </div>
          </label>

          <button className="auth-submit" disabled={loading}>
            {loading ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
            {!loading ? <span aria-hidden>→</span> : null}
          </button>

          <p className="auth-switch">
            {t("auth.forgot.rememberLogin")} <Link to="/login">{t("auth.forgot.loginLink")}</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
