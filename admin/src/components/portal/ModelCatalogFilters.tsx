import { useMemo } from "react";
import {
  MODEL_FAMILIES,
  MODEL_MODALITIES,
  type ModelFamily,
  type ModelModality,
  detectModelFamily,
  matchesFamily,
  matchesModality,
} from "../../lib/model-taxonomy";

type ModelRef = { model: string; rewriteModel?: string | null };

type Props = {
  models: ModelRef[];
  family: ModelFamily;
  modality: ModelModality;
  onFamilyChange: (v: ModelFamily) => void;
  onModalityChange: (v: ModelModality) => void;
};

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
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`portal-filter-item${active ? " is-active" : ""}`}
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
  onFamilyChange,
  onModalityChange,
}: Props) {
  const familyCounts = useMemo(() => countByFamily(models), [models]);

  const modalityCounts = useMemo(() => {
    const scoped = models.filter((m) => matchesFamily(m.model, family));
    return {
      all: scoped.length,
      text: scoped.filter((m) => matchesModality(m.model, "text", [m.rewriteModel])).length,
      multimodal: scoped.filter((m) =>
        matchesModality(m.model, "multimodal", [m.rewriteModel]),
      ).length,
    };
  }, [models, family]);

  return (
    <aside className="portal-model-filters" aria-label="模型筛选">
      <div className="portal-filter-head">
        <strong>快速筛选</strong>
      </div>

      <div className="portal-filter-section">
        <span className="portal-filter-label">模型能力</span>
        <div className="portal-filter-group">
          {MODEL_MODALITIES.map((item) => (
            <FilterButton
              key={item.id}
              active={modality === item.id}
              label={item.label}
              count={modalityCounts[item.id]}
              onClick={() => onModalityChange(item.id)}
            />
          ))}
        </div>
      </div>

      <div className="portal-filter-section">
        <span className="portal-filter-label">模型系列</span>
        <div className="portal-filter-group">
          {MODEL_FAMILIES.map((item) => (
            <FilterButton
              key={item.id}
              active={family === item.id}
              label={item.label}
              count={familyCounts.get(item.id) ?? 0}
              onClick={() => onFamilyChange(item.id)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
