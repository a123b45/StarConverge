import { useEffect, useState } from "react";
import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
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

const PORTAL_TITLES: Record<string, string> = {
  "/app/models": "模型列表",
  "/app/keys": "API 密钥",
  "/app/usage": "用量",
  "/app/chat": "对话测试",
  "/app/docs": "接入文档",
  "/app": "工作台",
};

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
  const location = useLocation();
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

  const pageTitle =
    PORTAL_TITLES[location.pathname] ||
    Object.entries(PORTAL_TITLES).find(([k]) =>
      location.pathname.startsWith(k),
    )?.[1] ||
    "工作台";

  return (
    <div className="portal-shell">
      <aside className="portal-sider">
        <div className="portal-sider-brand">
          <span className="portal-logo">SC</span>
          <strong>StarConverge</strong>
        </div>
        <nav className="portal-sider-nav">
          <div className="portal-sider-group">
            <div className="portal-sider-label">工作台</div>
            <NavLink to="/app/models">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <path
                  fill="currentColor"
                  d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z"
                />
              </svg>
              模型列表
            </NavLink>
            <NavLink to="/app/chat">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <path
                  fill="currentColor"
                  d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
                />
              </svg>
              对话测试
            </NavLink>
            <NavLink to="/app/docs">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <path
                  fill="currentColor"
                  d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V8h4.5L14 3.5Z"
                />
              </svg>
              接入文档
            </NavLink>
          </div>
          <div className="portal-sider-group">
            <div className="portal-sider-label">账号</div>
            <NavLink to="/app/keys">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <path
                  fill="currentColor"
                  d="M14 8a4 4 0 1 0-3.2 3.92L7 15.72V18h2.5l1.2-1.2L14 13.5A4 4 0 0 0 14 8Zm-4 0a2 2 0 1 1 2 2 2 2 0 0 1-2-2Z"
                />
              </svg>
              API 密钥
            </NavLink>
            <NavLink to="/app/usage">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                <path
                  fill="currentColor"
                  d="M4 19h16v2H4zm2-3h2V9H6zm5 0h2V5h-2zm5 0h2v-7h-2z"
                />
              </svg>
              用量统计
            </NavLink>
          </div>
        </nav>
        <div className="portal-sider-foot">
          <div className="portal-balance">
            <span>已用配额</span>
            <strong>
              {me
                ? `${formatTokens(me.usedQuota)} / ${formatTokens(me.quota)}`
                : "—"}
            </strong>
          </div>
        </div>
      </aside>

      <div className="portal-main">
        <header className="portal-topbar">
          <div className="portal-top-left">
            <h1 className="portal-page-title">{pageTitle}</h1>
          </div>
          <div className="portal-top-right">
            <span className="portal-quota-pill">
              <span className="ok-dot" />
              {me
                ? `${formatTokens(me.usedQuota)} / ${formatTokens(me.quota)}`
                : "—"}
            </span>
            <span className="portal-user">
              {me?.displayName || me?.username || "用户"}
            </span>
            <button
              className="portal-icon-btn"
              type="button"
              title="退出登录"
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
