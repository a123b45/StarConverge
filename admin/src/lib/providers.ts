export type Provider = {
  id: string;
  name: string;
  desc: string;
  baseUrl: string;
  modelsHint: string;
  category: "llm" | "gateway";
};

/** 市面常见 OpenAI 兼容上游预设 */
export const PROVIDERS: Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    desc: "GPT-4o / o 系列等官方接口",
    baseUrl: "https://api.openai.com/v1",
    modelsHint: "gpt-4o-mini, gpt-4o, o3-mini",
    category: "llm",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    desc: "Claude 官方（需兼容网关或中转 Base URL）",
    baseUrl: "https://api.anthropic.com/v1",
    modelsHint: "claude-sonnet-4-5, claude-opus-4",
    category: "llm",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    desc: "Gemini OpenAI 兼容端点",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    modelsHint: "gemini-2.5-flash, gemini-2.5-pro",
    category: "llm",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    desc: "深度求索官方兼容接口",
    baseUrl: "https://api.deepseek.com/v1",
    modelsHint: "deepseek-chat, deepseek-reasoner",
    category: "llm",
  },
  {
    id: "moonshot",
    name: "Moonshot / Kimi",
    desc: "月之暗面 Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    modelsHint: "moonshot-v1-8k, moonshot-v1-128k, kimi-k2",
    category: "llm",
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    desc: "BigModel 开放平台",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    modelsHint: "glm-4-flash, glm-4.5, glm-4.6",
    category: "llm",
  },
  {
    id: "qwen",
    name: "通义千问 Qwen",
    desc: "阿里云 DashScope 兼容模式",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelsHint: "qwen-plus, qwen-max, qwen-turbo",
    category: "llm",
  },
  {
    id: "siliconflow",
    name: "SiliconFlow 硅基流动",
    desc: "多模型聚合，OpenAI 兼容",
    baseUrl: "https://api.siliconflow.cn/v1",
    modelsHint: "deepseek-ai/DeepSeek-V3, Qwen/Qwen2.5-72B-Instruct",
    category: "gateway",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    desc: "多厂商聚合网关",
    baseUrl: "https://openrouter.ai/api/v1",
    modelsHint: "openai/gpt-4o-mini, anthropic/claude-sonnet-4",
    category: "gateway",
  },
  {
    id: "custom",
    name: "自定义 / 其他中转",
    desc: "任意 OpenAI 兼容 Base URL",
    baseUrl: "",
    modelsHint: "按上游文档填写模型名，逗号分隔；* 表示全部",
    category: "gateway",
  },
];

export function providerById(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1]!;
}

export function providerLabel(id: string): string {
  return providerById(id).name;
}
