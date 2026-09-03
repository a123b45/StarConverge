import { Hono, type Context } from "hono";
import { stream } from "hono/streaming";
import { requireApiToken, assertModelAllowed, type AuthVars } from "../middleware/auth.js";
import { resolveChannelsForModel, joinUrl } from "../services/router.js";
import { writeLog } from "../services/stats.js";
import { assertPortalBalance } from "../services/billing.js";
import {
  countMessages,
  extractRequestPreview,
  extractResponsePreview,
} from "../services/upstream-models.js";
import { db } from "../db/index.js";
import { channels, modelRoutes } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { parseJsonArray } from "../utils/crypto.js";
import { getRequestClientIp } from "../utils/client-ip.js";
import {
  anthropicToOpenAIBody,
  openAIChunkToAnthropicSse,
  openAIToAnthropicMessage,
  type AnthropicMessageReq,
} from "../services/anthropic-compat.js";

export const v1Routes = new Hono<AuthVars>();

v1Routes.use("*", requireApiToken);

v1Routes.get("/models", async (c) => {
  const token = c.get("token");
  const routes = await db
    .select()
    .from(modelRoutes)
    .where(and(eq(modelRoutes.enabled, true), eq(modelRoutes.published, true)));
  const chRows = await db.select().from(channels).where(eq(channels.enabled, true));
  const enabledIds = new Set(chRows.map((ch) => ch.id));

  const set = new Set<string>();
  for (const r of routes) {
    const ids = parseJsonArray(r.channelIds);
    if (ids.some((cid) => enabledIds.has(cid))) set.add(r.model);
  }

  const allowed = parseJsonArray(token.allowedModels);
  let ids = [...set].sort();
  if (allowed.length > 0) {
    const allow = new Set(allowed);
    ids = ids.filter((m) => allow.has(m));
  }
  const data = ids.map((id) => ({
    id,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "starconverge",
  }));
  return c.json({ object: "list", data });
});

v1Routes.post("/chat/completions", async (c) => {
  return proxyOpenAI(c, "/v1/chat/completions");
});

v1Routes.post("/completions", async (c) => {
  return proxyOpenAI(c, "/v1/completions");
});

v1Routes.post("/embeddings", async (c) => {
  return proxyOpenAI(c, "/v1/embeddings");
});

v1Routes.post("/messages", async (c) => {
  return proxyAnthropicMessages(c);
});

v1Routes.all("/*", async (c) => {
  const sub = c.req.path.replace(/^\/v1/, "") || "/";
  return proxyOpenAI(c, `/v1${sub}`);
});

async function proxyAnthropicMessages(c: Context<AuthVars>) {
  let raw = "";
  try {
    raw = await c.req.text();
  } catch {
    return c.json(
      { type: "error", error: { type: "invalid_request_error", message: "Invalid JSON body" } },
      400,
    );
  }
  let req: AnthropicMessageReq;
  try {
    req = JSON.parse(raw || "{}") as AnthropicMessageReq;
  } catch {
    return c.json(
      { type: "error", error: { type: "invalid_request_error", message: "Invalid JSON body" } },
      400,
    );
  }
  if (!req.model) {
    return c.json(
      { type: "error", error: { type: "invalid_request_error", message: "model is required" } },
      400,
    );
  }
  return proxyOpenAI(c, "/v1/chat/completions", {
    bodyText: JSON.stringify(anthropicToOpenAIBody(req)),
    anthropic: true,
    clientModel: req.model,
  });
}

async function proxyOpenAI(
  c: Context<AuthVars>,
  upstreamPath: string,
  opts?: { bodyText?: string; anthropic?: boolean; clientModel?: string },
) {
  const token = c.get("token");
  const started = Date.now();
  const ip = getRequestClientIp(c);

  let bodyText = opts?.bodyText ?? "";
  let model = opts?.clientModel ?? "unknown";
  let streamMode = false;

  try {
    if (!bodyText) bodyText = await c.req.text();
    if (bodyText) {
      const parsed = JSON.parse(bodyText) as {
        model?: string;
        stream?: boolean;
      };
      model = opts?.clientModel ?? parsed.model ?? "unknown";
      streamMode = Boolean(parsed.stream);
    }
  } catch {
    return c.json(
      { error: { message: "Invalid JSON body", type: "invalid_request_error" } },
      400,
    );
  }

  if (model === "unknown" || !model) {
    return c.json(
      { error: { message: "model is required", type: "invalid_request_error" } },
      400,
    );
  }

  const billed = await assertPortalBalance(token);
  if (!billed.ok) {
    return c.json(billed.body, billed.status);
  }

  const reqPreview = extractRequestPreview(bodyText);
  const msgCount = countMessages(bodyText);

  if (!assertModelAllowed(token, model)) {
    await writeLog({
      tokenId: token.id,
      model,
      path: upstreamPath,
      method: c.req.method,
      statusCode: 403,
      ip,
      error: "model not allowed",
      durationMs: Date.now() - started,
      requestPreview: reqPreview,
      messageCount: msgCount,
    });
    return c.json(
      { error: { message: `Model ${model} is not allowed for this key`, type: "permission_error" } },
      403,
    );
  }

  const resolved = await resolveChannelsForModel(model, {
    boundRouteIds: parseJsonArray(token.routeIds ?? "[]"),
    bodyText,
  });
  if (!resolved || resolved.candidates.length === 0) {
    await writeLog({
      tokenId: token.id,
      model,
      path: upstreamPath,
      method: c.req.method,
      statusCode: 404,
      ip,
      error: "no channel",
      durationMs: Date.now() - started,
      requestPreview: reqPreview,
      messageCount: msgCount,
    });
    return c.json(
      { error: { message: `No channel available for model ${model}`, type: "not_found_error" } },
      404,
    );
  }

  // Rewrite upstream body model when bound route / rewriteModel differs; client still sees `model`.
  let outboundBody = bodyText;
  if (resolved.upstreamModel !== model && bodyText) {
    try {
      const obj = JSON.parse(bodyText) as Record<string, unknown>;
      obj.model = resolved.upstreamModel;
      outboundBody = JSON.stringify(obj);
    } catch {
      /* keep original */
    }
  }

  if (resolved.bound) {
    c.header("X-StarConverge-Bound-Route", resolved.upstreamModel);
  }

  let lastError = "all channels failed";
  for (const channel of resolved.candidates) {
    const url = joinUrl(channel.baseUrl, upstreamPath);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), channel.timeoutMs);
    try {
      const headers = new Headers();
      headers.set("Authorization", `Bearer ${channel.apiKey}`);
      headers.set("Content-Type", "application/json");
      const accept = c.req.header("Accept");
      if (accept) headers.set("Accept", accept);

      const upstream = await fetch(url, {
        method: c.req.method,
        headers,
        body: ["GET", "HEAD"].includes(c.req.method) ? undefined : outboundBody,
        signal: controller.signal,
      });

      const usageHint = { prompt: 0, completion: 0, total: 0 };

      if (streamMode && upstream.ok) {
        const ct = opts?.anthropic
          ? "text/event-stream; charset=utf-8"
          : (upstream.headers.get("content-type") ?? "text/event-stream");
        c.header("Content-Type", ct);
        c.header("Cache-Control", "no-cache");
        c.header("X-StarConverge-Channel", channel.name);
        c.status(upstream.status as 200);

        const reader = upstream.body?.getReader();
        if (!reader) {
          clearTimeout(timer);
          lastError = "empty stream";
          continue;
        }

        const anthState = { started: false, id: "", model };
        return stream(c, async (s) => {
          const decoder = new TextDecoder();
          let leftover = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                leftover += decoder.decode(value, { stream: true });
                if (opts?.anthropic) {
                  const lines = leftover.split("\n");
                  leftover = lines.pop() ?? "";
                  for (const line of lines) {
                    if (!line.startsWith("data:")) continue;
                    const data = line.slice(5).trim();
                    if (!data) continue;
                    for (const ev of openAIChunkToAnthropicSse(data, anthState)) {
                      await s.write(ev);
                    }
                    if (data !== "[DONE]") {
                      try {
                        const json = JSON.parse(data) as {
                          usage?: {
                            prompt_tokens?: number;
                            completion_tokens?: number;
                            total_tokens?: number;
                          };
                        };
                        if (json.usage) {
                          usageHint.prompt = json.usage.prompt_tokens ?? usageHint.prompt;
                          usageHint.completion =
                            json.usage.completion_tokens ?? usageHint.completion;
                          usageHint.total = json.usage.total_tokens ?? usageHint.total;
                        }
                      } catch {
                        /* ignore */
                      }
                    }
                  }
                } else {
                  await s.write(value);
                  for (const line of leftover.split("\n")) {
                    if (!line.startsWith("data:")) continue;
                    const data = line.slice(5).trim();
                    if (!data || data === "[DONE]") continue;
                    try {
                      const json = JSON.parse(data) as {
                        usage?: {
                          prompt_tokens?: number;
                          completion_tokens?: number;
                          total_tokens?: number;
                        };
                      };
                      if (json.usage) {
                        usageHint.prompt = json.usage.prompt_tokens ?? usageHint.prompt;
                        usageHint.completion =
                          json.usage.completion_tokens ?? usageHint.completion;
                        usageHint.total = json.usage.total_tokens ?? usageHint.total;
                      }
                    } catch {
                      /* ignore */
                    }
                  }
                  if (leftover.length > 64_000) leftover = leftover.slice(-8_000);
                }
              }
            }
            if (opts?.anthropic) {
              leftover += decoder.decode();
              for (const line of leftover.split("\n")) {
                if (!line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                if (!data) continue;
                for (const ev of openAIChunkToAnthropicSse(data, anthState)) {
                  await s.write(ev);
                }
              }
              if (anthState.started) {
                for (const ev of openAIChunkToAnthropicSse("[DONE]", anthState)) {
                  await s.write(ev);
                }
              }
            }
          } finally {
            clearTimeout(timer);
            await writeLog({
              tokenId: token.id,
              channelId: channel.id,
              model,
              upstreamModel: resolved.upstreamModel,
              path: opts?.anthropic ? "/v1/messages" : upstreamPath,
              method: c.req.method,
              statusCode: upstream.status,
              promptTokens: usageHint.prompt,
              completionTokens: usageHint.completion,
              totalTokens: usageHint.total || estimateTokens(bodyText),
              durationMs: Date.now() - started,
              ip,
              requestPreview: reqPreview,
              responsePreview: extractStreamPreview(leftover),
              messageCount: msgCount,
            });
          }
        });
      }

      const respText = await upstream.text();
      clearTimeout(timer);

      try {
        const json = JSON.parse(respText) as {
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        };
        if (json.usage) {
          usageHint.prompt = json.usage.prompt_tokens ?? 0;
          usageHint.completion = json.usage.completion_tokens ?? 0;
          usageHint.total = json.usage.total_tokens ?? 0;
        }
      } catch {
        /* non-json */
      }

      if (!upstream.ok) {
        lastError = `channel ${channel.name}: ${upstream.status}`;
        // try next channel on 5xx
        if (upstream.status >= 500) continue;
        await writeLog({
          tokenId: token.id,
          channelId: channel.id,
          model,
          upstreamModel: resolved.upstreamModel,
          path: upstreamPath,
          method: c.req.method,
          statusCode: upstream.status,
          durationMs: Date.now() - started,
          ip,
          error: respText.slice(0, 500),
          requestPreview: reqPreview,
          responsePreview: respText.slice(0, 800),
          messageCount: msgCount,
        });
        return c.body(
          encodeClientBody(respText, model, resolved.upstreamModel, opts?.anthropic),
          upstream.status as 400,
          {
          "Content-Type": upstream.headers.get("content-type") ?? "application/json",
          "X-StarConverge-Channel": channel.name,
          },
        );
      }

      await writeLog({
        tokenId: token.id,
        channelId: channel.id,
        model,
        upstreamModel: resolved.upstreamModel,
        path: opts?.anthropic ? "/v1/messages" : upstreamPath,
        method: c.req.method,
        statusCode: upstream.status,
        promptTokens: usageHint.prompt,
        completionTokens: usageHint.completion,
        totalTokens: usageHint.total || estimateTokens(bodyText),
        durationMs: Date.now() - started,
        ip,
        requestPreview: reqPreview,
        responsePreview: extractResponsePreview(respText),
        messageCount: msgCount,
      });

      return c.body(
        encodeClientBody(respText, model, resolved.upstreamModel, opts?.anthropic),
        upstream.status as 200,
        {
        "Content-Type": "application/json",
        "X-StarConverge-Channel": channel.name,
        },
      );
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
  }

  await writeLog({
    tokenId: token.id,
    model,
    upstreamModel: resolved.upstreamModel,
    path: upstreamPath,
    method: c.req.method,
    statusCode: 502,
    durationMs: Date.now() - started,
    ip,
    error: lastError,
    requestPreview: reqPreview,
    messageCount: msgCount,
  });
  return c.json(
    { error: { message: `Upstream failed: ${lastError}`, type: "api_error" } },
    502,
  );
}

function estimateTokens(text: string): number {
  // rough fallback when upstream omits usage
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Keep client-facing model id when a bound route rewrote the upstream name. */
function restoreClientModel(
  respText: string,
  clientModel: string,
  upstreamModel: string,
): string {
  if (!respText || clientModel === upstreamModel) return respText;
  try {
    const json = JSON.parse(respText) as Record<string, unknown>;
    if (json && typeof json === "object" && typeof json.model === "string") {
      json.model = clientModel;
      return JSON.stringify(json);
    }
  } catch {
    /* non-json */
  }
  return respText;
}

function encodeClientBody(
  respText: string,
  clientModel: string,
  upstreamModel: string,
  anthropic?: boolean,
): string {
  const restored = restoreClientModel(respText, clientModel, upstreamModel);
  if (!anthropic) return restored;
  try {
    const json = JSON.parse(restored) as Record<string, unknown>;
    if (json.error) {
      const msg =
        json.error && typeof json.error === "object" && "message" in json.error
          ? String((json.error as { message?: string }).message ?? "error")
          : String(json.error);
      return JSON.stringify({
        type: "error",
        error: { type: "api_error", message: msg },
      });
    }
    return JSON.stringify(openAIToAnthropicMessage(json, clientModel));
  } catch {
    return restored;
  }
}

function extractStreamPreview(sseText: string, max = 4000): string {
  let out = "";
  for (const line of sseText.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const json = JSON.parse(data) as {
        choices?: Array<{
          delta?: { content?: string };
          message?: { content?: string };
        }>;
      };
      const piece =
        json.choices?.[0]?.delta?.content ??
        json.choices?.[0]?.message?.content ??
        "";
      if (piece) out += piece;
      if (out.length >= max) break;
    } catch {
      /* ignore */
    }
  }
  return out.slice(0, max);
}
