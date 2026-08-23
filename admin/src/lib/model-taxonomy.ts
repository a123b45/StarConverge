export type ModelFamily =
  | "all"
  | "gpt"
  | "deepseek"
  | "qwen"
  | "claude"
  | "gemini"
  | "glm"
  | "kimi"
  | "llama"
  | "mistral"
  | "other";

export type ModelModality = "all" | "text" | "multimodal";

export const MODEL_FAMILIES: Array<{ id: ModelFamily; label: string }> = [
  { id: "all", label: "全部系列" },
  { id: "gpt", label: "GPT / OpenAI" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "qwen", label: "Qwen / 通义" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
  { id: "glm", label: "GLM / 智谱" },
  { id: "kimi", label: "Kimi / Moonshot" },
  { id: "llama", label: "Llama / Meta" },
  { id: "mistral", label: "Mistral" },
  { id: "other", label: "其他" },
];

export const MODEL_MODALITIES: Array<{ id: ModelModality; label: string }> = [
  { id: "all", label: "全部能力" },
  { id: "text", label: "纯文本" },
  { id: "multimodal", label: "多模态" },
];

function norm(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Tools / audio-only — not chat models that accept images. */
const TEXT_TOOL_RE =
  /embed(?:ding)?|rerank|moderation|whisper|(?:^|[-_/])tts(?:[-_/]|$)|speech-to|[-_/]asr(?:[-_/]|$)|dall-e|imagen|tts-1/;

/**
 * Explicit vision / omni markers in the model id.
 * Avoids loose words like tts, audio, nova, gemini.
 */
const VISION_MARKER_RE =
  /(?:^|[-_/.])(?:vision|vlm|omni)(?:[-_/.]|$)|(?:^|[-_/.])vl(?:[-_/.]|$)|[-_/]vl\d|[-_]vl\b|\bvl[-_]|multimodal|pixtral|llava|idefics|cogvlm|\bqvq\b|gpt-4o|chatgpt-4o|\b4o(?:[-_.]|$)|glm-4v|glm4v|[-_]4v(?:[-_.]|$)|qwen-vl|qwen2-vl|qwen2\.5-vl|qwen2-5-vl|qwen3-vl|janus|gpt-4-vision|gpt-4\.1|gpt-4-turbo/;

export function detectModelFamily(name: string): ModelFamily {
  const n = norm(name);
  if (/^(gpt-|o[134]|chatgpt|text-davinci|gpt\d)/.test(n) || /\bgpt[-_/]/.test(n)) {
    return "gpt";
  }
  if (/deepseek/.test(n)) return "deepseek";
  if (/qwen|tongyi|通义/.test(n)) return "qwen";
  if (/claude|anthropic/.test(n)) return "claude";
  if (/gemini|palm|bard/.test(n)) return "gemini";
  if (/glm|zhipu|chatglm|zai-org/.test(n)) return "glm";
  if (/kimi|moonshot|mimo/.test(n)) return "kimi";
  if (/llama|meta-llama/.test(n)) return "llama";
  if (/mistral|mixtral|codestral|pixtral/.test(n)) return "mistral";
  return "other";
}

function hasVisionMarker(n: string): boolean {
  return VISION_MARKER_RE.test(n);
}

/** Claude 3 and later accept images. Claude 1 / 2 / Instant do not. */
function isClaudeMultimodal(n: string): boolean {
  if (/claude[-_.]?(?:instant|[12])(?:[-_.]|$)/.test(n)) return false;
  return /claude|anthropic/.test(n);
}

/**
 * GPT-4o / 4.1 / 4-turbo / GPT-5 / o3(not mini) / o4 accept images.
 * Original GPT-4, 3.5, o1, o3-mini are text.
 */
function isGptMultimodal(n: string): boolean {
  if (/gpt-3\.5|gpt-35/.test(n)) return false;
  if (/\bo1(?:[-_.]|$)/.test(n)) return false;
  if (/\bo3-mini/.test(n)) return false;
  if (/gpt-4o|chatgpt-4o|\b4o(?:[-_.]|$)/.test(n)) return true;
  if (/gpt-4\.1|gpt-4-1/.test(n)) return true;
  if (/gpt-4-turbo|gpt-4-vision/.test(n)) return true;
  if (/gpt-5/.test(n)) return true;
  if (/\bo3(?:[-_.]|$)/.test(n) || /\bo4/.test(n)) return true;
  return false;
}

/** Gemini 1.5+ and 2.x/3.x are multimodal. Gemini 1.0 without vision is text. */
function isGeminiMultimodal(n: string): boolean {
  if (/gemini[-_.]?1(?:\.0)?(?:[-_.]|$)/.test(n) && !/vision|1\.5/.test(n)) {
    return false;
  }
  return /gemini/.test(n);
}

function isLlamaMultimodal(n: string): boolean {
  return /llama-4|llama4|llama-3\.2-vision|llama3\.2-vision/.test(n);
}

function isKimiMultimodal(n: string): boolean {
  return /k1\.5|kimi-1\.5|vision|\bvl\b/.test(n);
}

function isNovaMultimodal(n: string): boolean {
  if (/nova-micro/.test(n)) return false;
  return /nova-(?:lite|pro|premier)/.test(n);
}

/**
 * Whether the model accepts image (or omni) input.
 * Judged from the model id: explicit vision markers first, then family rules.
 * Default is text — TTS / embed / unnamed MiniMax stay text.
 */
export function detectModelModality(name: string): Exclude<ModelModality, "all"> {
  const n = norm(name);
  if (!n) return "text";
  if (TEXT_TOOL_RE.test(n) && !hasVisionMarker(n)) return "text";
  if (hasVisionMarker(n)) return "multimodal";

  const family = detectModelFamily(n);
  if (family === "claude") return isClaudeMultimodal(n) ? "multimodal" : "text";
  if (family === "gpt") return isGptMultimodal(n) ? "multimodal" : "text";
  if (family === "gemini") return isGeminiMultimodal(n) ? "multimodal" : "text";
  if (family === "llama") return isLlamaMultimodal(n) ? "multimodal" : "text";
  if (family === "kimi") return isKimiMultimodal(n) ? "multimodal" : "text";
  if (isNovaMultimodal(n)) return "multimodal";
  return "text";
}

export function detectModelModalityFromNames(
  ...names: Array<string | null | undefined>
): Exclude<ModelModality, "all"> {
  for (const name of names) {
    if (name && detectModelModality(name) === "multimodal") return "multimodal";
  }
  return "text";
}

export function matchesFamily(name: string, family: ModelFamily) {
  if (family === "all") return true;
  return detectModelFamily(name) === family;
}

export function matchesModality(
  name: string,
  modality: ModelModality,
  extraNames: Array<string | null | undefined> = [],
) {
  if (modality === "all") return true;
  return detectModelModalityFromNames(name, ...extraNames) === modality;
}
