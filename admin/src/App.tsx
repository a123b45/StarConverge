import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { formatTokens, getRole, getToken, portalApi, setSession } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import ChannelsPage from "./pages/ChannelsPage";
import TokensPage from "./pages/TokensPage";
import ModelsPage from "./pages/ModelsPage";
import ProxyRoutesPage from "./pages/ProxyRoutesPage";
import LogsPage from "./pages/LogsPage";
import SettingsPage from "./pages/SettingsPage";
import UsersPage from "./pages/UsersPage";
import PortalModelsPage from "./pages/portal/PortalModelsPage";
import PortalKeysPage from "./pages/portal/PortalKeysPage";
import PortalUsagePage from "./pages/portal/PortalUsagePage";
import PortalChatPage from "./pages/portal/PortalChatPage";
import PortalDocsPage from "./pages/portal/PortalDocsPage";

function AdminShell() {
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SC</div>
          <h1>StarConverge</h1>
          <p>管理控制台</p>
        </div>
        <nav className="nav">
          <div className="nav-group">
            <div className="nav-label">运营</div>
            <NavLink to="/admin" end>
              数据看板
            </NavLink>
            <NavLink to="/admin/logs">请求日志</NavLink>
          </div>
          <div className="nav-group">
            <div className="nav-label">资源</div>
            <NavLink to="/admin/channels">渠道管理</NavLink>
            <NavLink to="/admin/tokens">令牌管理</NavLink>
            <NavLink to="/admin/models">模型路由</NavLink>
            <NavLink to="/admin/proxy">通用代理</NavLink>
            <NavLink to="/admin/users">客户管理</NavLink>
          </div>
          <div className="nav-group">
            <div className="nav-label">系统</div>
            <NavLink to="/admin/settings">系统设置</NavLink>
          </div>
        </nav>
        <div style={{ marginTop: "auto", padding: "0 4px" }}>
          <button
            className="btn ghost"
            style={{
              width: "100%",
              background: "transparent",
              borderColor: "rgba(255,255,255,0.12)",
              color: "#cbd5e1",
            }}
            onClick={() => {
              setSession(null);
              navigate("/login");
            }}
          >
            退出登录
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

function PortalShell() {
  const navigate = useNavigate();
  const [me, setMe] = useState<{
    username: string;
    displayName?: string | null;
    usedQuota: number;
    quota: number;
  } | null>(null);

  useEffect(() => {
    portalApi<{
      username: string;
      displayName?: string | null;
      usedQuota: number;
      quota: number;
    }>("/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  return (
    <div className="portal-shell">
      <header className="portal-topbar">
        <div className="portal-brand">
          <span className="portal-logo">SC</span>
          <strong>StarConverge</strong>
        </div>
        <nav className="portal-nav">
          <NavLink to="/app/models">模型列表</NavLink>
          <NavLink to="/app/keys">API 密钥</NavLink>
          <NavLink to="/app/usage">用量</NavLink>
          <NavLink to="/app/chat">对话测试</NavLink>
          <NavLink to="/app/docs">文档</NavLink>
        </nav>
        <div className="portal-top-right">
          {me ? (
            <span className="portal-quota-pill">
              <span className="ok-dot" />
              {formatTokens(me.usedQuota)} / {formatTokens(me.quota)}
            </span>
          ) : null}
          <span className="portal-user">{me?.displayName || me?.username || "用户"}</span>
          <button
            className="portal-btn ghost sm"
            type="button"
            onClick={() => {
              setSession(null);
              navigate("/login");
            }}
          >
            退出
          </button>
        </div>
      </header>
      <div className="portal-body">
        <Outlet />
      </div>
    </div>
  );
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  if (getRole() === "user") return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function RequireUser({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  if (getRole() === "admin") return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <Navigate to={getRole() === "user" ? "/app" : "/admin"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminShell />
          </RequireAdmin>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="channels" element={<ChannelsPage />} />
        <Route path="tokens" element={<TokensPage />} />
        <Route path="models" element={<ModelsPage />} />
        <Route path="proxy" element={<ProxyRoutesPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route
        path="/app"
        element={
          <RequireUser>
            <PortalShell />
          </RequireUser>
        }
      >
        <Route index element={<Navigate to="models" replace />} />
        <Route path="models" element={<PortalModelsPage />} />
        <Route path="keys" element={<PortalKeysPage />} />
        <Route path="usage" element={<PortalUsagePage />} />
        <Route path="chat" element={<PortalChatPage />} />
        <Route path="docs" element={<PortalDocsPage />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
