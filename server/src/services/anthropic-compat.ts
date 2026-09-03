/** Translate Anthropic Messages API <-> OpenAI Chat Completions. */

type AnthropicContent =
  | string
  | Array<{
      type?: string;
      text?: string;
      source?: { type?: string; media_type?: string; data?: string; url?: string };
    }>;

export type AnthropicMessageReq = {
  model?: string;
  messages?: Array<{ role?: string; content?: AnthropicContent }>;
  system?: string | Array<{ type?: string; text?: string }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop_sequences?: string[];
};

type OpenAIMsg = {
  role: string;
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

function systemText(system: AnthropicMessageReq["system"]): string {
  if (!system) return "";
  if (typeof system === "string") return system;
  return system
    .map((b) => (typeof b?.text === "string" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
}

function toOpenAIContent(content: AnthropicContent | undefined): OpenAIMsg["content"] {
  if (content == null) return "";
  if (typeof content === "string") return content;
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];
  for (const block of content) {
    if (!block) continue;
    if (block.type === "text" || (block.text && !block.source)) {
      if (block.text) parts.push({ type: "text", text: block.text });
      continue;
    }
    const src = block.source;
    if (!src) continue;
    if (src.type === "url" && src.url) {
      parts.push({ type: "image_url", image_url: { url: src.url } });
      continue;
    }
    if (src.data) {
      const mime = src.media_type || "image/png";
      parts.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${src.data}` },
      });
    }
  }
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
  if (!parts.length) return "";
  return parts;
}

export function anthropicToOpenAIBody(req: AnthropicMessageReq): Record<string, unknown> {
  const messages: OpenAIMsg[] = [];
  const sys = systemText(req.system);
  if (sys) messages.push({ role: "system", content: sys });
  for (const m of req.messages ?? []) {
    const role = m.role === "assistant" ? "assistant" : "user";
    messages.push({ role, content: toOpenAIContent(m.content) });
  }
  const body: Record<string, unknown> = {
    model: req.model,
    messages,
    stream: Boolean(req.stream),
  };
  if (req.max_tokens != null) body.max_tokens = req.max_tokens;
  if (req.temperature != null) body.temperature = req.temperature;
  if (req.top_p != null) body.top_p = req.top_p;
  if (req.stop_sequences?.length) body.stop = req.stop_sequences;
  return body;
}

function openAIText(json: {
  choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}): { text: string; stop: string; usage: { input_tokens: number; output_tokens: number } } {
  const raw = json.choices?.[0]?.message?.content;
  let text = "";
  if (typeof raw === "string") text = raw;
  else if (Array.isArray(raw)) {
    text = raw
      .map((b) =>
        b && typeof b === "object" && "text" in b ? String((b as { text?: string }).text ?? "") : "",
      )
      .join("");
  }
  const finish = json.choices?.[0]?.finish_reason;
  const stop =
    finish === "length"
      ? "max_tokens"
      : finish === "stop" || !finish
        ? "end_turn"
        : finish;
  return {
    text,
    stop,
    usage: {
      input_tokens: json.usage?.prompt_tokens ?? 0,
      output_tokens: json.usage?.completion_tokens ?? 0,
    },
  };
}

export function openAIToAnthropicMessage(
  json: Record<string, unknown>,
  clientModel: string,
): Record<string, unknown> {
  const parsed = openAIText(
    json as {
      choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    },
  );
  const id =
    typeof json.id === "string" ? String(json.id).replace(/^chatcmpl/, "msg") : `msg_${Date.now()}`;
  return {
    id,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: parsed.text }],
    model: clientModel,
    stop_reason: parsed.stop,
    stop_sequence: null,
    usage: parsed.usage,
  };
}

export function openAIChunkToAnthropicSse(
  dataLine: string,
  state: { started: boolean; id: string; model: string; stopped?: boolean },
): string[] {
  const events: string[] = [];
  if (dataLine === "[DONE]") {
    if (state.started && !state.stopped) {
      state.stopped = true;
      events.push(sse("content_block_stop", { type: "content_block_stop", index: 0 }));
      events.push(
        sse("message_delta", {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 0 },
        }),
      );
      events.push(sse("message_stop", { type: "message_stop" }));
    }
    return events;
  }
  let json: {
    id?: string;
    model?: string;
    choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    json = JSON.parse(dataLine) as typeof json;
  } catch {
    return events;
  }
  if (!state.started) {
    state.started = true;
    state.id = (json.id || `msg_${Date.now()}`).replace(/^chatcmpl/, "msg");
    if (json.model) state.model = json.model;
    events.push(
      sse("message_start", {
        type: "message_start",
        message: {
          id: state.id,
          type: "message",
          role: "assistant",
          content: [],
          model: state.model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: json.usage?.prompt_tokens ?? 0, output_tokens: 0 },
        },
      }),
    );
    events.push(
      sse("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
    );
  }
  const piece = json.choices?.[0]?.delta?.content;
  if (piece) {
    events.push(
      sse("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: piece },
      }),
    );
  }
  return events;
}

function sse(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}
