import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "../../lib/api";

type ModelItem = {
  id: string;
  model: string;
  providerLabel: string;
  providers: { name: string; type: string }[];
};

export default function PortalModelsPage() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    portalApi<{ data: ModelItem[] }>("/models")
      .then((r) => setModels(r.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return models;
    return models.filter(
      (m) =>
        m.model.toLowerCase().includes(s) ||
        m.providerLabel.toLowerCase().includes(s),
    );
  }, [models, q]);

  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>模型列表</h1>
          <p>共 {filtered.length} 个可用模型 · 按 token 配额计量</p>
        </div>
        <div className="portal-hero-actions">
          <input
            className="portal-search"
            placeholder="搜索模型…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Link className="portal-btn" to="/app/keys">
            获取 API Key
          </Link>
        </div>
      </div>
      {error ? <div className="alert">{error}</div> : null}
      <div className="portal-model-grid">
        {filtered.map((m) => (
          <article key={m.id} className="portal-model-card">
            <div className="portal-model-top">
              <div className="portal-model-icon">{m.model.slice(0, 1).toUpperCase()}</div>
              <div>
                <h3>{m.model}</h3>
                <code>{m.model}</code>
                <div className="portal-provider">{m.providerLabel}</div>
              </div>
            </div>
            <p className="portal-model-desc">
              经 StarConverge 路由至上游渠道，消耗您的 API 密钥 token 配额。
            </p>
            <div className="portal-model-meta">
              <span>配额计量 · tokens</span>
              <span className="ok-dot">可用</span>
            </div>
          </article>
        ))}
        {!filtered.length ? (
          <div className="portal-empty">暂无模型，请联系管理员配置渠道与路由</div>
        ) : null}
      </div>
    </div>
  );
}
