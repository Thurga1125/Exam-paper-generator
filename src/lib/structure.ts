import { structureTotal, uid, type StructPart, type StructQuestion, type StructSection, type Structure } from "./schemas";

export function newPart(label: string, marks: number): StructPart {
  return { id: uid(), label, marks };
}

export function newQuestion(marks = 10, partCount = 0, optional = false): StructQuestion {
  const parts = Array.from({ length: partCount }, (_, i) => newPart(String.fromCharCode(97 + i), Math.max(1, Math.round(marks / partCount))));
  if (parts.length) {
    // make parts sum exactly to `marks`
    const diff = marks - parts.reduce((a, p) => a + p.marks, 0);
    parts[parts.length - 1].marks += diff;
  }
  return { id: uid(), marks, optional, questionType: "", parts };
}

export function newSection(title: string, questions = 5, marksEach = 10): StructSection {
  return {
    id: uid(),
    title,
    instructions: "",
    numberingFormat: "1",
    partFormat: "(a)",
    rule: "all",
    chooseCount: 0,
    selectionNote: "",
    questions: Array.from({ length: questions }, () => newQuestion(marksEach)),
  };
}

export function emptyStructure(): Structure {
  return { name: "New structure", durationMinutes: 180, totalMarks: 100, instructions: [], sections: [newSection("Section A", 4, 25)] };
}

export function withComputedTotal(s: Structure): Structure {
  return { ...s, totalMarks: structureTotal(s) };
}

export function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

/**
 * Rescale every mark in the structure so the candidate-earnable total equals `target`.
 * Handles an all-zero structure (spreads evenly) and "choose N" sections. Returns the
 * structure unchanged when it already matches or cannot be fitted (no questions).
 */
export function fitStructureToTotal(s: Structure, target: number): Structure {
  if (!s.sections.length || !(target > 0) || !s.sections.some((x) => x.questions.length)) return s;
  const clone: Structure = structuredClone(s);
  // every mark-bearing slot, in order
  const slots: { get: () => number; set: (n: number) => void }[] = [];
  for (const sec of clone.sections) {
    for (const q of sec.questions) {
      if (q.parts.length) q.parts.forEach((p) => slots.push({ get: () => p.marks, set: (n) => (p.marks = n) }));
      else slots.push({ get: () => q.marks, set: (n) => (q.marks = n) });
    }
  }
  let total = structureTotal(clone);
  if (Math.abs(total - target) < 1e-6) return s;
  if (total <= 0) {
    slots.forEach((x) => x.set(1));
    total = structureTotal(clone);
  }
  const f = target / total;
  slots.forEach((x) => x.set(Math.max(1, Math.round(x.get() * f))));
  // nudge by whole marks until the total matches (rounding drift)
  for (let i = 0, guard = 0; guard < 2000; guard++) {
    const diff = target - structureTotal(clone);
    if (Math.abs(diff) < 1e-6) break;
    const slot = slots[i++ % slots.length];
    const step = diff > 0 ? 1 : -1;
    if (slot.get() + step >= 1) slot.set(slot.get() + step);
  }
  return clone;
}
