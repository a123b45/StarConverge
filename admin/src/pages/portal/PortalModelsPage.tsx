import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "../../lib/api";
import { IconBolt } from "../../components/icons";
import ModelCatalogFilters from "../../components/portal/ModelCatalogFilters";
import ModalBackdrop from "../../components/ModalBackdrop";
import {
  matchesFamily,
  matchesModality,
  detectCapabilities,
  hasCapability,
  modelBlurb,
  MODEL_CAPABILITIES,
  type ModelFamily,
  type ModelModality,
  type ModelCapability,
} from "../../lib/model-taxonomy";
import {
  formatLatency,
  formatPerMillion,
  type PortalModel,
} from "../../lib/portal-models";

function modelInitial(name: string): string {
  const part = name.split(/[-_/]/).find(Boolean) || name;
  return part.slice(0, 1).toUpperCase();
}

export default function PortalModelsPage() {
  const [models, setModels] = useState<PortalModel[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [family, setFamily] = useState<ModelFamily>("all");
  const [modality, setModality] = useState<ModelModality>("all");
  const [cap, setCap] = useState<ModelCapability | "all">("all");
  const [showRetired, setShowRetired] = useState(false);
  const [detail, setDetail] = useState<PortalModel | null>(null);

  useEffect(() => {
    portalApi<{ data: PortalModel[] }>("/models")
      .then((r) => setModels(r.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const live = useMemo(() => models.filter((m) => !m.retired), [models]);
  const retired = useMemo(() => models.filter((m) => m.retired), [models]);
  const hotIds = useMemo(() => {
    const ranked = [...live].sort((a, b) => (b.callCount ?? 0) - (a.callCount ?? 0));
    const cutoff = Math.max(10, ranked[0]?.callCount ?? 0) * 0.35;
    return new Set(
      ranked.filter((m) => (m.callCount ?? 0) >= cutoff && (m.callCount ?? 0) >= 8).map((m) => m.id),
    );
  }, [live]);

  function passFilters(m: PortalModel) {
    if (!matchesFamily(m.model, family)) return false;
    if (!matchesModality(m.model, modality, [m.rewriteModel])) return false;
    if (!hasCapability(m.model, cap, [m.rewriteModel])) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      m.model.toLowerCase().includes(s) ||
      modelBlurb(m.model).toLowerCase().includes(s)
    );
  }

  const filteredLive = useMemo(() => live.filter(passFilters), [live, q, family, modality, cap]);
  const filteredRetired = useMemo(
    () => retired.filter(passFilters),
    [retired, q, family, modality, cap],
  );

  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div>
          <h1>模型广场</h1>
          <p>
            {live.length
              ? `共 ${live.length} 个可买模型 · 充值后按 token 扣费`
              : "暂无上架模型 · 需管理员在模型管理中同步给用户"}
          </p>
        </div>
      </div>
      <div className="portal-toolbar">
        <input
          className="portal-search"
          placeholder="搜索模型名称 / ID / 描述"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ModelCatalogFilters
        models={live}
        family={family}
        modality={modality}
        cap={cap}
        onFamilyChange={setFamily}
        onModalityChange={setModality}
        onCapChange={setCap}
      />

      {error ? <div className="alert">{error}</div> : null}

      <div className="portal-model-grid">
        {filteredLive.map((m) => (
          <ModelCard
            key={m.id}
            m={m}
            hot={hotIds.has(m.id)}
            onDetail={() => setDetail(m)}
          />
        ))}
      </div>
      {!filteredLive.length ? (
        <div className="portal-empty">
          <strong>没有匹配的模型</strong>
          <p>试试调整筛选，或先去充值后再看已开通范围。</p>
          <div className="portal-empty-actions">
            <Link className="portal-btn" to="/app/recharge">
              去充值
            </Link>
            <Link className="portal-btn ghost" to="/app/docs">
              看接入说明
            </Link>
          </div>
        </div>
      ) : null}

      {retired.length ? (
        <div className="portal-retired-fold">
          <button
            type="button"
            className="portal-btn ghost sm"
            onClick={() => setShowRetired((v) => !v)}
          >
            {showRetired ? "收起" : "展开"}已退役模型（{filteredRetired.length}）
          </button>
          {showRetired ? (
            <div className="portal-model-grid" style={{ marginTop: 12 }}>
              {filteredRetired.map((m) => (
                <ModelCard
                  key={m.id}
                  m={m}
                  hot={false}
                  retired
                  onDetail={() => setDetail(m)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {detail ? (
        <ModalBackdrop onClose={() => setDetail(null)}>
          <div className="modal modal-md portal-model-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-user-head">
              <h3>{detail.model}</h3>
              <p>{modelBlurb(detail.model)}</p>
            </div>
            <div className="portal-cap-chips static">
              {detectCapabilities(detail.model, [detail.rewriteModel]).map((id) => (
                <span key={id} className="portal-cap-tag">
                  {MODEL_CAPABILITIES.find((c) => c.id === id)?.label ?? id}
                </span>
              ))}
            </div>
            <div className="portal-price-grid" style={{ marginTop: 12 }}>
              <div className="portal-price-cell">
                <span className="portal-price-label">输入</span>
                <strong className="portal-price-value">
                  {formatPerMillion(detail.inputPer1m ?? 0)}
                </strong>
              </div>
              <div className="portal-price-cell">
                <span className="portal-price-label">输出</span>
                <strong className="portal-price-value">
                  {formatPerMillion(detail.outputPer1m ?? 0)}
                </strong>
              </div>
              <div className="portal-price-cell cache">
                <span className="portal-price-label">缓存命中</span>
                <strong className="portal-price-value">
                  {formatPerMillion(detail.cacheHitPer1m ?? 0)}
                </strong>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>
              延迟 {formatLatency(detail.latencyMs ?? 0)}
              {detail.callCount ? ` · 近 7 日 ${detail.callCount} 次调用` : ""}
              {detail.retired ? " · 已下架，仅供对照价格" : ""}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setDetail(null)}>
                关闭
              </button>
              {!detail.retired ? (
                <>
                  <Link className="btn ghost" to={`/app/estimate?model=${encodeURIComponent(detail.model)}`}>
                    估费用
                  </Link>
                  <Link className="btn" to={`/app/chat?model=${encodeURIComponent(detail.model)}`}>
                    去对话
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}

function ModelCard({
  m,
  hot,
  retired,
  onDetail,
}: {
  m: PortalModel;
  hot: boolean;
  retired?: boolean;
  onDetail: () => void;
}) {
  const caps = detectCapabilities(m.model, [m.rewriteModel]);
  const tags = [
    ...(hot ? [{ id: "hot", label: "热门", kind: "hot" as const }] : []),
    ...caps.map((id) => ({
      id,
      label: MODEL_CAPABILITIES.find((c) => c.id === id)?.label ?? id,
      kind: "cap" as const,
    })),
  ];
  return (
    <article className={`portal-model-card${retired ? " is-retired" : ""}`}>
      <div className="portal-model-top">
        <div className="portal-model-icon" aria-hidden>
          {modelInitial(m.model)}
        </div>
        <div className="portal-model-title">
          <div className="portal-model-title-row">
            <h3 title={m.model}>{m.model}</h3>
            <span className={`portal-avail${retired ? " retired" : ""}`}>
              <i className={retired ? "off-dot" : "ok-dot"} aria-hidden />
              {retired ? "已退役" : "可用"}
            </span>
          </div>
        </div>
      </div>
      {tags.length ? (
        <div className="portal-model-tags">
          {tags.map((t) => (
            <span key={t.id} className={t.kind === "hot" ? "portal-flag hot" : "portal-cap-tag"}>
              {t.label}
            </span>
          ))}
        </div>
      ) : null}
      <p className="portal-model-desc">{modelBlurb(m.model)}</p>
      <div className="portal-price-grid" aria-label="模型定价">
        <div className="portal-price-cell">
          <span className="portal-price-label">输入</span>
          <strong className="portal-price-value">{formatPerMillion(m.inputPer1m ?? 0)}</strong>
        </div>
        <div className="portal-price-cell">
          <span className="portal-price-label">输出</span>
          <strong className="portal-price-value">{formatPerMillion(m.outputPer1m ?? 0)}</strong>
        </div>
        <div className="portal-price-cell cache">
          <span className="portal-price-label">缓存命中</span>
          <strong className="portal-price-value">{formatPerMillion(m.cacheHitPer1m ?? 0)}</strong>
        </div>
      </div>
      <div className="portal-model-meta">
        <span className="portal-model-latency">
          <IconBolt size={14} />
          延迟 {formatLatency(m.latencyMs ?? 0)}
        </span>
        {!retired ? (
          <span className="portal-model-actions">
            <button type="button" className="portal-link-btn" onClick={onDetail}>
              详情
            </button>
            <Link to={`/app/chat?model=${encodeURIComponent(m.model)}`}>对话</Link>
            <Link to={`/app/chat?compare=${encodeURIComponent(m.model)}`}>比较</Link>
          </span>
        ) : (
          <button type="button" className="portal-link-btn" onClick={onDetail}>
            详情
          </button>
        )}
      </div>
    </article>
  );
}
