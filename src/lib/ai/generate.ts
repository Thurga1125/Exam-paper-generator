import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { jsonCall } from "./openai";
import { retrieve, formatSources, type Source } from "./retrieval";
import { buildPastIndex, loadContext, overlapWithPast, type PaperContext } from "./context";
import { checkPaper, sectionInstruction } from "../paper";
import {
  DifficultySchema,
  formatPartLabel,
  formatQuestionNumber,
  normalizeConfig,
  subPartLabel,
  sum,
  uid,
  type Difficulty,
  type ExamConfig,
  type Paper,
  type PaperRow,
  type Question,
  type Section,
  type StructQuestion,
  type StructSection,
  type Structure,
  type Warning,
} from "../schemas";

/* ---------- model output schemas (strict-compatible: no optionals) ---------- */

export const GenSubPartSchema = z.object({ text: z.string(), marks: z.number() });
export const GenPartSchema = z.object({ text: z.string(), marks: z.number(), parts: z.array(GenSubPartSchema) });
export const GenQuestionSchema = z.object({
  text: z.string(),
  marks: z.number(),
  type: z.string(),
  difficulty: DifficultySchema,
  topic: z.string(),
  parts: z.array(GenPartSchema),
  supported: z.boolean(),
  sourceNote: z.string(),
});
export type GenQuestion = z.infer<typeof GenQuestionSchema>;
const GenSectionSchema = z.object({ questions: z.array(GenQuestionSchema) });
const InstructionsSchema = z.object({ instructions: z.array(z.string()) });

export type Emit = (e: { stage: string; message: string; progress: number }) => void;

export const EXAMINER_SYSTEM = `You are a senior examiner who writes original, rigorous, unambiguous examination questions for Sri Lankan schools (government national syllabus, NIE textbooks and teacher guides) and for universities. When the request names a grade, write at that grade's level with age-appropriate wording and the terminology used in Sri Lankan textbooks of the requested medium (Tamil, Sinhala or English). Term tests (1st, 2nd, 3rd term) should cover only the content taught up to that term; assignments may be more open-ended and practical.

Non-negotiable rules:
1. KNOWLEDGE BASE: base every question on the SOURCE EXCERPTS provided. Cite the supporting excerpt tags (e.g. "S2, S5") in sourceNote. Never use facts that the excerpts do not support, unless external knowledge is explicitly permitted in the request.
2. If the excerpts do not adequately cover what a question needs, still produce the best question you can from what is supported, set "supported": false and explain the gap in sourceNote. Never pretend weak coverage is full coverage.
3. PAST PAPERS are provided only as PATTERN/STYLE descriptions. Never reproduce or lightly paraphrase a past question. Every question must be original.
4. Stay inside the requested syllabus/topics and never touch excluded topics.
5. Follow the blueprint EXACTLY: the same number of questions, the same part structure, and the exact marks given. For a question with parts, set "marks" to 0 and make the part marks equal the blueprint. If a part is worth many marks you may split it into sub-parts whose marks sum exactly to the part marks (otherwise leave "parts" empty for that part).
6. A question's "text" is its stem/introduction; each part's text must be answerable on its own and must read naturally after the stem. Do NOT include numbering or labels like "(a)" or "Q1" in any text, and never put marks like "[5 marks]" in the text — numbering and marks are added automatically.
7. Match the target difficulty and question type for each question. Mark scheme depth should fit the marks: more marks => more steps/depth.
8. Formatting inside text: **bold**, *italic*, $inline math$ using simple notation like x^2, x_i, sqrt(x), a/b; tables as markdown pipe tables; line breaks with \\n. Use code or SQL on separate lines.
9. Write all questions in the requested language, using proper terminology of that language.
10. Avoid duplicating topics or wording already used elsewhere in the paper.`;

/* ---------- difficulty planning ---------- */

export function planDifficulty(total: number, mix: ExamConfig["difficultyMix"], mode: ExamConfig["difficulty"]): Difficulty[] {
  if (mode !== "mixed") return Array.from({ length: total }, () => mode);
  const levels: Difficulty[] = ["easy", "medium", "hard"];
  const weights = levels.map((l) => Math.max(0, mix[l]));
  const wSum = sum(weights) || 1;
  const remaining = weights.map((w) => (w / wSum) * total);
  const out: Difficulty[] = [];
  for (let i = 0; i < total; i++) {
    let bi = 0;
    for (let j = 1; j < 3; j++) if (remaining[j] > remaining[bi] + 1e-9) bi = j;
    out.push(levels[bi]);
    remaining[bi] -= 1;
  }
  return out;
}

/* ---------- validation of a generated section ---------- */

interface Blueprint {
  index: number;
  marks: number;
  parts: { label: string; marks: number }[];
  targetDifficulty: Difficulty;
  questionType: string;
}

export function validateGenerated(gen: GenQuestion[], bp: Blueprint[]): string[] {
  const errs: string[] = [];
  if (gen.length !== bp.length) errs.push(`Expected exactly ${bp.length} questions but got ${gen.length}.`);
  for (let i = 0; i < Math.min(gen.length, bp.length); i++) {
    const g = gen[i];
    const b = bp[i];
    const tag = `Question ${i + 1}`;
    if (b.parts.length) {
      if (g.parts.length !== b.parts.length) {
        errs.push(`${tag}: expected ${b.parts.length} parts but got ${g.parts.length}.`);
        continue;
      }
      g.parts.forEach((p, pi) => {
        const eff = p.parts.length ? sum(p.parts.map((s) => s.marks)) : p.marks;
        if (Math.abs(eff - b.parts[pi].marks) > 1e-6) {
          errs.push(`${tag} part ${pi + 1}: must total ${b.parts[pi].marks} marks but totals ${eff}.`);
        }
      });
    } else {
      if (g.parts.length) errs.push(`${tag}: must have no parts.`);
      if (Math.abs(g.marks - b.marks) > 1e-6) errs.push(`${tag}: must be worth ${b.marks} marks, got ${g.marks}.`);
    }
    if (!g.text.trim()) errs.push(`${tag}: empty question text.`);
  }
  return errs;
}

/** Build stored questions from the model output (ids, numbering, labels). */
export function hydrate(
  gen: GenQuestion[],
  sec: StructSection,
  startNumber: number,
  bp: Blueprint[],
): Question[] {
  return gen.map((g, i) => ({
    id: uid(),
    number: formatQuestionNumber(sec.numberingFormat, startNumber + i),
    text: g.text.trim(),
    marks: g.parts.length ? 0 : (bp[i]?.marks ?? g.marks),
    type: g.type,
    difficulty: g.difficulty,
    topic: g.topic,
    optional: sec.rule === "choose" && (sec.questions[i]?.optional ?? true),
    parts: g.parts.map((p, pi) => ({
      id: uid(),
      label: formatPartLabel(sec.partFormat, pi),
      text: p.text.trim(),
      marks: p.parts.length ? 0 : p.marks,
      parts: p.parts.map((s, si) => ({ id: uid(), label: subPartLabel(si), text: s.text.trim(), marks: s.marks })),
    })),
    supported: g.supported,
    sourceNote: g.sourceNote,
    pageBreakBefore: false,
  }));
}

function blueprintFor(sec: StructSection, difficulties: Difficulty[], offset: number): Blueprint[] {
  return sec.questions.map((q: StructQuestion, i) => ({
    index: i + 1,
    marks: q.parts.length ? sum(q.parts.map((p) => p.marks)) : q.marks,
    parts: q.parts.map((p, pi) => ({ label: formatPartLabel(sec.partFormat, pi), marks: p.marks })),
    targetDifficulty: difficulties[offset + i],
    questionType: q.questionType || "any suitable type from the allowed types",
  }));
}

export function requestSummary(config: ExamConfig, prompt: string) {
  return {
    subject: config.subject,
    moduleCode: config.moduleCode,
    gradeOrProgramme: config.programme,
    schoolOrInstitution: config.institution,
    yearSemester: config.yearSemester,
    examType: config.examType,
    language: config.language,
    allowedQuestionTypes: config.questionTypes,
    includeTopics: config.includeTopics || "(whole selected syllabus)",
    excludeTopics: config.excludeTopics || "(none)",
    externalKnowledgeAllowed: config.allowExternalKnowledge,
    additionalInstructions: config.additionalInstructions || "(none)",
    lecturerNotesAboutTheResources: config.resourceNotes || "(none)",
    lecturerPrompt: prompt || "(none)",
  };
}

export function retrievalQueries(config: ExamConfig, prompt: string, extra: string[]): string[] {
  const topics = config.includeTopics
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((t) => `${config.subject} ${t}`);
  return [...extra.map((e) => `${config.subject} ${e}`), ...topics, prompt.slice(0, 600)].filter((q) => q.trim());
}

/* ---------- main orchestration ---------- */

export interface GenerationResult {
  paper: Paper;
  warnings: Warning[];
}

export async function generatePaper(
  supabase: SupabaseClient,
  row: PaperRow,
  emit: Emit,
): Promise<GenerationResult> {
  let config = normalizeConfig(row.config);
  const structure = row.structure;
  if (!structure?.sections.length) throw new Error("Define a paper structure before generating.");
  if (!row.prompt.trim() && !config.subject.trim()) {
    throw new Error("Add a subject name or a custom prompt so the AI knows what to examine.");
  }

  const warnings: Warning[] = [];
  if (!row.resource_ids.length) {
    // nothing from the lecturer's own materials: proceed on subject + prompt, but say so loudly
    config = { ...config, allowExternalKnowledge: true };
    warnings.push({
      level: "warning",
      message: "No learning resources were selected, so these questions are based on the subject, your prompt and general knowledge — not your materials. Check every question for accuracy and syllabus fit.",
    });
  }
  emit({ stage: "context", message: "Reading selected resources and past papers…", progress: 3 });
  const ctx = await loadContext(supabase, row.resource_ids, row.past_paper_ids, (t) =>
    emit({ stage: "analysis", message: `Analysing past paper “${t}”…`, progress: 8 }),
  );
  if (ctx.analyses.length) emit({ stage: "analysis", message: `Analysed ${ctx.analyses.length} past paper(s).`, progress: 15 });

  const pastIndex = buildPastIndex(ctx.pastTexts);
  const totalQ = sum(structure.sections.map((s) => s.questions.length));
  const difficulties = planDifficulty(totalQ, config.difficultyMix, config.difficulty);

  const used = new Set<string>();
  const usedTopics: string[] = [];
  const sections: Section[] = [];
  let offset = 0;
  let number = 1;

  for (let si = 0; si < structure.sections.length; si++) {
    const sec = structure.sections[si];
    const progress = 15 + Math.round((si / structure.sections.length) * 65);
    emit({ stage: "retrieve", message: `Section ${si + 1}/${structure.sections.length}: retrieving relevant material…`, progress });

    const sources = await retrieve(supabase, {
      resourceIds: row.resource_ids,
      titles: ctx.titles,
      queries: retrievalQueries(config, row.prompt, [sec.title, ...sec.questions.map((q) => q.questionType).filter(Boolean)]),
      maxTotal: Math.min(24, 8 + sec.questions.length * 3),
      exclude: used,
    });
    sources.forEach((s) => used.add(s.chunkId));
    if (!sources.length || sum(sources.slice(0, 5).map((s) => s.similarity)) / Math.min(5, sources.length) < 0.2) {
      warnings.push({
        level: "warning",
        message: `Section “${sec.title}”: the selected resources contain little material matching this section. Questions may not be fully supported — add more resources or relax the topic filters.`,
      });
    }

    emit({ stage: "generate", message: `Section ${si + 1}/${structure.sections.length}: writing “${sec.title}”…`, progress: progress + 4 });
    const bp = blueprintFor(sec, difficulties, offset);
    const questions = await generateSection({
      config,
      prompt: row.prompt,
      sec,
      bp,
      sources,
      ctx,
      pastIndex,
      usedTopics,
      startNumber: number,
      warnings,
    });
    questions.forEach((q) => usedTopics.push(q.topic));
    sections.push({
      id: uid(),
      title: sec.title,
      instructions: sectionInstruction(sec, config.language),
      questions,
    });
    offset += sec.questions.length;
    number += sec.questions.length;
  }

  emit({ stage: "instructions", message: "Preparing examination instructions…", progress: 85 });
  const instructions = await buildInstructions(config, structure, ctx);

  const paper: Paper = { instructions, sections };

  emit({ stage: "check", message: "Checking marks, numbering and source support…", progress: 94 });
  warnings.push(...checkPaper(paper, structure, config));
  return { paper, warnings };
}

async function generateSection(a: {
  config: ExamConfig;
  prompt: string;
  sec: StructSection;
  bp: Blueprint[];
  sources: Source[];
  ctx: PaperContext;
  pastIndex: Set<string>;
  usedTopics: string[];
  startNumber: number;
  warnings: Warning[];
}): Promise<Question[]> {
  const { config, sec, bp, sources, ctx, pastIndex } = a;
  let feedback = "";
  let lastGen: GenQuestion[] | null = null;
  let lastErrs: string[] = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await jsonCall({
      name: "section_questions",
      schema: GenSectionSchema,
      system: EXAMINER_SYSTEM,
      user:
        `REQUEST\n${JSON.stringify(requestSummary(config, a.prompt), null, 2)}\n\n` +
        `PAST-PAPER PATTERNS (style only, never copy)\n${ctx.patternText || "(none supplied)"}\n\n` +
        `TOPICS ALREADY USED IN OTHER SECTIONS (avoid repeating)\n${a.usedTopics.join("; ") || "(none)"}\n\n` +
        `SECTION: ${sec.title}\n${sec.instructions}\n\nBLUEPRINT (exact; one entry per question, in order)\n${JSON.stringify(bp, null, 2)}\n\n` +
        `SOURCE EXCERPTS\n${formatSources(sources)}` +
        (feedback ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED. Fix these problems:\n${feedback}` : ""),
    });

    // normalise part totals when sub-parts exist
    out.questions.forEach((q) =>
      q.parts.forEach((p) => {
        if (p.parts.length) p.marks = sum(p.parts.map((s) => s.marks));
      }),
    );

    const errs = validateGenerated(out.questions, bp);
    const copied = out.questions
      .map((q, i) => ({ i, o: overlapWithPast([q.text, ...q.parts.map((p) => p.text)].join(" "), pastIndex) }))
      .filter((x) => x.o > 0.35);
    if (copied.length) {
      errs.push(
        ...copied.map((c) => `Question ${c.i + 1} is too close to a past-paper question (${Math.round(c.o * 100)}% overlap). Write a clearly original question.`),
      );
    }
    lastGen = out.questions;
    lastErrs = errs;
    if (!errs.length) break;
    feedback = errs.join("\n");
  }

  if (!lastGen || lastGen.length !== bp.length) {
    throw new Error(`Could not generate a valid “${sec.title}” section: ${lastErrs.join(" ")}`);
  }
  if (lastErrs.length) {
    a.warnings.push(...lastErrs.map((m) => ({ level: "warning" as const, message: `Section “${sec.title}”: ${m}` })));
  }
  return hydrate(lastGen, sec, a.startNumber, bp);
}

async function buildInstructions(config: ExamConfig, structure: Structure, ctx: PaperContext): Promise<string[]> {
  const out = await jsonCall({
    name: "exam_instructions",
    schema: InstructionsSchema,
    system:
      "You write the general instructions printed at the top of a university examination paper. Be concise, formal and accurate. Only state facts that are provided (duration, total marks, number of sections, section answer rules, supplied instructions). Do not invent rules (such as calculator or open-book policy) that are not provided. 3 to 8 short numbered-style statements, no numbering characters.",
    user: JSON.stringify({
      language: config.language,
      durationMinutes: config.durationMinutes,
      totalMarks: config.totalMarks,
      sections: structure.sections.map((s) => ({ title: s.title, rule: sectionInstruction(s, config.language) })),
      instructionsFromStructure: structure.instructions,
      instructionsSeenInPastPapers: ctx.analyses.flatMap((a) => a.studentInstructions).slice(0, 12),
      additional: config.additionalInstructions,
    }),
  });
  return out.instructions.map((s) => s.trim()).filter(Boolean);
}

export { checkPaper, sectionInstruction };
