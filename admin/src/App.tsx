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
import { formatTokens, getRole, getToken, portalApi, setSession, api } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import ChannelsPage from "./pages/ChannelsPage";
import TokensPage from "./pages/TokensPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import ModelsPage from "./pages/ModelsPage";
import ModelCatalogPage from "./pages/ModelCatalogPage";
import ProxyRoutesPage from "./pages/ProxyRoutesPage";
import LogsPage from "./pages/LogsPage";
import SettingsPage from "./pages/SettingsPage";
import UsersPage from "./pages/UsersPage";
import RolesPage from "./pages/RolesPage";
import PortalModelsPage from "./pages/portal/PortalModelsPage";
import PortalKeysPage from "./pages/portal/PortalKeysPage";
import PortalUsagePage from "./pages/portal/PortalUsagePage";
import PortalChatPage from "./pages/portal/PortalChatPage";
import PortalDocsPage from "./pages/portal/PortalDocsPage";
import TopTools from "./components/TopTools";
import { applyChromePrefs } from "./lib/chrome";
import {
  IconChart,
  IconFile,
  IconSidebar,
  AdminIconChannel,
  AdminIconDash,
  AdminIconKey,
  AdminIconLogs,
  AdminIconProxy,
  AdminIconRoute,
  AdminIconUsers,
  IconGear,
  IconShield,
  IconLayers,
  IconLock,
  NavIconChat,
  NavIconDocs,
  NavIconKey,
  NavIconOverview,
  NavIconUsage,
} from "./components/icons";
import UsagePage from "./pages/UsagePage";
import { SoftDialogHost } from "./components/SoftDialog";

applyChromePrefs();

const PORTAL_TITLES: Record<string, string> = {
  "/app/models": "模型列表",
  "/app/keys": "API 密钥",
  "/app/usage": "用量",
  "/app/chat": "对话测试",
  "/app/docs": "API 文档",
  "/app": "开发",
};

const ADMIN_TITLES: Record<string, string> = {
  "/admin": "控制台",
  "/admin/logs": "请求日志",
  "/admin/usage": "用量检测",
  "/admin/channels": "供应商管理",
  "/admin/tokens": "密钥管理",
  "/admin/api-keys": "API 密钥",
  "/admin/models": "路由管理",
  "/admin/proxy": "模型管理",
  "/admin/http-proxy": "代理转发",
  "/admin/users": "用户管理",
  "/admin/roles": "角色管理",
  "/admin/settings": "API 文档",
};

function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [menuPerms, setMenuPerms] = useState<string[] | null>(null);
  const [roleLabel, setRoleLabel] = useState("管理员");

  useEffect(() => {
    api<{
      menuPerms: string[];
      isSuper: boolean;
      username: string;
      roleName?: string | null;
    }>("/me")
      .then((me) => {
        setMenuPerms(me.menuPerms);
        setRoleLabel(
          me.isSuper ? "超级管理员" : me.roleName?.trim() || "管理员",
        );
      })
      .catch(() => setMenuPerms([]));
  }, []);

  const can = (key: string) => !menuPerms || menuPerms.includes(key);

  const pageTitle =
    ADMIN_TITLES[location.pathname] ||
    Object.entries(ADMIN_TITLES).find(([k]) =>
      location.pathname.startsWith(k) && k !== "/admin",
    )?.[1] ||
    (location.pathname === "/admin" ? "控制台" : "管理");

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
            {can("menu.dashboard") ? (
              <NavLink to="/admin" end>
                <AdminIconDash />
                控制台
              </NavLink>
            ) : null}
            {can("menu.usage") ? (
              <NavLink to="/admin/usage">
                <IconChart />
                用量检测
              </NavLink>
            ) : null}
            {can("menu.logs") ? (
              <NavLink to="/admin/logs">
                <AdminIconLogs />
                请求日志
              </NavLink>
            ) : null}
          </div>
          <div className="nav-group">
            <div className="nav-label">资源</div>
            {can("menu.channels") ? (
              <NavLink to="/admin/channels">
                <AdminIconChannel />
                供应商管理
              </NavLink>
            ) : null}
            {can("menu.proxy") ? (
              <NavLink to="/admin/proxy">
                <AdminIconProxy />
                模型管理
              </NavLink>
            ) : null}
          </div>
          <div className="nav-group">
            <div className="nav-label nav-label-icon">
              <IconLayers size={14} />
              策略
            </div>
            {can("menu.routes") ? (
              <NavLink to="/admin/models">
                <AdminIconRoute />
                路由管理
              </NavLink>
            ) : null}
            {can("menu.proxyHttp") ? (
              <NavLink to="/admin/http-proxy">
                <IconLayers size={16} />
                代理转发
              </NavLink>
            ) : null}
            {can("menu.apiKeys") ? (
              <NavLink to="/admin/api-keys">
                <AdminIconKey />
                API 密钥
              </NavLink>
            ) : null}
            {can("menu.tokens") ? (
              <NavLink to="/admin/tokens">
                <IconLock />
                密钥管理
              </NavLink>
            ) : null}
          </div>
          <div className="nav-group">
            <div className="nav-label nav-label-icon">
              <IconGear size={14} />
              系统
            </div>
            {can("menu.users") ? (
              <NavLink to="/admin/users">
                <AdminIconUsers />
                用户管理
              </NavLink>
            ) : null}
            {can("menu.roles") ? (
              <NavLink to="/admin/roles">
                <IconShield />
                角色管理
              </NavLink>
            ) : null}
            {can("menu.settings") ? (
              <NavLink to="/admin/settings">
                <IconFile />
                API 文档
              </NavLink>
            ) : null}
          </div>
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-role">
            <span>当前角色</span>
            <strong>{roleLabel}</strong>
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
          <TopTools
            user={{ username: "admin", displayName: "管理员" }}
            editable={false}
            onLogout={() => {
              setSession(null);
              navigate("/login");
            }}
          />
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
    menuPerms?: string[];
  } | null>(null);
  const [menuPerms, setMenuPerms] = useState<string[] | null>(null);
  const [siderCollapsed, setSiderCollapsed] = useState(false);

  useEffect(() => {
    portalApi<{
      username: string;
      displayName?: string | null;
      usedQuota: number;
      quota: number;
      menuPerms?: string[];
    }>("/me")
      .then((data) => {
        setMe(data);
        setMenuPerms(data.menuPerms ?? []);
      })
      .catch(() => {
        setMe(null);
        setMenuPerms([]);
      });
  }, []);

  const can = (key: string) => !menuPerms || menuPerms.includes(key);
  const hasAnyPortal =
    !menuPerms ||
    menuPerms.some((k) => k.startsWith("menu.portal."));

  useEffect(() => {
    if (menuPerms && !hasAnyPortal) {
      navigate("/login", { replace: true });
    }
  }, [menuPerms, hasAnyPortal, navigate]);

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
            {can("menu.portal.models") ? (
              <NavLink to="/app/models">
                <NavIconOverview />
                模型列表
              </NavLink>
            ) : null}
            {can("menu.portal.keys") ? (
              <NavLink to="/app/keys">
                <NavIconKey />
                API 密钥
              </NavLink>
            ) : null}
            {can("menu.portal.usage") ? (
              <NavLink to="/app/usage">
                <NavIconUsage />
                用量
              </NavLink>
            ) : null}
            {can("menu.portal.chat") ? (
              <NavLink to="/app/chat">
                <NavIconChat />
                对话测试
              </NavLink>
            ) : null}
            {can("menu.portal.docs") ? (
              <NavLink to="/app/docs">
                <NavIconDocs />
                API 文档
              </NavLink>
            ) : null}
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
          <TopTools
            leading={
              <span className="portal-quota-pill" title="Token 配额">
                <span className="ok-dot" />
                {me
                  ? `${formatTokens(me.usedQuota)} / ${formatTokens(me.quota)}`
                  : "—"}
              </span>
            }
            user={{
              username: me?.username || "user",
              displayName: me?.displayName || me?.username || "用户",
            }}
            editable
            onUserUpdated={(u) =>
              setMe((prev) =>
                prev
                  ? { ...prev, displayName: u.displayName, username: u.username }
                  : prev,
              )
            }
            onLogout={() => {
              setSession(null);
              navigate("/login");
            }}
          />
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
  return <Navigate to={getRole() === "user" ? "/app/models" : "/admin"} replace />;
}

export default function App() {
  return (
    <>
      <SoftDialogHost />
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
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
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="tokens" element={<TokensPage />} />
        <Route path="models" element={<ModelsPage />} />
        <Route path="proxy" element={<ModelCatalogPage />} />
        <Route path="http-proxy" element={<ProxyRoutesPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="usage" element={<UsagePage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="roles" element={<RolesPage />} />
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
    </>
  );
}
