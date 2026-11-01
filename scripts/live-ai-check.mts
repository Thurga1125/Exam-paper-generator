import { z } from "zod";
import { jsonCall, embed } from "../src/lib/ai/openai";
import { GenQuestionSchema, EXAMINER_SYSTEM } from "../src/lib/ai/generate";
const out = await jsonCall({
  name: "section_questions",
  schema: z.object({ questions: z.array(GenQuestionSchema) }),
  system: EXAMINER_SYSTEM,
  user: 'Blueprint: [{"index":1,"marks":10,"parts":[{"label":"(a)","marks":4},{"label":"(b)","marks":6}],"targetDifficulty":"medium","questionType":"theory"}]\n\nSOURCE EXCERPTS\n[S1] (Notes)\nA transaction has four ACID properties: atomicity, consistency, isolation and durability. Atomicity means all operations succeed or none do.',
});
console.log(JSON.stringify(out, null, 1).slice(0, 900));
console.log("embed dims:", (await embed(["x"]))[0].length);
