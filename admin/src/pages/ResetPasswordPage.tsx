import { FormEvent, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { authApi, getRole, getToken } from "../lib/api";
import { IconEyeOff, IconEyeOpen, IconLock } from "../components/icons";

export default function ResetPasswordPage() {
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
      setError("两次输入的密码不一致");
      return;
    }
    if (!token) {
      setError("缺少重置令牌，请重新申请找回密码");
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
      setError(err instanceof Error ? err.message : "重置失败");
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
            设置新密码。
            <br />
            <span>继续使用。</span>
          </h1>
          <p className="auth-hero-lead">重置完成后即可登录中转站，继续买 Token、调模型。</p>
        </div>
      </aside>

      <main className="auth-main">
        <form className="auth-panel" onSubmit={onSubmit}>
          <div className="auth-panel-head">
            <div className="auth-panel-brand">
              <span className="auth-logo sm">in</span>
              <strong>inkstudio</strong>
              <em>设置新密码 INKSTUDIO</em>
            </div>
            <h2>设置新密码</h2>
            <p>请输入至少 6 位的新密码</p>
          </div>

          {error ? <div className="alert">{error}</div> : null}
          {!token ? (
            <div className="alert">链接无效，请从找回密码页重新申请</div>
          ) : null}

          <label className="auth-field">
            <span>新密码</span>
            <div className="auth-input">
              <IconLock />
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="请输入新密码"
                minLength={6}
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

          <label className="auth-field">
            <span>确认密码</span>
            <div className="auth-input">
              <IconLock />
              <input
                type={showPwd ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="再次输入新密码"
                minLength={6}
                required
              />
            </div>
          </label>

          <button className="auth-submit" disabled={loading || !token}>
            {loading ? "提交中…" : "确认重置"}
            {!loading ? <span aria-hidden>→</span> : null}
          </button>

          <p className="auth-switch">
            <Link to="/login">返回登录</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
