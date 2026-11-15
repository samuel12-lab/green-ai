// Green AI backend: a Cloudflare Worker that keeps the Anthropic API key
// server-side and streams Claude's reply back to the website as plain text.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 30; // messages kept from the conversation
const MAX_CHARS = 4000; // per message

const SYSTEM = `You are Green, the AI guide on a website about green technologies.

You help people understand and act on clean technology: solar and wind power, batteries and energy storage, electric vehicles and charging, heat pumps and efficient buildings, green hydrogen, carbon capture, the grid, recycling and the circular economy, sustainable agriculture, and the environmental footprint of computing and AI.

How to answer:
- Be warm, clear and practical. Lead with the direct answer, then the useful detail.
- Keep most replies under about 200 words unless the person asks for depth.
- Use short paragraphs, and bullet lists ("- ") when comparing options. Use **bold** sparingly.
- Give honest trade-offs, including costs, limits and open questions. Do not overstate what a technology can do.
- Numbers like prices, efficiencies and incentives change over time and by country; give ranges and say they vary, and suggest checking local sources for decisions.
- If a question is off-topic, answer briefly and kindly, and connect back to sustainability where it fits naturally.`;

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = allowed.includes("*") || allowed.includes(origin);
  const headers = {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] || "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  return { ok, headers };
}

function cleanMessages(input) {
  if (!Array.isArray(input)) return null;
  const msgs = input
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  // The conversation must start with a user turn and end with one.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const { ok: originAllowed, headers: cors } = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (url.pathname !== "/chat" || request.method !== "POST") {
      return new Response("Not found", { status: 404, headers: cors });
    }
    if (!originAllowed) {
      return new Response("Origin not allowed", { status: 403, headers: cors });
    }
    if (!env.ANTHROPIC_API_KEY) {
      return new Response("Server is missing ANTHROPIC_API_KEY", { status: 500, headers: cors });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: cors });
    }
    const messages = cleanMessages(body?.messages);
    if (!messages) {
      return new Response("Expected a messages array ending with a user message", {
        status: 400,
        headers: cors,
      });
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const claude = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 4000,
            system: SYSTEM,
            output_config: { effort: "low" }, // chat: fast, concise replies
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            messages,
          });
          for await (const event of claude) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          const final = await claude.finalMessage();
          if (final.stop_reason === "refusal") {
            controller.enqueue(
              encoder.encode("\n\nI can't help with that one, but I'm happy to talk green tech. 🌱"),
            );
          }
        } catch (err) {
          console.error("Claude request failed:", err?.status, err?.message);
          const msg =
            err instanceof Anthropic.RateLimitError
              ? "I'm getting a lot of questions right now. Please try again in a moment. 🌿"
              : "Lost my signal through the canopy 🍃 Please try again.";
          controller.enqueue(encoder.encode(msg));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...cors,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
