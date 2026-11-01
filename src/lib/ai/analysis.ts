import { jsonCall } from "./openai";
import {
  PatternAnalysisSchema,
  StructureSchema,
  uid,
  type ExamConfig,
  type PatternAnalysis,
  type Structure,
} from "../schemas";

const MAX_CHARS = 60_000;

export async function analyzePastPaper(args: {
  text: string;
  title: string;
  examType: string;
  year: string;
  notes: string;
}): Promise<PatternAnalysis> {
  return jsonCall({
    name: "past_paper_analysis",
    schema: PatternAnalysisSchema,
    system:
      "You analyse university examination papers. Describe the PATTERN of the paper (format, numbering, section layout, marks distribution, question types, difficulty, student instructions, recurring topics). Base everything strictly on the paper text. Do not invent details; use empty strings, empty arrays or 0 when something is not stated.",
    user: `Paper: ${args.title}\nExam type: ${args.examType || "n/a"}\nYear: ${args.year || "n/a"}\nUser notes about the pattern: ${args.notes || "none"}\n\n--- PAPER TEXT ---\n${args.text.slice(0, MAX_CHARS)}`,
  });
}

/** Turn the text of an uploaded paper / template into an editable structure. */
export async function parseStructure(text: string, name: string): Promise<Structure> {
  const s = await jsonCall({
    name: "paper_structure",
    schema: StructureSchema,
    system:
      "You extract the STRUCTURE (blueprint) of an examination paper: sections, number of questions per section, marks per question and per sub-question, answer rules (answer all / choose N), numbering style, duration and student instructions. Do not copy question content. Use the exact marks stated in the document. Questions with sub-parts (a),(b)… must list each part with its marks; questions without sub-parts have an empty parts array and use `marks`. In a 'choose N' section set optional=true on the questions the candidate may choose between and optional=false on compulsory ones; in 'answer all' sections optional=false. Set ids to any short string.",
    user: `Document: ${name}\n\n${text.slice(0, MAX_CHARS)}`,
  });
  return reid(s, name);
}

/** Suggest a structure when the user has not defined one. */
export async function suggestStructure(args: {
  config: ExamConfig;
  prompt: string;
  analyses: PatternAnalysis[];
}): Promise<Structure> {
  const { config } = args;
  const s = await jsonCall({
    name: "paper_structure",
    schema: StructureSchema,
    system:
      "You design the structure (blueprint) of a university examination paper. The sum of marks a candidate can earn (taking 'choose N' rules into account) MUST equal the requested total marks. Follow the patterns of the supplied past-paper analyses when present. Do not write questions. Questions without sub-parts have an empty parts array and use `marks`. In a 'choose N' section set optional=true on the questions the candidate may choose between and optional=false on compulsory ones; in 'answer all' sections optional=false. Set ids to any short string.",
    user: JSON.stringify({
      totalMarks: config.totalMarks,
      durationMinutes: config.durationMinutes,
      subject: config.subject,
      examType: config.examType,
      questionTypes: config.questionTypes,
      userPrompt: args.prompt,
      pastPaperPatterns: args.analyses,
    }),
  });
  return reid(s, s.name || "Suggested structure");
}

export function reid(s: Structure, fallbackName: string): Structure {
  return {
    ...s,
    name: s.name || fallbackName,
    sections: s.sections.map((sec) => ({
      ...sec,
      id: uid(),
      questions: sec.questions.map((q) => ({
        ...q,
        id: uid(),
        parts: q.parts.map((p) => ({ ...p, id: uid() })),
      })),
    })),
  };
}

export function describeAnalysis(a: PatternAnalysis, title: string): string {
  return [
    `Past paper "${title}":`,
    a.numberingStyle && `- Numbering: ${a.numberingStyle}`,
    a.sectionLayout && `- Layout: ${a.sectionLayout}`,
    a.marksDistribution && `- Marks distribution: ${a.marksDistribution}`,
    a.questionTypes.length && `- Question types: ${a.questionTypes.join(", ")}`,
    a.repeatedTopics.length && `- Recurring topics: ${a.repeatedTopics.join(", ")}`,
    a.difficultyProfile && `- Difficulty: ${a.difficultyProfile}`,
    a.styleNotes && `- Style: ${a.styleNotes}`,
    a.studentInstructions.length && `- Student instructions: ${a.studentInstructions.join(" | ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}
