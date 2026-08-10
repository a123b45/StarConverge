import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authApi, getRole, getToken, setSession } from "../lib/api";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
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
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-mark">SC</div>
        <h1>创建账号</h1>
        <p>注册后可管理 API 密钥、查看用量并测试对话</p>
        {error ? <div className="alert">{error}</div> : null}
        <div className="form-grid">
          <label>
            用户名
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="字母数字下划线"
              required
              minLength={3}
            />
          </label>
          <label>
            显示名（可选）
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="昵称"
            />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </label>
          <button className="btn" disabled={loading}>
            {loading ? "创建中…" : "注册并进入"}
          </button>
        </div>
        <p className="auth-footer">
          已有账号？ <Link to="/login">去登录</Link>
        </p>
      </form>
    </div>
  );
}
