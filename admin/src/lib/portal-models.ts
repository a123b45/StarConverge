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

