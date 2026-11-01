// Offline smoke test: builds sample DOCX files from a hand-written paper (no AI, no DB).
import { writeFileSync } from "node:fs";
import { buildPaperDocx, buildMarkingDocx } from "../src/lib/docx/build";
import { DEFAULT_CONFIG, uid, type Paper } from "../src/lib/schemas";

const cfg = { ...DEFAULT_CONFIG, institution: "University of Example", faculty: "Faculty of Computing", programme: "BSc (Hons) in Computer Science", yearSemester: "Year 2, Semester 1", subject: "Database Management Systems", moduleCode: "CS2012", title: "End Semester Examination 2026", totalMarks: 30, durationMinutes: 90,
  formatting: { ...DEFAULT_CONFIG.formatting, headerText: "CS2012 — DBMS", footerText: "Confidential" } };
const paper: Paper = {
  instructions: ["Answer ALL questions.", "Write clearly."],
  sections: [{ id: uid(), title: "Section A", instructions: "Answer ALL questions.", questions: [
    { id: "q1", number: "1", text: "Consider the relation $R(A,B,C)$ with $F = {A -> B}$ and the identity $x^2 + y_i = sqrt(a/b)$.\n\n| Student | Marks |\n|---|---|\n| Ann | 80 |\n| Bob | 70 |", marks: 0, type: "numerical", difficulty: "medium", topic: "Normalization", optional: false, supported: true, sourceNote: "S1", pageBreakBefore: false,
      parts: [
        { id: uid(), label: "(a)", text: "Define **third normal form**.", marks: 5, parts: [] },
        { id: uid(), label: "(b)", text: "Write SQL:\n```\nSELECT * FROM t;\n```", marks: 0, parts: [ { id: uid(), label: "(i)", text: "Select all rows.", marks: 5 }, { id: uid(), label: "(ii)", text: "Count rows.", marks: 5 } ] } ] },
    { id: "q2", number: "2", text: "Explain ACID properties.", marks: 15, type: "theory", difficulty: "easy", topic: "Transactions", optional: false, parts: [], supported: false, sourceNote: "thin", pageBreakBefore: true },
  ] }],
};
(async () => {
  writeFileSync(process.argv[2], (await buildPaperDocx(cfg, paper, null)).buffer);
  writeFileSync(process.argv[3], (await buildMarkingDocx(cfg, paper, { generalGuidelines: ["Be fair."], questions: [{ questionId: "q2", number: "2", examinerNotes: "n", parts: [{ label: "", expectedAnswer: "A C I D", modelAnswer: "Atomicity ...", marks: 15, allocation: [{ point: "Atomicity", marks: 7.5 }, { point: "Others", marks: 7.5 }], rubric: "r" }] }] })).buffer);
})();
