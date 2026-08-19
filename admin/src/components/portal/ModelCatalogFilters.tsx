import { useMemo } from "react";
import {
  FILTER_LAYOUT_KEY,
  MODEL_FAMILIES,
  MODEL_MODALITIES,
  type FilterLayout,
  type ModelFamily,
  type ModelModality,
  detectModelFamily,
  matchesFamily,
  matchesModality,
} from "../../lib/model-taxonomy";

type ModelRef = { model: string };

type Props = {
  models: ModelRef[];
  family: ModelFamily;
  modality: ModelModality;
  layout: FilterLayout;
  onFamilyChange: (v: ModelFamily) => void;
  onModalityChange: (v: ModelModality) => void;
  onLayoutChange: (v: FilterLayout) => void;
};

const LAYOUT_OPTIONS: Array<{ id: FilterLayout; label: string; hint: string }> = [
  { id: "sidebar", label: "经典侧栏", hint: "分组清单 + 计数" },
  { id: "compact", label: "紧凑列表", hint: "窄栏高密度" },
  { id: "accordion", label: "折叠分组", hint: "按系列展开预览" },
];

function countByFamily(models: ModelRef[]) {
  const map = new Map<ModelFamily, number>();
  for (const f of MODEL_FAMILIES) map.set(f.id, 0);
  for (const m of models) {
    const id = detectModelFamily(m.model);
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  map.set("all", models.length);
  return map;
}

function FilterButton({
  active,
  label,
  count,
  onClick,
  compact,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`portal-filter-item${active ? " is-active" : ""}${compact ? " is-compact" : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="portal-filter-count">{count}</span>
    </button>
  );
}

export default function ModelCatalogFilters({
  models,
  family,
  modality,
  layout,
  onFamilyChange,
  onModalityChange,
  onLayoutChange,
}: Props) {
  const familyCounts = useMemo(() => countByFamily(models), [models]);

  const modalityCounts = useMemo(() => {
    const scoped = models.filter((m) => matchesFamily(m.model, family));
    return {
      all: scoped.length,
      text: scoped.filter((m) => matchesModality(m.model, "text")).length,
      multimodal: scoped.filter((m) => matchesModality(m.model, "multimodal")).length,
    };
  }, [models, family]);

  const familyGroups = useMemo(() => {
    return MODEL_FAMILIES.filter((f) => f.id !== "all")
      .map((f) => ({
        ...f,
        count: familyCounts.get(f.id) ?? 0,
        samples: models.filter((m) => detectModelFamily(m.model) === f.id).slice(0, 4),
      }))
      .filter((f) => f.count > 0);
  }, [models, familyCounts]);

  return (
    <aside className={`portal-model-filters layout-${layout}`} aria-label="模型筛选">
      <div className="portal-filter-head">
        <strong>快速筛选</strong>
        <label className="portal-filter-layout-picker">
          <span className="sr-only">筛选样式</span>
          <select
            value={layout}
            onChange={(e) => onLayoutChange(e.target.value as FilterLayout)}
            title="切换筛选栏样式"
          >
            {LAYOUT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="portal-filter-layout-hint">
        {LAYOUT_OPTIONS.find((o) => o.id === layout)?.hint}
      </p>

      <div className="portal-filter-section">
        <span className="portal-filter-label">模型能力</span>
        <div className={`portal-filter-group${layout === "compact" ? " is-compact" : ""}`}>
          {MODEL_MODALITIES.map((item) => (
            <FilterButton
              key={item.id}
              active={modality === item.id}
              label={item.label}
              count={modalityCounts[item.id]}
              compact={layout === "compact"}
              onClick={() => onModalityChange(item.id)}
            />
          ))}
        </div>
      </div>

      {layout === "accordion" ? (
        <div className="portal-filter-section">
          <span className="portal-filter-label">模型系列</span>
          <div className="portal-filter-accordion">
            <FilterButton
              active={family === "all"}
              label="全部系列"
              count={familyCounts.get("all") ?? 0}
              onClick={() => onFamilyChange("all")}
            />
            {familyGroups.map((group) => (
              <div
                key={group.id}
                className={`portal-filter-details${family === group.id ? " is-active" : ""}`}
              >
                <FilterButton
                  active={family === group.id}
                  label={group.label}
                  count={group.count}
                  onClick={() => onFamilyChange(group.id)}
                />
                {family === group.id ? (
                  <div className="portal-filter-samples">
                    {group.samples.map((m) => (
                      <span key={m.model} className="portal-filter-sample">
                        {m.model}
                      </span>
                    ))}
                    {group.count > group.samples.length ? (
                      <span className="portal-filter-sample muted">
                        +{group.count - group.samples.length} 更多
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="portal-filter-section">
          <span className="portal-filter-label">模型系列</span>
          <div className={`portal-filter-group${layout === "compact" ? " is-compact" : ""}`}>
            {MODEL_FAMILIES.map((item) => (
              <FilterButton
                key={item.id}
                active={family === item.id}
                label={item.label}
                count={familyCounts.get(item.id) ?? 0}
                compact={layout === "compact"}
                onClick={() => onFamilyChange(item.id)}
              />
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

export { FILTER_LAYOUT_KEY };
