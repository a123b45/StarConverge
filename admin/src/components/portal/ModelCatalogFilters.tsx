import { useMemo } from "react";
import {
  MODEL_FAMILIES,
  MODEL_MODALITIES,
  MODEL_CAPABILITIES,
  type ModelFamily,
  type ModelModality,
  type ModelCapability,
  detectModelFamily,
  hasCapability,
  matchesFamily,
  matchesModality,
} from "../../lib/model-taxonomy";

export type FilterSkin = "pill" | "segment" | "outline" | "soft";

type ModelRef = { model: string; rewriteModel?: string | null };

type Props = {
  models: ModelRef[];
  family: ModelFamily;
  modality: ModelModality;
  cap: ModelCapability | "all";
  skin: FilterSkin;
  onFamilyChange: (v: ModelFamily) => void;
  onModalityChange: (v: ModelModality) => void;
  onCapChange: (v: ModelCapability | "all") => void;
};

function Chip({
  active,
  label,
  count,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`portal-fbtn${active ? " is-on" : ""}`}
      title={title || label}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      {count != null ? <em>{count}</em> : null}
    </button>
  );
}

export default function ModelCatalogFilters({
  models,
  family,
  modality,
  cap,
  skin,
  onFamilyChange,
  onModalityChange,
  onCapChange,
}: Props) {
  const familyCounts = useMemo(() => {
    const map = new Map<ModelFamily, number>();
    for (const f of MODEL_FAMILIES) map.set(f.id, 0);
    for (const m of models) {
      const id = detectModelFamily(m.model);
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    map.set("all", models.length);
    return map;
  }, [models]);

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

  const capCounts = useMemo(() => {
    const scoped = models.filter(
      (m) =>
        matchesFamily(m.model, family) &&
        matchesModality(m.model, modality, [m.rewriteModel]),
    );
    const out: Record<string, number> = { all: scoped.length };
    for (const c of MODEL_CAPABILITIES) {
      out[c.id] = scoped.filter((m) => hasCapability(m.model, c.id, [m.rewriteModel])).length;
    }
    return out;
  }, [models, family, modality]);

  return (
    <div className="portal-fbar" data-skin={skin} role="toolbar" aria-label="模型筛选">
      <div className="portal-fbar-group" aria-label="文本或多模态">
        {MODEL_MODALITIES.map((item) => (
          <Chip
            key={item.id}
            active={modality === item.id}
            label={item.short}
            title={item.label}
            count={modalityCounts[item.id]}
            onClick={() => onModalityChange(item.id)}
          />
        ))}
      </div>
      <div className="portal-fbar-group" aria-label="能力">
        <Chip
          active={cap === "all"}
          label="全部"
          count={capCounts.all}
          onClick={() => onCapChange("all")}
        />
        {MODEL_CAPABILITIES.map((item) => (
          <Chip
            key={item.id}
            active={cap === item.id}
            label={item.label}
            count={capCounts[item.id]}
            onClick={() => onCapChange(item.id)}
          />
        ))}
      </div>
      <div className="portal-fbar-group" aria-label="模型系列">
        {MODEL_FAMILIES.filter((item) => item.id === "all" || (familyCounts.get(item.id) ?? 0) > 0).map(
          (item) => (
            <Chip
              key={item.id}
              active={family === item.id}
              label={item.short}
              title={item.label}
              count={familyCounts.get(item.id) ?? 0}
              onClick={() => onFamilyChange(item.id)}
            />
          ),
        )}
      </div>
    </div>
  );
}
