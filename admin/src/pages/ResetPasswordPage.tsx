import { FormEvent, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { authApi, getRole, getToken } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { IconEyeOff, IconEyeOpen, IconLock } from "../components/icons";
import BrandLogo from "../components/BrandLogo";

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (getToken()) {
    return <Navigate to={getRole() === "user" ? "/app/models" : "/admin"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("auth.reset.mismatch"));
      return;
    }
    if (!token) {
      setError(t("auth.reset.missingToken"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await authApi("/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.resetFail"));
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
            {t("auth.reset.heroTitle")}
            <br />
            <span>{t("auth.reset.heroSub")}</span>
          </h1>
          <p className="auth-hero-lead">{t("auth.reset.heroLead")}</p>
        </div>
      </aside>

      <main className="auth-main">
        <form className="auth-panel" onSubmit={onSubmit}>
          <div className="auth-panel-head">
            <div className="auth-panel-brand">
              <BrandLogo className="auth-logo sm" size={30} />
              <strong>{t("brand.name")}</strong>
              <em>{t("auth.reset.badge")}</em>
            </div>
            <h2>{t("auth.reset.title")}</h2>
            <p>{t("auth.reset.subtitle")}</p>
          </div>

          {error ? <div className="alert">{error}</div> : null}
          {!token ? <div className="alert">{t("auth.reset.invalidLink")}</div> : null}

          <label className="auth-field">
            <span>{t("auth.reset.passwordLabel")}</span>
            <div className="auth-input">
              <IconLock />
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={t("auth.reset.passwordPh")}
                minLength={6}
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

          <label className="auth-field">
            <span>{t("auth.reset.confirmLabel")}</span>
            <div className="auth-input">
              <IconLock />
              <input
                type={showPwd ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder={t("auth.reset.confirmPh")}
                minLength={6}
                required
              />
            </div>
          </label>

          <button className="auth-submit" disabled={loading || !token}>
            {loading ? t("auth.reset.submitting") : t("auth.reset.submit")}
            {!loading ? <span aria-hidden>→</span> : null}
          </button>

          <p className="auth-switch">
            <Link to="/login">{t("auth.reset.backLogin")}</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
