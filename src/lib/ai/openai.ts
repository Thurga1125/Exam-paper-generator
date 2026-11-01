import OpenAI from "openai";
import { z } from "zod";

let client: OpenAI | null = null;

export function openai(): OpenAI {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === "sk-..." || key.length < 20) {
    throw new AiConfigError(
      "OpenAI API key is missing. Put a real key in .env.local as OPENAI_API_KEY=sk-… (platform.openai.com/api-keys), then restart `npm run dev` and use “Replace file” on this item.",
    );
  }
  client ??= new OpenAI({ apiKey: key, baseURL: process.env.OPENAI_BASE_URL || undefined });
  return client;
}

export class AiConfigError extends Error {}

export const CHAT_MODEL = () => process.env.OPENAI_MODEL || "gpt-4.1";
export const EMBED_MODEL = () => process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

/**
 * Call the model and get back JSON validated against a zod schema, using
 * OpenAI Structured Outputs (strict JSON schema).
 */
export async function jsonCall<S extends z.ZodType>(opts: {
  name: string;
  schema: S;
  system: string;
  user: string;
}): Promise<z.infer<S>> {
  const jsonSchema = z.toJSONSchema(opts.schema) as Record<string, unknown>;
  delete jsonSchema.$schema;

  const res = await openai().chat.completions.create({
    model: CHAT_MODEL(),
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.name, strict: true, schema: jsonSchema },
    },
  });
  const choice = res.choices[0];
  if (choice.message.refusal) throw new Error(`The model declined the request: ${choice.message.refusal}`);
  if (choice.finish_reason === "length") throw new Error("The model response was cut off (too long). Try fewer questions per section.");
  const raw = choice.message.content;
  if (!raw) throw new Error("The model returned an empty response.");
  return opts.schema.parse(JSON.parse(raw));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const approxTokens = (t: string) => Math.ceil(t.length / 3); // deliberately conservative

/** Max embedding tokens per minute we allow ourselves (free tiers are often 30k/min). */
const TOKENS_PER_MIN = () => Number(process.env.EMBED_TOKENS_PER_MINUTE) || 24_000;

/** Seconds to wait suggested by a 429 error message ("retry in 19.6s"), if any. */
function retryAfterMs(e: unknown): number | null {
  const err = e as { status?: number; message?: string; headers?: Record<string, string> };
  if (err?.status !== 429) return null;
  const m = /retry in ([\d.]+)s/i.exec(err.message ?? "");
  const h = Number(err.headers?.["retry-after"]);
  return Math.ceil((m ? Number(m[1]) : Number.isFinite(h) && h > 0 ? h : 20) * 1000) + 1000;
}

/**
 * Embed texts; returns vectors in input order. Paces itself under the per-minute
 * token budget and waits/retries when the provider answers 429.
 */
export async function embed(texts: string[], onWait?: (seconds: number) => void): Promise<number[][]> {
  const out: number[][] = [];
  const sent: { at: number; tokens: number }[] = [];
  const budget = TOKENS_PER_MIN();
  let i = 0;
  while (i < texts.length) {
    // build a batch of up to ~budget/3 tokens
    const batch: string[] = [];
    let tokens = 0;
    while (i + batch.length < texts.length && batch.length < 64) {
      const t = texts[i + batch.length].slice(0, 8000);
      const n = approxTokens(t);
      if (batch.length && tokens + n > budget / 3) break;
      batch.push(t);
      tokens += n;
    }
    // wait until the last 60 s leave room for this batch
    for (;;) {
      const now = Date.now();
      while (sent.length && now - sent[0].at > 60_000) sent.shift();
      const used = sent.reduce((a, b) => a + b.tokens, 0);
      if (used + tokens <= budget || !sent.length) break;
      const wait = Math.max(1000, 60_000 - (now - sent[0].at) + 250);
      onWait?.(Math.ceil(wait / 1000));
      await sleep(wait);
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await openai().embeddings.create(
          { model: EMBED_MODEL(), input: batch, dimensions: 1536 }, // must match vector(1536)
          { maxRetries: 0 },
        );
        sent.push({ at: Date.now(), tokens });
        out.push(...res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
        break;
      } catch (e) {
        const wait = retryAfterMs(e);
        if (wait === null || attempt >= 6) throw e;
        onWait?.(Math.ceil(wait / 1000));
        await sleep(wait);
      }
    }
    i += batch.length;
  }
  return out;
}
