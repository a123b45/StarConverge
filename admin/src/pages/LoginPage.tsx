import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authApi, getRole, getToken, setSession } from "../lib/api";
import { IconEyeOff, IconEyeOpen, IconLock, IconPerson } from "../components/icons";

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
            <span className="auth-logo">in</span>
            <strong>inkstudio</strong>
          </div>
          <h1>
            API 中转。
            <br />
            <span>按量卖 Token。</span>
          </h1>
          <p className="auth-hero-lead">
            充值买额度，一钥调用多家模型。OpenAI 兼容，即开即用。
          </p>
          <ul className="auth-features">
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>充值买量</strong>
                <p>卡密兑换余额，按 token 用量扣费</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>一钥多模</strong>
                <p>一个密钥调用 GPT、Claude、Gemini 等</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>即开即用</strong>
                <p>填 Base URL，Cursor、ChatBox 直接接入</p>
              </div>
            </li>
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        <form className="auth-panel" onSubmit={onSubmit}>
          <div className="auth-panel-head">
            <div className="auth-panel-brand">
              <span className="auth-logo sm">in</span>
              <strong>inkstudio</strong>
              <em>登录 INKSTUDIO</em>
            </div>
            <h2>登录 inkstudio</h2>
            <p>登录后即可充值买 Token、调用模型</p>
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
