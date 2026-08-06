import { Hono, type Context } from "hono";
import { stream } from "hono/streaming";
import { requireApiToken, assertModelAllowed, type AuthVars } from "../middleware/auth.js";
import { resolveChannelsForModel, joinUrl } from "../services/router.js";
import { writeLog } from "../services/stats.js";
import { db } from "../db/index.js";
import { channels } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { parseJsonArray } from "../utils/crypto.js";

export const v1Routes = new Hono<AuthVars>();

v1Routes.use("*", requireApiToken);

v1Routes.get("/models", async (c) => {
  const all = await db.select().from(channels).where(eq(channels.enabled, true));
  const set = new Set<string>();
  for (const ch of all) {
    for (const m of parseJsonArray(ch.models)) {
      if (m !== "*") set.add(m);
    }
  }
  const data = [...set].sort().map((id) => ({
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

v1Routes.all("/*", async (c) => {
  const sub = c.req.path.replace(/^\/v1/, "") || "/";
  return proxyOpenAI(c, `/v1${sub}`);
});

async function proxyOpenAI(c: Context<AuthVars>, upstreamPath: string) {
  const token = c.get("token");
  const started = Date.now();
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    undefined;

  let bodyText = "";
  let model = "unknown";
  let streamMode = false;

  try {
    bodyText = await c.req.text();
    if (bodyText) {
      const parsed = JSON.parse(bodyText) as {
        model?: string;
        stream?: boolean;
      };
      model = parsed.model ?? "unknown";
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
    });
    return c.json(
      { error: { message: `Model ${model} is not allowed for this key`, type: "permission_error" } },
      403,
    );
  }

  const resolved = await resolveChannelsForModel(model);
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
    });
    return c.json(
      { error: { message: `No channel available for model ${model}`, type: "not_found_error" } },
      404,
    );
  }

  // rewrite model if needed
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
        const ct = upstream.headers.get("content-type") ?? "text/event-stream";
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

        return stream(c, async (s) => {
          const decoder = new TextDecoder();
          let leftover = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                await s.write(value);
                leftover += decoder.decode(value, { stream: true });
                // try parse usage from stream chunks
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
          } finally {
            clearTimeout(timer);
            await writeLog({
              tokenId: token.id,
              channelId: channel.id,
              model,
              path: upstreamPath,
              method: c.req.method,
              statusCode: upstream.status,
              promptTokens: usageHint.prompt,
              completionTokens: usageHint.completion,
              totalTokens: usageHint.total || estimateTokens(bodyText),
              durationMs: Date.now() - started,
              ip,
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
          path: upstreamPath,
          method: c.req.method,
          statusCode: upstream.status,
          durationMs: Date.now() - started,
          ip,
          error: respText.slice(0, 500),
        });
        return c.body(respText, upstream.status as 400, {
          "Content-Type": upstream.headers.get("content-type") ?? "application/json",
          "X-StarConverge-Channel": channel.name,
        });
      }

      await writeLog({
        tokenId: token.id,
        channelId: channel.id,
        model,
        path: upstreamPath,
        method: c.req.method,
        statusCode: upstream.status,
        promptTokens: usageHint.prompt,
        completionTokens: usageHint.completion,
        totalTokens: usageHint.total || estimateTokens(bodyText),
        durationMs: Date.now() - started,
        ip,
      });

      return c.body(respText, upstream.status as 200, {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "X-StarConverge-Channel": channel.name,
      });
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
  }

  await writeLog({
    tokenId: token.id,
    model,
    path: upstreamPath,
    method: c.req.method,
    statusCode: 502,
    durationMs: Date.now() - started,
    ip,
    error: lastError,
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
