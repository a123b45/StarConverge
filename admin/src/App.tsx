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
import {
  IconBell,
  IconLang,
  IconSettings,
  IconSidebar,
  IconUser,
  AdminIconChannel,
  AdminIconDash,
  AdminIconKey,
  AdminIconLogs,
  AdminIconProxy,
  AdminIconRoute,
  AdminIconSettings,
  AdminIconUsers,
  NavIconChat,
  NavIconDocs,
  NavIconKey,
  NavIconOverview,
  NavIconUsage,
} from "./components/icons";

const PORTAL_TITLES: Record<string, string> = {
  "/app/models": "模型列表",
  "/app/keys": "API 密钥",
  "/app/usage": "用量",
  "/app/chat": "对话测试",
  "/app/docs": "API 文档",
  "/app": "开发",
};

const ADMIN_TITLES: Record<string, string> = {
  "/admin": "数据看板",
  "/admin/logs": "请求日志",
  "/admin/channels": "渠道管理",
  "/admin/tokens": "令牌管理",
  "/admin/models": "模型路由",
  "/admin/proxy": "通用代理",
  "/admin/users": "客户管理",
  "/admin/settings": "系统设置",
};

function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [location.pathname]);

  const pageTitle =
    ADMIN_TITLES[location.pathname] ||
    Object.entries(ADMIN_TITLES).find(([k]) =>
      location.pathname.startsWith(k) && k !== "/admin",
    )?.[1] ||
    (location.pathname === "/admin" ? "数据看板" : "管理");

  return (
    <div className={`app-shell${siderCollapsed ? " sider-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <strong className="brand-name">StarConverge</strong>
        </div>
        <nav className="nav">
          <div className="nav-group">
            <div className="nav-label">运营</div>
            <NavLink to="/admin" end>
              <AdminIconDash />
              数据看板
            </NavLink>
            <NavLink to="/admin/logs">
              <AdminIconLogs />
              请求日志
            </NavLink>
          </div>
          <div className="nav-group">
            <div className="nav-label">资源</div>
            <NavLink to="/admin/channels">
              <AdminIconChannel />
              渠道管理
            </NavLink>
            <NavLink to="/admin/tokens">
              <AdminIconKey />
              令牌管理
            </NavLink>
            <NavLink to="/admin/models">
              <AdminIconRoute />
              模型路由
            </NavLink>
            <NavLink to="/admin/proxy">
              <AdminIconProxy />
              通用代理
            </NavLink>
            <NavLink to="/admin/users">
              <AdminIconUsers />
              客户管理
            </NavLink>
          </div>
          <div className="nav-group">
            <div className="nav-label">系统</div>
            <NavLink to="/admin/settings">
              <AdminIconSettings />
              系统设置
            </NavLink>
          </div>
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-role">
            <span>当前角色</span>
            <strong>管理员</strong>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-top-left">
            <button
              type="button"
              className="portal-tool-btn"
              title={siderCollapsed ? "展开侧栏" : "收起侧栏"}
              onClick={() => setSiderCollapsed((v) => !v)}
            >
              <IconSidebar />
            </button>
            <div className="portal-crumb">
              <span>管理</span>
              <i>/</i>
              <strong>{pageTitle}</strong>
            </div>
          </div>
          <div className="admin-top-right">
            <button
              type="button"
              className="portal-tool-btn"
              title="系统设置"
              onClick={() => navigate("/admin/settings")}
            >
              <IconSettings />
            </button>
            <div className="portal-user-menu">
              <button
                type="button"
                className="portal-tool-btn"
                title="管理员"
                onClick={() => setUserMenuOpen((v) => !v)}
              >
                <IconUser />
              </button>
              {userMenuOpen ? (
                <div className="portal-user-dropdown">
                  <div className="portal-user-meta">
                    <strong>管理员</strong>
                    <span>admin</span>
                  </div>
                  <button type="button" onClick={() => navigate("/admin/settings")}>
                    系统设置
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setSession(null);
                      navigate("/login");
                    }}
                  >
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
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
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [lang, setLang] = useState<"zh" | "en">("zh");

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

  useEffect(() => {
    setUserMenuOpen(false);
  }, [location.pathname]);

  const pageTitle =
    PORTAL_TITLES[location.pathname] ||
    Object.entries(PORTAL_TITLES).find(([k]) =>
      location.pathname.startsWith(k),
    )?.[1] ||
    "开发";

  return (
    <div className={`portal-shell${siderCollapsed ? " sider-collapsed" : ""}`}>
      <aside className="portal-sider">
        <div className="portal-sider-brand">
          <span className="portal-logo">S</span>
          <strong>StarConverge</strong>
        </div>
        <nav className="portal-sider-nav">
          <div className="portal-sider-group">
            <div className="portal-sider-label">开发</div>
            <NavLink to="/app/models">
              <NavIconOverview />
              模型列表
            </NavLink>
            <NavLink to="/app/keys">
              <NavIconKey />
              API 密钥
            </NavLink>
            <NavLink to="/app/usage">
              <NavIconUsage />
              用量
            </NavLink>
            <NavLink to="/app/chat">
              <NavIconChat />
              对话测试
            </NavLink>
            <NavLink to="/app/docs">
              <NavIconDocs />
              API 文档
            </NavLink>
          </div>
        </nav>
        <div className="portal-sider-foot">
          <div className="portal-balance">
            <span>可用配额</span>
            <strong>
              {me
                ? `${formatTokens(Math.max(0, me.quota - me.usedQuota))}`
                : "—"}
            </strong>
            <em>
              {me
                ? `已用 ${formatTokens(me.usedQuota)} / ${formatTokens(me.quota)}`
                : "加载中…"}
            </em>
          </div>
        </div>
      </aside>

      <div className="portal-main">
        <header className="portal-topbar">
          <div className="portal-top-left">
            <button
              type="button"
              className="portal-tool-btn"
              title={siderCollapsed ? "展开侧栏" : "收起侧栏"}
              onClick={() => setSiderCollapsed((v) => !v)}
            >
              <IconSidebar />
            </button>
            <div className="portal-crumb">
              <span>开发</span>
              <i>/</i>
              <strong>{pageTitle}</strong>
            </div>
          </div>
          <div className="portal-top-right">
            <span className="portal-quota-pill" title="Token 配额">
              <span className="ok-dot" />
              {me
                ? `${formatTokens(me.usedQuota)} / ${formatTokens(me.quota)}`
                : "—"}
            </span>
            <button
              type="button"
              className="portal-tool-btn"
              title={lang === "zh" ? "切换为 English" : "切换为中文"}
              onClick={() => setLang((v) => (v === "zh" ? "en" : "zh"))}
            >
              <IconLang />
            </button>
            <button
              type="button"
              className="portal-tool-btn"
              title="设置 / 接入文档"
              onClick={() => navigate("/app/docs")}
            >
              <IconSettings />
            </button>
            <button type="button" className="portal-tool-btn" title="通知">
              <IconBell />
              <span className="portal-tool-badge dot" />
            </button>
            <div className="portal-user-menu">
              <button
                type="button"
                className="portal-tool-btn"
                title={me?.displayName || me?.username || "用户"}
                onClick={() => setUserMenuOpen((v) => !v)}
              >
                <IconUser />
              </button>
              {userMenuOpen ? (
                <div className="portal-user-dropdown">
                  <div className="portal-user-meta">
                    <strong>{me?.displayName || me?.username || "用户"}</strong>
                    <span>{me?.username || "—"}</span>
                  </div>
                  <button type="button" onClick={() => navigate("/app/keys")}>
                    API 密钥
                  </button>
                  <button type="button" onClick={() => navigate("/app/usage")}>
                    用量统计
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      setSession(null);
                      navigate("/login");
                    }}
                  >
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
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
