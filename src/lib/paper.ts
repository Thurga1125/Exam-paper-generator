import { answerAll, answerAny, type Lang } from "./i18n";
import {
  paperTotal,
  questionMarks,
  type ExamConfig,
  type Paper,
  type StructSection,
  type Structure,
  type Warning,
} from "./schemas";

/** Client-safe helpers (no server imports). */

export function sectionInstruction(sec: StructSection, lang: Lang = "English"): string {
  const rule =
    sec.rule === "choose" && sec.chooseCount > 0 && sec.chooseCount < sec.questions.length
      ? answerAny(sec.chooseCount, sec.questions.length, lang)
      : answerAll(lang);
  return [rule, sec.instructions, sec.selectionNote].filter((x) => x && x.trim()).join(" ");
}

/** Deterministic sanity checks run after generation (and available after edits). */
export function checkPaper(paper: Paper, structure: Structure | null, config: ExamConfig): Warning[] {
  const w: Warning[] = [];
  const total = paperTotal(paper, structure);
  if (Math.abs(total - config.totalMarks) > 1e-6) {
    w.push({
      level: "error",
      message: `Total marks are ${total} but the configured total is ${config.totalMarks}. Adjust marks in the editor or the configuration.`,
    });
  }
  const seen = new Set<string>();
  for (const s of paper.sections) {
    for (const q of s.questions) {
      if (seen.has(q.number)) w.push({ level: "warning", message: `Question number ${q.number} is used more than once.` });
      seen.add(q.number);
      if (!q.supported) {
        w.push({
          level: "warning",
          message: `Question ${q.number} is not fully supported by your resources${q.sourceNote ? `: ${q.sourceNote}` : "."}`,
        });
      }
      if (questionMarks(q) <= 0) w.push({ level: "error", message: `Question ${q.number} has no marks.` });
    }
  }
  return w;
}
