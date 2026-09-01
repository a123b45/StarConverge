import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authApi, getRole, getToken, setSession } from "../lib/api";
import {
  IconEyeOff,
  IconEyeOpen,
  IconLock,
  IconMail,
  IconPerson,
} from "../components/icons";

export default function RegisterPage() {
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

  const loadCaptcha = useCallback(async () => {
    try {
      const res = await authApi<{ data: { captchaId: string; image: string } }>("/captcha");
      setCaptchaId(res.data.captchaId);
      setCaptchaImg(res.data.image);
      setCaptcha("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证码加载失败");
    }
  }, []);

  useEffect(() => {
    void loadCaptcha();
  }, [loadCaptcha]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
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
      setHint(res.message || "验证码已发送，请查收邮箱");
      setCooldown(60);
      await loadCaptcha();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
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
      setError(err instanceof Error ? err.message : "注册失败");
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
            <span className="auth-logo">in</span>
            <strong>inkstudio</strong>
          </div>
          <h1>
            创建账号。
            <br />
            <span>开始调用。</span>
          </h1>
          <p className="auth-hero-lead">
            注册需验证邮箱。请先完成图片验证，再向邮箱发送验证码。
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
              <span className="auth-logo sm">in</span>
              <strong>inkstudio</strong>
              <em>注册 INKSTUDIO</em>
            </div>
            <h2>注册用户</h2>
            <p>验证邮箱后即可创建门户账号</p>
          </div>

          {error ? <div className="alert">{error}</div> : null}
          {hint ? <div className="alert ok">{hint}</div> : null}

          <label className="auth-field">
            <span>用户名</span>
            <div className="auth-input">
              <IconPerson />
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
            <span>邮箱</span>
            <div className="auth-input">
              <IconMail />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="用于接收验证码和找回密码"
                required
              />
            </div>
          </label>

          <label className="auth-field">
            <span>图片验证码</span>
            <div className="auth-captcha-row">
              <button
                type="button"
                className="auth-captcha-img"
                onClick={() => void loadCaptcha()}
                title="点击刷新"
              >
                {captchaImg ? (
                  <img src={captchaImg} alt="验证码" />
                ) : (
                  <span>加载中</span>
                )}
              </button>
              <div className="auth-input">
                <input
                  value={captcha}
                  onChange={(e) => setCaptcha(e.target.value.toUpperCase())}
                  autoComplete="off"
                  placeholder="点击图片可刷新"
                  required
                  minLength={4}
                  maxLength={8}
                  spellCheck={false}
                />
              </div>
            </div>
          </label>

          <label className="auth-field">
            <span>邮箱验证码</span>
            <div className="auth-code-row">
              <div className="auth-input">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6 位数字"
                  required
                  minLength={6}
                  maxLength={6}
                />
              </div>
              <button
                type="button"
                className="auth-send-code"
                disabled={sending || cooldown > 0 || !email || !captcha}
                onClick={() => void sendCode()}
              >
                {sending ? "发送中…" : cooldown > 0 ? `${cooldown}s` : "发送验证码"}
              </button>
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
                {showPwd ? <IconEyeOff /> : <IconEyeOpen />}
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
