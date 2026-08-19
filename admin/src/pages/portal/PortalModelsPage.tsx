import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "../../lib/api";
import { IconBolt } from "../../components/icons";
import ModelCatalogFilters from "../../components/portal/ModelCatalogFilters";
import {
  matchesFamily,
  matchesModality,
  type ModelFamily,
  type ModelModality,
} from "../../lib/model-taxonomy";

type ModelItem = {
  id: string;
  model: string;
  providerLabel: string;
  providers: { name: string; type: string }[];
  inputPer1m: number;
  outputPer1m: number;
  cacheHitPer1m: number;
  latencyMs?: number;
};

function modelInitial(name: string): string {
  const part = name.split(/[-_/]/).find(Boolean) || name;
  return part.slice(0, 1).toUpperCase();
}

function formatPerMillion(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  const text =
    v >= 100
      ? v.toFixed(0)
      : v >= 1
        ? v.toFixed(2)
        : v.toFixed(Math.min(4, Math.max(2, (v.toString().split(".")[1] || "").length)));
  return `$${text} / 百万`;
}

function formatLatency(ms: number) {
  const v = Number.isFinite(ms) && ms > 0 ? ms : 0;
  return `${(v / 1000).toFixed(1)}s`;
}

export default function PortalModelsPage() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [family, setFamily] = useState<ModelFamily>("all");
  const [modality, setModality] = useState<ModelModality>("all");

  useEffect(() => {
    portalApi<{ data: ModelItem[] }>("/models")
      .then((r) => setModels(r.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return models.filter((m) => {
      if (!matchesFamily(m.model, family)) return false;
      if (!matchesModality(m.model, modality)) return false;
      if (!s) return true;
      return (
        m.model.toLowerCase().includes(s) ||
        m.providerLabel.toLowerCase().includes(s)
      );
    });
  }, [models, q, family, modality]);

  return (
    <div className="portal-models-page">
      <div className="portal-page portal-page-head">
        <div className="portal-hero portal-hero-title">
          <div>
            <h1>模型列表</h1>
            <p>
              {models.length
                ? `共 ${models.length} 个可用模型 · 按 token 配额计量`
                : "暂无可用模型 · 需管理员在模型管理中同步给用户"}
            </p>
          </div>
        </div>
      </div>

      <div className="portal-models-layout">
        <div className="portal-toolbar">
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
        {error ? <div className="alert">{error}</div> : null}

        <div className="portal-models-body">
          <ModelCatalogFilters
            models={models}
            family={family}
            modality={modality}
            onFamilyChange={setFamily}
            onModalityChange={setModality}
          />
          <div className="portal-models-main">
            <div className="portal-model-grid">
              {filtered.map((m) => (
                <article key={m.id} className="portal-model-card">
                  <div className="portal-model-top">
                    <div className="portal-model-icon" aria-hidden>
                      {modelInitial(m.model)}
                    </div>
                    <div className="portal-model-title">
                      <div className="portal-model-title-row">
                        <h3 title={m.model}>{m.model}</h3>
                        <span className="portal-avail">
                          <i className="ok-dot" aria-hidden />
                          可用
                        </span>
                      </div>
                      <span className="portal-provider-pill">{m.providerLabel}</span>
                    </div>
                  </div>
                  <p className="portal-model-desc">
                    经 StarConverge 路由至上游，调用消耗 API 密钥配额。
                  </p>
                  <div className="portal-price-grid" aria-label="模型定价">
                    <div className="portal-price-cell">
                      <span className="portal-price-label">输入</span>
                      <strong className="portal-price-value">
                        {formatPerMillion(m.inputPer1m ?? 0)}
                      </strong>
                    </div>
                    <div className="portal-price-cell">
                      <span className="portal-price-label">输出</span>
                      <strong className="portal-price-value">
                        {formatPerMillion(m.outputPer1m ?? 0)}
                      </strong>
                    </div>
                    <div className="portal-price-cell cache">
                      <span className="portal-price-label">缓存命中</span>
                      <strong className="portal-price-value">
                        {formatPerMillion(m.cacheHitPer1m ?? 0)}
                      </strong>
                    </div>
                  </div>
                  <div className="portal-model-meta">
                    <span className="portal-model-latency">
                      <IconBolt size={14} />
                      延迟 {formatLatency(m.latencyMs ?? 0)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
            {!filtered.length ? (
              <div className="portal-empty">
                没有匹配的模型。试试调整左侧筛选或搜索关键词。
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
