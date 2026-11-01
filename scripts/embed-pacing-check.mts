import { embed } from "../src/lib/ai/openai";
const texts = Array.from({ length: 120 }, (_, i) => `chunk ${i} ` + "database transaction isolation level ".repeat(30)); // ~120 * 270 tokens ≈ 32k tokens
const t0 = Date.now();
const v = await embed(texts, (s) => console.log(`  waiting ${s}s for rate limit…`));
console.log(v.length, "vectors in", Math.round((Date.now() - t0) / 1000), "s");
