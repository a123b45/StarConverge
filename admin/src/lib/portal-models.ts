export type PortalModel = {
  id: string;
  model: string;
  rewriteModel?: string | null;
  providerLabel: string;
  providers: { name: string; type: string }[];
  inputPer1m: number;
  outputPer1m: number;
  cacheHitPer1m: number;
  latencyMs?: number;
  callCount?: number;
  createdAt?: string | number | Date | null;
  retired?: boolean;
};

export function formatPerMillion(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  const text =
    v >= 100
      ? v.toFixed(0)
      : v >= 1
        ? v.toFixed(2)
        : v.toFixed(Math.min(4, Math.max(2, (v.toString().split(".")[1] || "").length)));
  return `$${text} / 百万`;
}

export function formatLatency(ms: number) {
  const v = Number.isFinite(ms) && ms > 0 ? ms : 0;
  return `${(v / 1000).toFixed(1)}s`;
}

export function estimateCostUsd(
  model: PortalModel,
  promptTokens: number,
  completionTokens: number,
  cacheTokens = 0,
) {
  const inTok = Math.max(0, promptTokens);
  const outTok = Math.max(0, completionTokens);
  const cacheTok = Math.max(0, Math.min(cacheTokens, inTok));
  const fresh = inTok - cacheTok;
  return (
    (fresh / 1_000_000) * (model.inputPer1m || 0) +
    (cacheTok / 1_000_000) * (model.cacheHitPer1m || 0) +
    (outTok / 1_000_000) * (model.outputPer1m || 0)
  );
}

export function exportModelsCsv(models: PortalModel[]) {
  const header = [
    "model",
    "provider",
    "input_per_1m_usd",
    "output_per_1m_usd",
    "cache_hit_per_1m_usd",
    "latency_ms",
    "retired",
  ];
  const lines = [
    header.join(","),
    ...models.map((m) =>
      [
        csvCell(m.model),
        csvCell(m.providerLabel),
        m.inputPer1m ?? 0,
        m.outputPer1m ?? 0,
        m.cacheHitPer1m ?? 0,
        m.latencyMs ?? "",
        m.retired ? "1" : "0",
      ].join(","),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inkstudio-models-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
