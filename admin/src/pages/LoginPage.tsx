import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authApi, getRole, getToken, setSession } from "../lib/api";
import { IconEyeOff, IconEyeOpen, IconLock, IconPerson } from "../components/icons";
import BrandLogo from "../components/BrandLogo";

export default function LoginPage() {
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
      setError(err instanceof Error ? err.message : "登录失败");
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
            <strong>辉煌</strong>
          </div>
          <h1>
            API 中转。
            <br />
            <span>低价 Token。</span>
          </h1>
          <p className="auth-hero-lead">
            我们不生产 token，我们只是 token 的搬运工。
          </p>
          <ul className="auth-features">
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>物美价廉</strong>
                <p>支持模型估价对比，对比官方渠道优惠 70%</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>模型可靠</strong>
                <p>不掺水，支持各种模型测试</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>聚合调用</strong>
                <p>一个密钥畅享 GPT、Claude、Gemini 等 AI 智能大模型</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>智能体接入</strong>
                <p>可直接接入 Cursor、Claude Code、Codex</p>
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
              <strong>辉煌</strong>
            </div>
            <h2>登录</h2>
          </div>

          {error ? <div className="alert">{error}</div> : null}

          <label className="auth-field">
            <span>用户名/邮箱</span>
            <div className="auth-input">
              <IconPerson />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="请输入你的用户或者邮箱"
                required
              />
            </div>
          </label>

          <label className="auth-field">
            <span>密码</span>
            <div className="auth-input">
              <IconLock />
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="请输入密码"
                required
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? "隐藏密码" : "显示密码"}
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
              记住登录状态
            </label>
            <Link className="auth-muted-link" to="/forgot-password">
              忘记密码？
            </Link>
          </div>

          <button className="auth-submit" disabled={loading}>
            {loading ? "登录中…" : "登录"}
            {!loading ? <span aria-hidden>→</span> : null}
          </button>

          <p className="auth-switch">
            还没有账户？ <Link to="/register">立即注册</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
