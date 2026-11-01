import { formatQuestionNumber, uid, type Paper, type Part, type Question, type Structure } from "./schemas";

/** Re-number all questions sequentially using each section's numbering format. */
export function renumber(paper: Paper, structure: Structure | null): Paper {
  let n = 1;
  return {
    ...paper,
    sections: paper.sections.map((s, si) => {
      const fmt = structure?.sections[si]?.numberingFormat ?? structure?.sections[0]?.numberingFormat ?? "1";
      return { ...s, questions: s.questions.map((q) => ({ ...q, number: formatQuestionNumber(fmt, n++) })) };
    }),
  };
}

export function mapQuestion(paper: Paper, id: string, fn: (q: Question) => Question): Paper {
  return { ...paper, sections: paper.sections.map((s) => ({ ...s, questions: s.questions.map((q) => (q.id === id ? fn(q) : q)) })) };
}

/** Move a question up/down; crossing a section edge moves it into the neighbouring section. */
export function moveQuestion(paper: Paper, id: string, dir: -1 | 1): Paper {
  const flat = paper.sections.flatMap((s, si) => s.questions.map((q) => ({ q, si })));
  const i = flat.findIndex((x) => x.q.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= flat.length) return paper;
  const targetSection = flat[j].si;
  const sections = paper.sections.map((s) => ({ ...s, questions: s.questions.filter((q) => q.id !== id) }));
  const moving = flat[i].q;
  const dest = sections[targetSection];
  let idx = dest.questions.findIndex((q) => q.id === flat[j].q.id);
  if (idx < 0) idx = dir === -1 ? 0 : dest.questions.length;
  else if (dir === 1) idx += 1;
  const questions = [...dest.questions.slice(0, idx), moving, ...dest.questions.slice(idx)];
  return { ...paper, sections: sections.map((s, k) => (k === targetSection ? { ...s, questions } : s)) };
}

export function blankQuestion(marks = 5): Question {
  return {
    id: uid(), number: "", text: "", marks, type: "theoretical", difficulty: "medium", topic: "", optional: false,
    parts: [], supported: true, sourceNote: "", pageBreakBefore: false,
  };
}

export function blankPart(label: string, marks = 5): Part {
  return { id: uid(), label, text: "", marks, parts: [] };
}

export function partLabel(i: number): string {
  return `(${String.fromCharCode(97 + (i % 26))})`;
}
