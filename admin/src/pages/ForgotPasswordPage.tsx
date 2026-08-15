import { FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { authApi, getRole, getToken } from "../lib/api";
import { IconMail } from "../components/icons";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [loading, setLoading] = useState(false);

  if (getToken()) {
    return <Navigate to={getRole() === "user" ? "/app" : "/admin"} replace />;
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
      setMessage(res.message || "如果该邮箱已注册，我们已发送重置密码链接");
      if (res.resetUrl) setResetUrl(res.resetUrl);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-split">
      <aside className="auth-hero">
        <div className="auth-hero-inner">
          <div className="auth-brand-row">
            <span className="auth-logo">SC</span>
            <strong>StarConverge</strong>
          </div>
          <h1>
            安全找回。
            <br />
            <span>重新开始。</span>
          </h1>
          <p className="auth-hero-lead">
            通过注册邮箱接收重置链接，无需联系管理员即可恢复访问。
          </p>
        </div>
      </aside>

      <main className="auth-main">
        <form className="auth-panel" onSubmit={onSubmit}>
          <div className="auth-panel-head">
            <div className="auth-panel-brand">
              <span className="auth-logo sm">SC</span>
              <strong>StarConverge</strong>
              <em>密码重置 STARCONVERGE</em>
            </div>
            <h2>找回 StarConverge 密码</h2>
            <p>输入注册邮箱，我们会向您发送重置密码链接</p>
          </div>

          {error ? <div className="alert">{error}</div> : null}
          {done ? (
            <div className="alert ok">
              {message}
              {resetUrl ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>
                    邮件服务未配置，请直接打开重置链接：
                  </div>
                  <a href={resetUrl} style={{ wordBreak: "break-all" }}>
                    {resetUrl}
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}

          <label className="auth-field">
            <span>邮箱</span>
            <div className="auth-input">
              <IconMail />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="请输入注册邮箱"
                required
              />
            </div>
          </label>

          <button className="auth-submit" disabled={loading}>
            {loading ? "发送中…" : "发送重置链接"}
            {!loading ? <span aria-hidden>→</span> : null}
          </button>

          <p className="auth-switch">
            想起密码了？ <Link to="/login">登录</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
