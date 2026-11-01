import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { z } from "zod";
import { extractText } from "../src/lib/ingest/extract";
import { chunkText } from "../src/lib/ingest/chunk";
import { GenQuestionSchema, planDifficulty, validateGenerated } from "../src/lib/ai/generate";
import { buildPastIndex, overlapWithPast } from "../src/lib/ai/context";
import { PatternAnalysisSchema, StructureSchema, MarkingSchemeSchema, sectionMarks, structureTotal } from "../src/lib/schemas";
import { newSection, fitStructureToTotal } from "../src/lib/structure";
import { parseMath, mathToPlain } from "../src/lib/richtext";

// 1. strict-mode compatibility of every JSON schema sent to OpenAI
const BAD = new Set(["$schema", "default", "format", "minimum", "maximum", "minLength", "maxLength", "pattern", "propertyNames", "minItems", "maxItems", "anyOf", "oneOf", "allOf", "$ref", "$defs"]);
function walk(n: unknown, path: string, problems: string[]) {
  if (Array.isArray(n)) return n.forEach((x, i) => walk(x, `${path}[${i}]`, problems));
  if (n && typeof n === "object") {
    const o = n as Record<string, unknown>;
    if (o.type === "object") {
      if (o.additionalProperties !== false) problems.push(`${path}: additionalProperties not false`);
      const props = Object.keys((o.properties as object) ?? {});
      const req = (o.required as string[]) ?? [];
      if (props.some((p) => !req.includes(p))) problems.push(`${path}: not all properties required`);
    }
    for (const [k, v] of Object.entries(o)) {
      if (k !== "properties" && BAD.has(k)) problems.push(`${path}: keyword ${k}`);
      walk(v, `${path}.${k}`, problems);
    }
  }
}
const gen = z.object({ questions: z.array(GenQuestionSchema) });
for (const [name, schema] of Object.entries({ gen, PatternAnalysisSchema, StructureSchema, MarkingSchemeSchema, check: z.object({ v: z.enum(["a", "b"]), n: z.array(z.string()), b: z.boolean() }) })) {
  const js = z.toJSONSchema(schema as z.ZodType) as Record<string, unknown>;
  delete js.$schema; // jsonCall() strips this too
  const p: string[] = [];
  walk(js, name, p);
  console.log(name, p.length ? p : "strict-ok");
  assert.equal(p.length, 0);
}

// 2. extraction
const docx = await extractText(readFileSync(process.argv[2]), "x.docx");
assert.match(docx, /Database Management Systems/);
const zip = new JSZip();
zip.file("ppt/slides/slide1.xml", '<p:sld><a:p><a:r><a:t>Normalisation &amp; keys</a:t></a:r></a:p><a:p><a:r><a:t>Second line</a:t></a:r></a:p></p:sld>');
zip.file("ppt/slides/slide2.xml", '<p:sld><a:p><a:r><a:t>Slide two</a:t></a:r></a:p></p:sld>');
const pptx = await extractText(Buffer.from(await zip.generateAsync({ type: "nodebuffer" })), "x.pptx");
assert.match(pptx, /\[Slide 1\]\nNormalisation & keys\nSecond line/);
assert.match(pptx, /\[Slide 2\]/);
assert.equal(await extractText(Buffer.from("hello\r\n\r\n\r\n\r\nworld"), "a.txt"), "hello\n\nworld");
await assert.rejects(() => extractText(Buffer.from("x"), "a.exe"), /Unsupported/);
if (process.argv[3]) {
  const t = await extractText(readFileSync(process.argv[3]), "a.pdf");
  console.log("pdf chars:", t.length, JSON.stringify(t.slice(0, 80)));
  assert.ok(t.length > 50);
}

// 3. chunking
const long = Array.from({ length: 60 }, (_, i) => `Paragraph ${i}. ` + "Lorem ipsum dolor sit amet. ".repeat(12)).join("\n\n");
const chunks = chunkText(long);
assert.ok(chunks.length > 5 && chunks.every((c) => c.length < 2000), "chunk sizes");
assert.equal(chunkText("short").length, 1);

// 4. difficulty planning
const d = planDifficulty(10, { easy: 30, medium: 50, hard: 20 }, "mixed");
assert.deepEqual([d.filter((x) => x === "easy").length, d.filter((x) => x === "medium").length, d.filter((x) => x === "hard").length], [3, 5, 2]);
assert.ok(new Set(d.slice(0, 3)).size > 1, "interleaved");
assert.deepEqual(planDifficulty(3, { easy: 1, medium: 1, hard: 1 }, "hard"), ["hard", "hard", "hard"]);

// 5. marks validation
const bp = [{ index: 1, marks: 10, parts: [{ label: "(a)", marks: 4 }, { label: "(b)", marks: 6 }], targetDifficulty: "easy" as const, questionType: "x" }, { index: 2, marks: 5, parts: [], targetDifficulty: "easy" as const, questionType: "x" }];
const q = (marks: number, parts: { text: string; marks: number; parts: { text: string; marks: number }[] }[]) => ({ text: "t", marks, type: "t", difficulty: "easy" as const, topic: "t", parts, supported: true, sourceNote: "" });
assert.deepEqual(validateGenerated([q(0, [{ text: "a", marks: 4, parts: [] }, { text: "b", marks: 6, parts: [] }]), q(5, [])], bp), []);
assert.equal(validateGenerated([q(0, [{ text: "a", marks: 4, parts: [] }, { text: "b", marks: 5, parts: [] }]), q(5, [])], bp).length, 1);
assert.equal(validateGenerated([q(0, [{ text: "a", marks: 4, parts: [] }, { text: "b", marks: 6, parts: [] }])], bp).length, 1);

// 6. originality check
const idx = buildPastIndex(["Explain the four properties of a transaction in a database management system and give one example for each property."]);
assert.ok(overlapWithPast("Explain the four properties of a transaction in a database management system and give an example", idx) > 0.5);
assert.ok(overlapWithPast("Design an ER diagram for a hospital appointment system with doctors and patients", idx) < 0.1);

// 7. structure totals incl. choose-N + compulsory
assert.equal(sectionMarks([20, 20, 20, 20], [true, true, true, true], "choose", 2), 40);
assert.equal(sectionMarks([30, 20, 20, 20], [false, true, true, true], "choose", 3), 70);
const st = { name: "s", durationMinutes: 60, totalMarks: 0, instructions: [], sections: [newSection("A", 4, 25)] };
assert.equal(structureTotal(st), 100);

// 7b. auto-fit marks
const zero = { name: "z", durationMinutes: 60, totalMarks: 0, instructions: [], sections: [newSection("A", 3, 0), newSection("B", 4, 0)] };
assert.equal(structureTotal(fitStructureToTotal(zero, 100)), 100);
assert.equal(structureTotal(fitStructureToTotal(st, 70)), 70);
const choose = { ...st, sections: [{ ...newSection("A", 5, 10), rule: "choose" as const, chooseCount: 3 }] };
assert.equal(structureTotal(fitStructureToTotal(choose, 90)), 90);

// 7c. localisation + legacy-font plumbing (fake converter: wraps text in ⟦⟧ so we can see what was converted)
import { formatDuration, examTypeLabel, sectionTitle, marksText, questionNumber } from "../src/lib/i18n";
import { splitScripts, setConverterForTests } from "../src/lib/legacyFont";
import { buildPaperDocx } from "../src/lib/docx/build";
import { DEFAULT_CONFIG, uid, type Paper } from "../src/lib/schemas";
assert.equal(formatDuration(120, "Tamil"), "2 மணித்தியாலங்கள்");
assert.equal(formatDuration(90, "Tamil"), "1 மணித்தியாலம் 30 நிமிடங்கள்");
assert.equal(formatDuration(45, "Tamil"), "45 நிமிடங்கள்");
assert.equal(formatDuration(90, "English"), "1 hour 30 minutes");
assert.equal(formatDuration(60, "Sinhala"), "පැය 1");
assert.equal(examTypeLabel("2nd Term Test", "Tamil"), "இரண்டாம் தவணைப் பரீட்சை");
assert.equal(examTypeLabel("Assignment", "Tamil"), "ஒப்படை");
assert.equal(sectionTitle("Section A", "Tamil"), "பகுதி A");
assert.equal(questionNumber("Question 3", "Tamil"), "வினா 3");
assert.equal(marksText(5, "Tamil"), "[5 புள்ளிகள்]");
assert.deepEqual(splitScripts("வினா 1: ABC, இசை"), [
  { text: "வினா", tamil: true }, { text: " 1: ABC, ", tamil: false }, { text: "இசை", tamil: true }]);
setConverterForTests((t) => `⟦${t}⟧`);
const tp: Paper = { instructions: ["எல்லா வினாக்களுக்கும் விடை எழுதுக."], sections: [{ id: uid(), title: "Section A", instructions: "பகுதி", questions: [
  { id: "q", number: "1", text: "இசை என்றால் என்ன? (Music)", marks: 5, type: "t", difficulty: "easy", topic: "இசை", optional: false, parts: [], supported: true, sourceNote: "", pageBreakBefore: false }] }] };
const baminiCfg = { ...DEFAULT_CONFIG, language: "Tamil" as const, institution: "யாழ் இந்துக் கல்லூரி", programme: "தரம் 10", subject: "இசை", examType: "1st Term Test", durationMinutes: 120, totalMarks: 5,
  formatting: { ...DEFAULT_CONFIG.formatting, fontFamily: "Bamini" } };
const built = await buildPaperDocx(baminiCfg, tp, null);
assert.equal(built.notice, undefined);
const xml = (await (await JSZip.loadAsync(built.buffer)).file("word/document.xml")!.async("string"));
assert.ok(["முதலாம்", "தவணைப்", "பரீட்சை"].every((w) => xml.includes(`⟦${w}⟧`)), "term title converted word by word");
assert.ok(["நேரம்", "மணித்தியாலங்கள்", "மொத்தப்", "புள்ளிகள்", "சுட்டெண்"].every((w) => xml.includes(`⟦${w}⟧`)), "labels converted");
assert.ok(/w:ascii="Bamini"[^>]*\/><w:b\/>|Bamini/.test(xml), "Bamini font used");
assert.ok(xml.includes('w:ascii="Times New Roman"'), "English/digits kept in Latin font");
assert.ok(!/⟦[^⟧]*[A-Za-z]{3}[^⟧]*⟧/.test(xml), "no Latin letters inside converted runs");
// a Unicode font must not be converted
setConverterForTests(() => { throw new Error("should not convert"); });
const plain = await buildPaperDocx({ ...baminiCfg, formatting: { ...baminiCfg.formatting, fontFamily: "Latha" } }, tp, null);
assert.ok((await (await JSZip.loadAsync(plain.buffer)).file("word/document.xml")!.async("string")).includes("இசை என்றால் என்ன?"));
setConverterForTests(null);

// 8. math
assert.equal(mathToPlain(parseMath("x^2 + y_i = sqrt(a/b)")), "x² + yᵢ = √(a/b)");
console.log("ALL OK");
