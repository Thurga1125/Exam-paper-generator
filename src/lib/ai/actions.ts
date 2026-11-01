import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { jsonCall } from "./openai";
import { retrieve, formatSources } from "./retrieval";
import { loadContext, buildPastIndex, overlapWithPast } from "./context";
import {
  EXAMINER_SYSTEM,
  GenQuestionSchema,
  requestSummary,
  validateGenerated,
  type GenQuestion,
} from "./generate";
import {
  MarkingQuestionSchema,
  MarkingSchemeSchema,
  normalizeConfig,
  partMarks,
  questionMarks,
  sum,
  uid,
  type MarkingQuestion,
  type MarkingScheme,
  type PaperRow,
  type Question,
} from "../schemas";

export type QuestionAction =
  | "harder"
  | "easier"
  | "another"
  | "scenario"
  | "clarify"
  | "regenerate"
  | "custom";

const ACTION_BRIEF: Record<QuestionAction, string> = {
  harder: "Rewrite this question so it is harder (deeper reasoning, more steps, less direct recall) while staying on the same topic and keeping the same marks and part structure.",
  easier: "Rewrite this question so it is easier (more direct, more guided) while staying on the same topic and keeping the same marks and part structure.",
  another: "Write a DIFFERENT question on the same topic (a different angle or sub-topic), with the same marks and part structure. It must not resemble the current question or any other question in the paper.",
  scenario: "Convert this question into a realistic scenario-based question (a short case/context followed by the task), keeping the same topic, marks and part structure.",
  clarify: "Improve the clarity and precision of this question: remove ambiguity, fix grammar, make command words explicit. Do not change what is being tested, the difficulty, the marks or the part structure.",
  regenerate: "Replace this question with a fresh, original question on the same topic, with the same marks and part structure.",
  custom: "Rewrite this question exactly as the lecturer instructs below, keeping the same marks and part structure unless the instruction clearly requires otherwise.",
};

function locate(row: PaperRow, questionId: string) {
  const paper = row.content;
  if (!paper) throw new Error("This paper has no generated content yet.");
  for (let si = 0; si < paper.sections.length; si++) {
    const qi = paper.sections[si].questions.findIndex((q) => q.id === questionId);
    if (qi >= 0) return { paper, si, qi, question: paper.sections[si].questions[qi] };
  }
  throw new Error("Question not found.");
}

function toBlueprint(q: Question) {
  return [
    {
      index: 1,
      marks: questionMarks(q),
      parts: q.parts.map((p) => ({ label: p.label, marks: partMarks(p) })),
      targetDifficulty: q.difficulty,
      questionType: q.type,
    },
  ];
}

function describeQuestion(q: Question): string {
  return [
    `${q.number}. ${q.text}`,
    ...q.parts.flatMap((p) => [`  ${p.label} ${p.text} [${partMarks(p)}]`, ...p.parts.map((s) => `    ${s.label} ${s.text} [${s.marks}]`)]),
    q.parts.length ? "" : `[${q.marks}]`,
  ].join("\n");
}

/** Rewrites ONE question; the rest of the paper is untouched. */
export async function transformQuestion(
  supabase: SupabaseClient,
  row: PaperRow,
  questionId: string,
  action: QuestionAction,
  instruction = "",
): Promise<Question> {
  const { paper, question: old, si } = locate(row, questionId);
  if (action === "custom" && !instruction.trim()) throw new Error("Describe how the question should change.");
  const config = normalizeConfig(row.config);
  const ctx = await loadContext(supabase, row.resource_ids, row.past_paper_ids);

  const sources = await retrieve(supabase, {
    resourceIds: row.resource_ids,
    titles: ctx.titles,
    queries: [`${old.topic} ${old.text}`.slice(0, 800), `${config.subject} ${old.topic}`],
    maxTotal: 10,
  });

  const others = paper.sections
    .flatMap((s) => s.questions)
    .filter((q) => q.id !== old.id)
    .map((q) => `${q.topic}: ${q.text}`.slice(0, 200));

  const pastIndex = buildPastIndex(ctx.pastTexts);
  const bp = toBlueprint(old);
  let feedback = "";
  let result: GenQuestion | null = null;
  let errs: string[] = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await jsonCall({
      name: "single_question",
      schema: z.object({ questions: z.array(GenQuestionSchema) }),
      system: EXAMINER_SYSTEM,
      user:
        `REQUEST\n${JSON.stringify(requestSummary(config, row.prompt), null, 2)}\n\n` +
        `PAST-PAPER PATTERNS (style only, never copy)\n${ctx.patternText || "(none)"}\n\n` +
        `TASK\n${ACTION_BRIEF[action]}${instruction ? `\nLecturer instruction: ${instruction}` : ""}\n\n` +
        `CURRENT QUESTION\n${describeQuestion(old)}\n\n` +
        `OTHER QUESTIONS IN THE PAPER (do not duplicate)\n${others.join("\n") || "(none)"}\n\n` +
        `BLUEPRINT (exactly one question)\n${JSON.stringify(bp)}\n\n` +
        `SOURCE EXCERPTS\n${formatSources(sources)}` +
        (feedback ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED:\n${feedback}` : ""),
    });
    out.questions.forEach((q) =>
      q.parts.forEach((p) => {
        if (p.parts.length) p.marks = sum(p.parts.map((s) => s.marks));
      }),
    );
    errs = validateGenerated(out.questions, bp);
    const o = out.questions[0] ? overlapWithPast([out.questions[0].text, ...out.questions[0].parts.map((p) => p.text)].join(" "), pastIndex) : 0;
    if (o > 0.35) errs.push("Too close to a past-paper question; write an original one.");
    result = out.questions[0] ?? null;
    if (!errs.length) break;
    feedback = errs.join("\n");
  }
  if (!result || errs.length) throw new Error(`The AI could not produce a valid question: ${errs.join(" ")}`);
  void si;

  const labelFor = (i: number) => old.parts[i]?.label ?? `(${String.fromCharCode(97 + i)})`;
  return {
    ...old,
    text: result.text.trim(),
    marks: result.parts.length ? 0 : old.marks,
    type: result.type || old.type,
    difficulty: action === "harder" ? "hard" : action === "easier" ? "easy" : result.difficulty,
    topic: result.topic || old.topic,
    parts: result.parts.map((p, i) => ({
      id: uid(),
      label: labelFor(i),
      text: p.text.trim(),
      marks: p.parts.length ? 0 : p.marks,
      parts: p.parts.map((s, k) => ({ id: uid(), label: `(${["i", "ii", "iii", "iv", "v", "vi"][k] ?? k + 1})`, text: s.text.trim(), marks: s.marks })),
    })),
    supported: result.supported,
    sourceNote: result.sourceNote,
  };
}

/* ---------------------- academic correctness check ---------------------- */

export const CheckSchema = z.object({
  verdict: z.enum(["sound", "needs_attention"]),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
  answerable: z.boolean(),
  supportedBySources: z.boolean(),
});
export type CheckResult = z.infer<typeof CheckSchema>;

export async function checkQuestion(supabase: SupabaseClient, row: PaperRow, questionId: string): Promise<CheckResult> {
  const { question: q } = locate(row, questionId);
  const config = normalizeConfig(row.config);
  const ctx = await loadContext(supabase, row.resource_ids, []);
  const sources = await retrieve(supabase, {
    resourceIds: row.resource_ids,
    titles: ctx.titles,
    queries: [`${q.topic} ${q.text}`.slice(0, 800)],
    maxTotal: 8,
  });
  return jsonCall({
    name: "question_check",
    schema: CheckSchema,
    system:
      "You review exam questions for academic correctness. Check: factual accuracy, that it is unambiguous and answerable, that marks are proportionate to the work required, that terminology is correct, and whether the SOURCE EXCERPTS support it. Report only real problems; if none, verdict is 'sound' with empty issues.",
    user: `Subject: ${config.subject}\nExternal knowledge allowed: ${config.allowExternalKnowledge}\n\nQUESTION\n${describeQuestion(q)}\n\nSOURCE EXCERPTS\n${formatSources(sources)}`,
  });
}

/* ----------------------------- marking scheme ---------------------------- */

const MarkingQuestionOutSchema = MarkingQuestionSchema.omit({ questionId: true });

export async function markingForQuestion(
  supabase: SupabaseClient,
  row: PaperRow,
  q: Question,
  titles: Map<string, string>,
): Promise<MarkingQuestion> {
  const config = normalizeConfig(row.config);
  const sources = await retrieve(supabase, {
    resourceIds: row.resource_ids,
    titles,
    queries: [`${q.topic} ${q.text}`.slice(0, 800)],
    maxTotal: 8,
  });
  const out = await jsonCall({
    name: "marking_question",
    schema: MarkingQuestionOutSchema,
    system: `You write marking schemes for university examiners. For each part (or the whole question if it has no parts, using label "") give: the expected answer (concise key points), a full model answer, the marks, an itemised mark allocation whose marks sum EXACTLY to the part's marks, and a short rubric describing what separates full, partial and no credit. Answers must be correct and grounded in the SOURCE EXCERPTS unless external knowledge is allowed. Write in ${config.language}. In examinerNotes mention common mistakes and acceptable alternative answers.`,
    user:
      `QUESTION (${questionMarks(q)} marks)\n${describeQuestion(q)}\n\n` +
      `PART MARKS: ${JSON.stringify(q.parts.length ? q.parts.map((p) => ({ label: p.label, marks: partMarks(p) })) : [{ label: "", marks: q.marks }])}\n` +
      `External knowledge allowed: ${config.allowExternalKnowledge}\n\nSOURCE EXCERPTS\n${formatSources(sources)}`,
  });

  // enforce that allocations add up; fix the part marks to the paper's marks
  const expected = q.parts.length ? q.parts.map((p) => ({ label: p.label, marks: partMarks(p) })) : [{ label: "", marks: q.marks }];
  const parts = out.parts.map((p, i) => ({ ...p, marks: expected[i]?.marks ?? p.marks }));
  for (const p of parts) {
    const s = sum(p.allocation.map((a) => a.marks));
    if (p.allocation.length && Math.abs(s - p.marks) > 1e-6) {
      // rescale proportionally so the scheme is internally consistent
      const f = p.marks / (s || 1);
      p.allocation = p.allocation.map((a) => ({ ...a, marks: Math.round(a.marks * f * 4) / 4 }));
    }
  }
  return { questionId: q.id, number: q.number, parts, examinerNotes: out.examinerNotes };
}

export async function generateMarkingScheme(
  supabase: SupabaseClient,
  row: PaperRow,
  progress: (done: number, total: number) => void,
): Promise<MarkingScheme> {
  if (!row.content) throw new Error("Generate the paper first.");
  const ctx = await loadContext(supabase, row.resource_ids, []);
  const questions = row.content.sections.flatMap((s) => s.questions);
  const results: MarkingQuestion[] = new Array(questions.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < questions.length) {
      const i = next++;
      results[i] = await markingForQuestion(supabase, row, questions[i], ctx.titles);
      progress(++done, questions.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  const config = normalizeConfig(row.config);
  const general = await jsonCall({
    name: "marking_guidelines",
    schema: MarkingSchemeSchema.omit({ questions: true }),
    system: `Write 4 to 8 concise general guidelines for examiners marking this paper (consistency, handling alternative valid answers, partial credit, method marks, language/presentation). Do not invent exam rules not given. Write in ${config.language}.`,
    user: JSON.stringify({ subject: config.subject, totalMarks: config.totalMarks, questionTypes: [...new Set(questions.map((q) => q.type))] }),
  });
  return { generalGuidelines: general.generalGuidelines, questions: results };
}
