import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { portalApi } from "../../lib/api";
import { IconBolt } from "../../components/icons";
import ModelCatalogFilters, {
  type FilterSkin,
} from "../../components/portal/ModelCatalogFilters";
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

const SKIN_STORE = "sc_model_filter_skin";
const SKINS: Array<{ id: FilterSkin; label: string }> = [
  { id: "pill", label: "胶囊" },
  { id: "segment", label: "分段" },
  { id: "outline", label: "描边" },
  { id: "soft", label: "轻底" },
];

function readSkin(): FilterSkin {
  try {
    const v = localStorage.getItem(SKIN_STORE);
    if (v === "pill" || v === "segment" || v === "outline" || v === "soft") return v;
  } catch {
    /* ignore */
  }
  return "pill";
}

function modelInitial(name: string): string {
  const part = name.split(/[-_/]/).find(Boolean) || name;
  return part.slice(0, 1).toUpperCase();
}

function isNew(createdAt?: PortalModel["createdAt"]) {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 14 * 86400_000;
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
  const [skin, setSkin] = useState<FilterSkin>(() => readSkin());

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
      m.providerLabel.toLowerCase().includes(s) ||
      modelBlurb(m.model, m.providerLabel).toLowerCase().includes(s)
    );
  }

  const filteredLive = useMemo(() => live.filter(passFilters), [live, q, family, modality, cap]);
  const filteredRetired = useMemo(
    () => retired.filter(passFilters),
    [retired, q, family, modality, cap],
  );

  return (
    <div className="portal-models-page">
      <div className="portal-page portal-page-head">
        <div className="portal-hero portal-hero-title">
          <div>
            <h1>模型广场</h1>
            <p>
              {live.length
                ? `共 ${live.length} 个可买模型 · 充值后按 token 扣费`
                : "暂无上架模型 · 需管理员在模型管理中同步给用户"}
            </p>
          </div>
          <div className="portal-skin-switch" role="radiogroup" aria-label="筛选按钮样式">
            <span>筛选样式</span>
            {SKINS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={skin === s.id}
                className={skin === s.id ? "is-on" : ""}
                onClick={() => {
                  setSkin(s.id);
                  try {
                    localStorage.setItem(SKIN_STORE, s.id);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="portal-toolbar portal-models-toolbar">
          <input
            className="portal-search"
            placeholder="搜索模型名称 / ID / 描述"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ModelCatalogFilters
            models={live}
            family={family}
            modality={modality}
            cap={cap}
            skin={skin}
            onFamilyChange={setFamily}
            onModalityChange={setModality}
            onCapChange={setCap}
          />
        </div>
      </div>

      <div className="portal-models-layout">
        {error ? <div className="alert">{error}</div> : null}

        <div className="portal-models-body">
          <div className="portal-models-main">
            <div className="portal-model-grid">
              {filteredLive.map((m) => (
                <ModelCard
                  key={m.id}
                  m={m}
                  hot={hotIds.has(m.id)}
                  fresh={isNew(m.createdAt)}
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
                        fresh={false}
                        retired
                        onDetail={() => setDetail(m)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {detail ? (
        <ModalBackdrop onClose={() => setDetail(null)}>
          <div className="modal modal-md portal-model-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-user-head">
              <h3>{detail.model}</h3>
              <p>{modelBlurb(detail.model, detail.providerLabel)}</p>
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
  fresh,
  retired,
  onDetail,
}: {
  m: PortalModel;
  hot: boolean;
  fresh: boolean;
  retired?: boolean;
  onDetail: () => void;
}) {
  const caps = detectCapabilities(m.model, [m.rewriteModel]);
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
          <span className="portal-provider-pill">{m.providerLabel}</span>
        </div>
      </div>
      <div className="portal-model-tags">
        {fresh ? <span className="portal-flag new">上新</span> : null}
        {hot ? <span className="portal-flag hot">热门</span> : null}
        {caps.map((id) => (
          <span key={id} className="portal-cap-tag">
            {MODEL_CAPABILITIES.find((c) => c.id === id)?.label ?? id}
          </span>
        ))}
      </div>
      <p className="portal-model-desc">{modelBlurb(m.model, m.providerLabel)}</p>
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
