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

const MULTIMODAL_RE =
  /(?:vision|\bvl\b|vl-|[-_/]vl|image|omni|multimodal|audio|video|speech|tts|\b4o\b|pixtral|llava|idefics|gemini|nova|claude-3|qwen-vl|qwen2-vl|glm-4v|gpt-4o|gpt-4-turbo)/i;

export function detectModelFamily(name: string): ModelFamily {
  const n = name.toLowerCase();
  if (/^(gpt-|o[134]|chatgpt|text-davinci|gpt\d)/i.test(n) || /\bgpt[-_/]/i.test(n)) {
    return "gpt";
  }
  if (/deepseek/i.test(n)) return "deepseek";
  if (/qwen|tongyi|通义/i.test(n)) return "qwen";
  if (/claude|anthropic/i.test(n)) return "claude";
  if (/gemini|palm|bard/i.test(n)) return "gemini";
  if (/glm|zhipu|chatglm|zai-org/i.test(n)) return "glm";
  if (/kimi|moonshot|mimo/i.test(n)) return "kimi";
  if (/llama|meta-llama/i.test(n)) return "llama";
  if (/mistral|mixtral|codestral|pixtral/i.test(n)) return "mistral";
  return "other";
}

export function detectModelModality(name: string): Exclude<ModelModality, "all"> {
  const n = name.toLowerCase();
  if (/embed|embedding|rerank|moderation|whisper|tts|speech-/i.test(n)) {
    return /vision|vl|4o|gemini|image|omni|multimodal|audio|video/i.test(n)
      ? "multimodal"
      : "text";
  }
  if (MULTIMODAL_RE.test(n)) return "multimodal";
  return "text";
}

export function matchesFamily(name: string, family: ModelFamily) {
  if (family === "all") return true;
  return detectModelFamily(name) === family;
}

export function matchesModality(name: string, modality: ModelModality) {
  if (modality === "all") return true;
  return detectModelModality(name) === modality;
}
