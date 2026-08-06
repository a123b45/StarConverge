import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { getToken, setToken } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ChannelsPage from "./pages/ChannelsPage";
import TokensPage from "./pages/TokensPage";
import ModelsPage from "./pages/ModelsPage";
import ProxyRoutesPage from "./pages/ProxyRoutesPage";
import LogsPage from "./pages/LogsPage";

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>StarConverge</h1>
          <p>API 中转平台</p>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            总览
          </NavLink>
          <NavLink to="/channels">上游通道</NavLink>
          <NavLink to="/tokens">访问密钥</NavLink>
          <NavLink to="/models">模型路由</NavLink>
          <NavLink to="/proxy">通用代理</NavLink>
          <NavLink to="/logs">请求日志</NavLink>
        </nav>
        <div style={{ marginTop: "auto" }}>
          <button
            className="btn ghost"
            style={{ width: "100%" }}
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
      <Route
        path="/"
        element={
          <Private>
            <DashboardPage />
          </Private>
        }
      />
      <Route
        path="/channels"
        element={
          <Private>
            <ChannelsPage />
          </Private>
        }
      />
      <Route
        path="/tokens"
        element={
          <Private>
            <TokensPage />
          </Private>
        }
      />
      <Route
        path="/models"
        element={
          <Private>
            <ModelsPage />
          </Private>
        }
      />
      <Route
        path="/proxy"
        element={
          <Private>
            <ProxyRoutesPage />
          </Private>
        }
      />
      <Route
        path="/logs"
        element={
          <Private>
            <LogsPage />
          </Private>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
