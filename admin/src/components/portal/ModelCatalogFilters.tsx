import { useMemo } from "react";
import { useI18n } from "../../lib/i18n";
import type { MsgKey } from "../../lib/i18n-copy";
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

type ModelRef = { model: string; rewriteModel?: string | null };

type Props = {
  models: ModelRef[];
  family: ModelFamily;
  modality: ModelModality;
  cap: ModelCapability | "all";
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

const CAP_KEYS: Record<ModelCapability, MsgKey> = {
  tools: "models.cap.tools",
  thinking: "models.cap.thinking",
  vision: "models.cap.vision",
  coding: "models.cap.coding",
  longctx: "models.cap.longctx",
};

export default function ModelCatalogFilters({
  models,
  family,
  modality,
  cap,
  onFamilyChange,
  onModalityChange,
  onCapChange,
}: Props) {
  const { t } = useI18n();

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

  function modalityShort(id: ModelModality) {
    if (id === "all") return t("common.all");
    if (id === "text") return t("models.modalityText");
    return t("models.modalityMultimodal");
  }

  function familyShort(id: ModelFamily, fallback: string) {
    if (id === "all") return t("common.all");
    if (id === "other") return t("models.familyOther");
    return fallback;
  }

  return (
    <div className="portal-fbar" role="toolbar" aria-label={t("models.filterBar")}>
      <div className="portal-fbar-group">
        <span className="portal-fbar-label">{t("models.filterModality")}</span>
        {MODEL_MODALITIES.map((item) => (
          <Chip
            key={item.id}
            active={modality === item.id}
            label={modalityShort(item.id)}
            title={modalityShort(item.id)}
            count={modalityCounts[item.id]}
            onClick={() => onModalityChange(item.id)}
          />
        ))}
      </div>
      <div className="portal-fbar-group">
        <span className="portal-fbar-label">{t("models.filterCapability")}</span>
        <Chip
          active={cap === "all"}
          label={t("common.all")}
          count={capCounts.all}
          onClick={() => onCapChange("all")}
        />
        {MODEL_CAPABILITIES.map((item) => (
          <Chip
            key={item.id}
            active={cap === item.id}
            label={t(CAP_KEYS[item.id])}
            count={capCounts[item.id]}
            onClick={() => onCapChange(item.id)}
          />
        ))}
      </div>
      <div className="portal-fbar-group">
        <span className="portal-fbar-label">{t("models.filterSeries")}</span>
        {MODEL_FAMILIES.filter((item) => item.id === "all" || (familyCounts.get(item.id) ?? 0) > 0).map(
          (item) => (
            <Chip
              key={item.id}
              active={family === item.id}
              label={familyShort(item.id, item.short)}
              title={familyShort(item.id, item.label)}
              count={familyCounts.get(item.id) ?? 0}
              onClick={() => onFamilyChange(item.id)}
            />
          ),
        )}
      </div>
    </div>
  );
}
