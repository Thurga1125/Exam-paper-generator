import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Stored paper model                                                  */
/* ------------------------------------------------------------------ */

export const SubPartSchema = z.object({
  id: z.string(),
  label: z.string(), // "(i)"
  text: z.string(),
  marks: z.number(),
});

export const PartSchema = z.object({
  id: z.string(),
  label: z.string(), // "(a)"
  text: z.string(),
  marks: z.number(), // ignored when subparts exist (sum of subparts is used)
  parts: z.array(SubPartSchema),
});

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);

export const QuestionSchema = z.object({
  id: z.string(),
  number: z.string(), // "1", "Q1", "1." as produced by the numbering format
  text: z.string(), // stem. Supports **bold**, *italic*, $math$, pipe tables
  marks: z.number(), // ignored when parts exist (sum of parts is used)
  type: z.string(), // theory | numerical | practical | scenario | ...
  difficulty: DifficultySchema,
  topic: z.string(),
  optional: z.boolean(),
  parts: z.array(PartSchema),
  supported: z.boolean(), // false => not fully supported by the supplied sources
  sourceNote: z.string(),
  pageBreakBefore: z.boolean(),
});

export const SectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  instructions: z.string(),
  questions: z.array(QuestionSchema),
});

export const PaperSchema = z.object({
  instructions: z.array(z.string()),
  sections: z.array(SectionSchema),
});

export type SubPart = z.infer<typeof SubPartSchema>;
export type Part = z.infer<typeof PartSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Paper = z.infer<typeof PaperSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;

/* ------------------------------------------------------------------ */
/* Structure (blueprint)                                               */
/* ------------------------------------------------------------------ */

export const StructPartSchema = z.object({ id: z.string(), label: z.string(), marks: z.number() });

export const StructQuestionSchema = z.object({
  id: z.string(),
  marks: z.number(), // used when there are no parts
  optional: z.boolean(),
  questionType: z.string(), // "" = any
  parts: z.array(StructPartSchema),
});

export const StructSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  instructions: z.string(),
  numberingFormat: z.enum(["1", "Q1", "1.", "Question 1"]),
  partFormat: z.enum(["(a)", "a)", "(i)", "a."]),
  rule: z.enum(["all", "choose"]), // answer all / choose N
  chooseCount: z.number(),
  selectionNote: z.string(),
  questions: z.array(StructQuestionSchema),
});

export const StructureSchema = z.object({
  name: z.string(),
  durationMinutes: z.number(),
  totalMarks: z.number(),
  instructions: z.array(z.string()),
  sections: z.array(StructSectionSchema),
});

export type StructPart = z.infer<typeof StructPartSchema>;
export type StructQuestion = z.infer<typeof StructQuestionSchema>;
export type StructSection = z.infer<typeof StructSectionSchema>;
export type Structure = z.infer<typeof StructureSchema>;

/* ------------------------------------------------------------------ */
/* Exam configuration + document formatting                            */
/* ------------------------------------------------------------------ */

export const FormattingSchema = z.object({
  fontFamily: z.string(),
  fontSize: z.number(),
  headingSize: z.number(),
  questionSize: z.number(),
  lineSpacing: z.number(), // multiplier, 1.0 = single
  pageSize: z.enum(["A4", "Letter"]),
  marginTop: z.number(), // cm
  marginBottom: z.number(),
  marginLeft: z.number(),
  marginRight: z.number(),
  headerText: z.string(),
  footerText: z.string(),
  showPageNumbers: z.boolean(),
  boldQuestionNumbers: z.boolean(),
  boldMarks: z.boolean(),
  italicInstructions: z.boolean(),
  paragraphSpacing: z.number(), // pt after paragraph
  questionSpacing: z.number(), // pt before a question
});

export const ExamConfigSchema = z.object({
  title: z.string(),
  institution: z.string(),
  faculty: z.string(),
  programme: z.string(),
  yearSemester: z.string(),
  subject: z.string(),
  moduleCode: z.string(),
  examType: z.string(),
  totalMarks: z.number(),
  durationMinutes: z.number(),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]),
  difficultyMix: z.object({ easy: z.number(), medium: z.number(), hard: z.number() }),
  language: z.enum(["English", "Tamil", "Sinhala"]),
  questionTypes: z.array(z.string()),
  allowExternalKnowledge: z.boolean(),
  includeTopics: z.string(),
  excludeTopics: z.string(),
  additionalInstructions: z.string(),
  resourceNotes: z.string(),
  showStudentDetails: z.boolean(),
  formatting: FormattingSchema,
});

export type Formatting = z.infer<typeof FormattingSchema>;
export type ExamConfig = z.infer<typeof ExamConfigSchema>;

export const DEFAULT_FORMATTING: Formatting = {
  fontFamily: "Times New Roman",
  fontSize: 12,
  headingSize: 14,
  questionSize: 12,
  lineSpacing: 1.15,
  pageSize: "A4",
  marginTop: 2.5,
  marginBottom: 2.5,
  marginLeft: 2.5,
  marginRight: 2.5,
  headerText: "",
  footerText: "",
  showPageNumbers: true,
  boldQuestionNumbers: true,
  boldMarks: false,
  italicInstructions: true,
  paragraphSpacing: 6,
  questionSpacing: 12,
};

export const DEFAULT_CONFIG: ExamConfig = {
  title: "",
  institution: "",
  faculty: "",
  programme: "",
  yearSemester: "",
  subject: "",
  moduleCode: "",
  examType: "1st Term Test",
  totalMarks: 100,
  durationMinutes: 120,
  difficulty: "mixed",
  difficultyMix: { easy: 30, medium: 50, hard: 20 },
  language: "English",
  questionTypes: ["theoretical", "scenario-based"],
  allowExternalKnowledge: false,
  includeTopics: "",
  excludeTopics: "",
  additionalInstructions: "",
  resourceNotes: "",
  showStudentDetails: true,
  formatting: DEFAULT_FORMATTING,
};

/** Merge a stored (possibly partial / older) config over the defaults. */
export function normalizeConfig(raw: unknown): ExamConfig {
  const r = (raw ?? {}) as Partial<ExamConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...r,
    difficultyMix: { ...DEFAULT_CONFIG.difficultyMix, ...(r.difficultyMix ?? {}) },
    formatting: { ...DEFAULT_FORMATTING, ...(r.formatting ?? {}) },
  };
}

/* ------------------------------------------------------------------ */
/* Library rows                                                        */
/* ------------------------------------------------------------------ */

export type ResourceKind = "resource" | "past_paper" | "structure";

export interface ResourceRow {
  id: string;
  kind: ResourceKind;
  title: string;
  description: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  subject: string;
  module: string;
  topic: string;
  academic_year: string;
  semester: string;
  exam_type: string;
  paper_year: string;
  notes: string;
  char_count: number;
  status: "processing" | "ready" | "failed";
  error: string | null;
  analysis: PatternAnalysis | null;
  created_at: string;
}

export interface PaperRow {
  id: string;
  title: string;
  status: "draft" | "generating" | "ready" | "failed";
  config: ExamConfig;
  structure: Structure | null;
  prompt: string;
  resource_ids: string[];
  past_paper_ids: string[];
  content: Paper | null;
  marking_scheme: MarkingScheme | null;
  warnings: Warning[];
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Warning {
  level: "info" | "warning" | "error";
  message: string;
}

/* ------------------------------------------------------------------ */
/* Past paper analysis                                                 */
/* ------------------------------------------------------------------ */

export const PatternAnalysisSchema = z.object({
  numberingStyle: z.string(),
  sectionLayout: z.string(),
  marksDistribution: z.string(),
  questionTypes: z.array(z.string()),
  repeatedTopics: z.array(z.string()),
  difficultyProfile: z.string(),
  studentInstructions: z.array(z.string()),
  styleNotes: z.string(),
  totalMarks: z.number(),
  durationMinutes: z.number(),
});
export type PatternAnalysis = z.infer<typeof PatternAnalysisSchema>;

/* ------------------------------------------------------------------ */
/* Marking scheme                                                      */
/* ------------------------------------------------------------------ */

export const MarkingPointSchema = z.object({ point: z.string(), marks: z.number() });

export const MarkingPartSchema = z.object({
  label: z.string(), // "" for the question stem / questions without parts
  expectedAnswer: z.string(),
  modelAnswer: z.string(),
  marks: z.number(),
  allocation: z.array(MarkingPointSchema),
  rubric: z.string(),
});

export const MarkingQuestionSchema = z.object({
  questionId: z.string(),
  number: z.string(),
  parts: z.array(MarkingPartSchema),
  examinerNotes: z.string(),
});

export const MarkingSchemeSchema = z.object({
  generalGuidelines: z.array(z.string()),
  questions: z.array(MarkingQuestionSchema),
});
export type MarkingScheme = z.infer<typeof MarkingSchemeSchema>;
export type MarkingQuestion = z.infer<typeof MarkingQuestionSchema>;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function uid(): string {
  return globalThis.crypto.randomUUID();
}

/** Effective marks of a part (sum of sub-parts when present). */
export function partMarks(p: Part): number {
  return p.parts.length ? sum(p.parts.map((s) => s.marks)) : p.marks;
}

/** Effective marks of a question (sum of parts when present). */
export function questionMarks(q: Question): number {
  return q.parts.length ? sum(q.parts.map(partMarks)) : q.marks;
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/**
 * Marks a candidate can earn from one section: compulsory questions always count;
 * when the rule is "choose N", the N − (compulsory) highest-value optional ones are added.
 */
export function sectionMarks(marks: number[], optional: boolean[], rule: "all" | "choose", chooseCount: number): number {
  if (rule !== "choose" || chooseCount <= 0 || chooseCount >= marks.length) return sum(marks);
  const must = marks.filter((_, i) => !optional[i]);
  const opt = marks.filter((_, i) => optional[i]).sort((a, b) => b - a);
  const remaining = Math.max(0, chooseCount - must.length);
  return sum(must) + sum(opt.slice(0, remaining));
}

export function paperTotal(paper: Paper, structure?: Structure | null): number {
  return sum(
    paper.sections.map((s, i) => {
      const rule = structure?.sections[i];
      return sectionMarks(
        s.questions.map(questionMarks),
        s.questions.map((q) => q.optional),
        rule?.rule ?? "all",
        rule?.chooseCount ?? 0,
      );
    }),
  );
}

export function structureTotal(st: Structure): number {
  return sum(
    st.sections.map((s) =>
      sectionMarks(
        s.questions.map((q) => (q.parts.length ? sum(q.parts.map((p) => p.marks)) : q.marks)),
        s.questions.map((q) => q.optional),
        s.rule,
        s.chooseCount,
      ),
    ),
  );
}

export function formatQuestionNumber(fmt: StructSection["numberingFormat"], n: number): string {
  switch (fmt) {
    case "Q1":
      return `Q${n}`;
    case "1.":
      return `${n}.`;
    case "Question 1":
      return `Question ${n}`;
    default:
      return `${n}`;
  }
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];

export function formatPartLabel(fmt: StructSection["partFormat"], i: number): string {
  const letter = String.fromCharCode(97 + (i % 26));
  switch (fmt) {
    case "a)":
      return `${letter})`;
    case "(i)":
      return `(${ROMAN[i] ?? i + 1})`;
    case "a.":
      return `${letter}.`;
    default:
      return `(${letter})`;
  }
}

export function subPartLabel(i: number): string {
  return `(${ROMAN[i] ?? i + 1})`;
}
