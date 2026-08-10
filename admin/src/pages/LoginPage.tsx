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
    return <Navigate to={getRole() === "user" ? "/app" : "/admin"} replace />;
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
      navigate(res.redirect || (res.role === "admin" ? "/admin" : "/app"));
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
            <span className="auth-logo">SC</span>
            <strong>StarConverge</strong>
          </div>
          <h1>
            统一接入。
            <br />
            <span>按需转发。</span>
          </h1>
          <p className="auth-hero-lead">
            在一个工作台里管理渠道、令牌与模型路由，面向管理员与终端用户分流访问。
          </p>
          <ul className="auth-features">
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>渠道聚合</strong>
                <p>多上游 OpenAI 兼容接口统一入口</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>令牌配额</strong>
                <p>按 token 计量用量，密钥归属到用户</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>角色分流</strong>
                <p>管理员进控制台，用户进模型门户</p>
              </div>
            </li>
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        <form className="auth-panel" onSubmit={onSubmit}>
          <div className="auth-panel-head">
            <div className="auth-panel-brand">
              <span className="auth-logo sm">SC</span>
              <strong>StarConverge</strong>
              <em>登录 STARCONVERGE</em>
            </div>
            <h2>登录 StarConverge</h2>
            <p>请输入账户信息以访问中转平台</p>
          </div>

          {error ? <div className="alert">{error}</div> : null}

          <label className="auth-field">
            <span>用户名</span>
            <div className="auth-input">
              <IconPerson />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="admin 或您的账号"
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
            <span className="auth-muted-link">忘记密码？联系管理员</span>
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
