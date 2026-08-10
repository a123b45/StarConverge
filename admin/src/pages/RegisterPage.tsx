import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authApi, getRole, getToken, setSession } from "../lib/api";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPwd, setShowPwd] = useState(false);
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
        role: "user";
        redirect: string;
      }>("/register", {
        method: "POST",
        body: JSON.stringify({ username, password, displayName }),
      });
      setSession(res.token, res.role);
      navigate(res.redirect || "/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
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
            创建账号。
            <br />
            <span>开始调用。</span>
          </h1>
          <p className="auth-hero-lead">
            注册后即可创建 API 密钥、查看用量，并在门户中测试对话与查阅接入文档。
          </p>
          <ul className="auth-features">
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>自助密钥</strong>
                <p>创建、查看、删除属于自己的 sk 密钥</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>用量透明</strong>
                <p>按模型统计调用次数与 token 消耗</p>
              </div>
            </li>
            <li>
              <span className="check" aria-hidden />
              <div>
                <strong>OpenAI 兼容</strong>
                <p>任意兼容客户端填 Base URL 即可接入</p>
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
              <em>注册 STARCONVERGE</em>
            </div>
            <h2>注册普通用户</h2>
            <p>填写信息以创建门户账号</p>
          </div>

          {error ? <div className="alert">{error}</div> : null}

          <label className="auth-field">
            <span>用户名</span>
            <div className="auth-input">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"
                />
              </svg>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="字母数字下划线，至少 3 位"
                required
                minLength={3}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>显示名（可选）</span>
            <div className="auth-input">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <path
                  fill="currentColor"
                  d="M5 4h14v2H5zm0 7h14v2H5zm0 7h9v2H5z"
                />
              </svg>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="昵称"
              />
            </div>
          </label>

          <label className="auth-field">
            <span>密码</span>
            <div className="auth-input">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <path
                  fill="currentColor"
                  d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4Zm7 12H7v-8h10Z"
                />
              </svg>
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="至少 6 位"
                required
                minLength={6}
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? "隐藏密码" : "显示密码"}
              >
                {showPwd ? "隐" : "显"}
              </button>
            </div>
          </label>

          <button className="auth-submit" disabled={loading}>
            {loading ? "创建中…" : "立即注册"}
            {!loading ? <span aria-hidden>→</span> : null}
          </button>

          <p className="auth-switch">
            已有账户？ <Link to="/login">去登录</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
