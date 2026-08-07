import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { getToken, setToken } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ChannelsPage from "./pages/ChannelsPage";
import TokensPage from "./pages/TokensPage";
import ModelsPage from "./pages/ModelsPage";
import ProxyRoutesPage from "./pages/ProxyRoutesPage";
import LogsPage from "./pages/LogsPage";
import SettingsPage from "./pages/SettingsPage";

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SC</div>
          <h1>StarConverge</h1>
          <p>API 中转控制台</p>
        </div>
        <nav className="nav">
          <div className="nav-group">
            <div className="nav-label">运营</div>
            <NavLink to="/" end>
              数据看板
            </NavLink>
            <NavLink to="/logs">请求日志</NavLink>
          </div>
          <div className="nav-group">
            <div className="nav-label">资源</div>
            <NavLink to="/channels">渠道管理</NavLink>
            <NavLink to="/tokens">令牌管理</NavLink>
            <NavLink to="/models">模型路由</NavLink>
            <NavLink to="/proxy">通用代理</NavLink>
          </div>
          <div className="nav-group">
            <div className="nav-label">系统</div>
            <NavLink to="/settings">系统设置</NavLink>
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
              setToken(null);
              navigate("/login");
            }}
          >
            退出登录
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function Private({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Private><DashboardPage /></Private>} />
      <Route path="/channels" element={<Private><ChannelsPage /></Private>} />
      <Route path="/tokens" element={<Private><TokensPage /></Private>} />
      <Route path="/models" element={<Private><ModelsPage /></Private>} />
      <Route path="/proxy" element={<Private><ProxyRoutesPage /></Private>} />
      <Route path="/logs" element={<Private><LogsPage /></Private>} />
      <Route path="/settings" element={<Private><SettingsPage /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
