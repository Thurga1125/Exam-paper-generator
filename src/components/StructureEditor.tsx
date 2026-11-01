"use client";

import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { move, newPart, newQuestion, newSection } from "@/lib/structure";
import { structureTotal, uid, type StructQuestion, type StructSection, type Structure } from "@/lib/schemas";
import { sum } from "@/lib/schemas";
import { Badge, Button, Card, Field, Input, NumberInput, Select, Textarea } from "./ui";

export function StructureEditor({ value, onChange, targetMarks }: { value: Structure; onChange: (s: Structure) => void; targetMarks?: number }) {
  const total = structureTotal(value);
  const patch = (p: Partial<Structure>) => onChange({ ...value, ...p });
  const setSection = (i: number, s: StructSection) => patch({ sections: value.sections.map((x, k) => (k === i ? s : x)) });
  const mismatch = targetMarks !== undefined && Math.abs(total - targetMarks) > 1e-6;

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Structure name"><Input value={value.name} onChange={(e) => patch({ name: e.target.value })} /></Field>
          <Field label="Duration (minutes)"><NumberInput min={1} value={value.durationMinutes} onChange={(n) => patch({ durationMinutes: n })} /></Field>
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Total marks (calculated)</span>
            <div className="flex h-[38px] items-center gap-2">
              <span className="text-lg font-semibold text-navy-950">{total}</span>
              {targetMarks !== undefined && (mismatch ? <Badge tone="red">Target is {targetMarks}</Badge> : <Badge tone="green">Matches target</Badge>)}
            </div>
          </div>
        </div>
        <Field label="General instructions to candidates" hint="One instruction per line." className="mt-3">
          <Textarea className="min-h-20" value={value.instructions.join("\n")} onChange={(e) => patch({ instructions: e.target.value.split("\n") })} onBlur={() => patch({ instructions: value.instructions.map((x) => x.trim()).filter(Boolean) })} />
        </Field>
      </Card>

      {value.sections.map((sec, si) => (
        <SectionCard
          key={sec.id}
          sec={sec}
          index={si}
          count={value.sections.length}
          onChange={(s) => setSection(si, s)}
          onMove={(d) => patch({ sections: move(value.sections, si, d) })}
          onDelete={() => patch({ sections: value.sections.filter((_, k) => k !== si) })}
          onDuplicate={() =>
            patch({
              sections: [
                ...value.sections.slice(0, si + 1),
                { ...sec, id: uid(), title: sec.title + " (copy)", questions: sec.questions.map((q) => ({ ...q, id: uid(), parts: q.parts.map((p) => ({ ...p, id: uid() })) })) },
                ...value.sections.slice(si + 1),
              ],
            })
          }
        />
      ))}

      <Button variant="secondary" onClick={() => patch({ sections: [...value.sections, newSection(`Section ${String.fromCharCode(65 + value.sections.length)}`, 3, 10)] })}>
        <Plus className="h-4 w-4" />Add section
      </Button>
    </div>
  );
}

function SectionCard({
  sec, index, count, onChange, onMove, onDelete, onDuplicate,
}: {
  sec: StructSection; index: number; count: number;
  onChange: (s: StructSection) => void; onMove: (d: -1 | 1) => void; onDelete: () => void; onDuplicate: () => void;
}) {
  const patch = (p: Partial<StructSection>) => onChange({ ...sec, ...p });
  const setQ = (i: number, q: StructQuestion) => patch({ questions: sec.questions.map((x, k) => (k === i ? q : x)) });
  const marksOf = (q: StructQuestion) => (q.parts.length ? sum(q.parts.map((p) => p.marks)) : q.marks);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <span className="rounded-md bg-navy-900 px-2 py-0.5 text-xs font-semibold text-white">{index + 1}</span>
        <Input className="max-w-xs flex-1 font-medium" value={sec.title} onChange={(e) => patch({ title: e.target.value })} aria-label="Section title" />
        <span className="text-sm text-slate-500">{sec.questions.length} questions · {sum(sec.questions.map(marksOf))} marks available</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move section up"><ArrowUp className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move section down"><ArrowDown className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate} aria-label="Duplicate section"><Copy className="h-4 w-4" /></Button>
          <Button size="sm" variant="danger" disabled={count === 1} onClick={onDelete} aria-label="Delete section"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Answer rule">
            <Select value={sec.rule} onChange={(e) => patch({ rule: e.target.value as "all" | "choose", chooseCount: e.target.value === "choose" ? Math.max(1, sec.chooseCount || Math.ceil(sec.questions.length / 2)) : 0, questions: sec.questions.map((q) => ({ ...q, optional: e.target.value === "choose" })) })}>
              <option value="all">Answer all questions</option>
              <option value="choose">Choose N questions</option>
            </Select>
          </Field>
          {sec.rule === "choose" && (
            <Field label="Number to answer"><NumberInput min={1} max={sec.questions.length} value={sec.chooseCount} onChange={(n) => patch({ chooseCount: Math.max(1, Math.min(sec.questions.length, Math.round(n))) })} /></Field>
          )}
          <Field label="Question numbering">
            <Select value={sec.numberingFormat} onChange={(e) => patch({ numberingFormat: e.target.value as StructSection["numberingFormat"] })}>
              <option value="1">1, 2, 3</option><option value="Q1">Q1, Q2, Q3</option><option value="1.">1. 2. 3.</option><option value="Question 1">Question 1, Question 2</option>
            </Select>
          </Field>
          <Field label="Sub-question labels">
            <Select value={sec.partFormat} onChange={(e) => patch({ partFormat: e.target.value as StructSection["partFormat"] })}>
              <option value="(a)">(a), (b), (c)</option><option value="a)">a), b), c)</option><option value="a.">a., b., c.</option><option value="(i)">(i), (ii), (iii)</option>
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Section instructions"><Textarea className="min-h-16" value={sec.instructions} onChange={(e) => patch({ instructions: e.target.value })} /></Field>
          <Field label="Question selection rule (printed)" hint="E.g. “Question 1 is compulsory. Answer any two of the remaining.”"><Textarea className="min-h-16" value={sec.selectionNote} onChange={(e) => patch({ selectionNote: e.target.value })} /></Field>
        </div>

        <ul className="space-y-2">
          {sec.questions.map((q, qi) => (
            <QuestionRow
              key={q.id}
              q={q}
              index={qi}
              count={sec.questions.length}
              choose={sec.rule === "choose"}
              partFormat={sec.partFormat}
              onChange={(nq) => setQ(qi, nq)}
              onMove={(d) => patch({ questions: move(sec.questions, qi, d) })}
              onDelete={() => patch({ questions: sec.questions.filter((_, k) => k !== qi) })}
            />
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => patch({ questions: [...sec.questions, newQuestion(sec.questions.at(-1)?.marks ?? 10, sec.questions.at(-1)?.parts.length ?? 0, sec.rule === "choose")] })}>
            <Plus className="h-3.5 w-3.5" />Add question
          </Button>
        </div>
      </div>
    </Card>
  );
}

function QuestionRow({
  q, index, count, choose, partFormat, onChange, onMove, onDelete,
}: {
  q: StructQuestion; index: number; count: number; choose: boolean; partFormat: StructSection["partFormat"];
  onChange: (q: StructQuestion) => void; onMove: (d: -1 | 1) => void; onDelete: () => void;
}) {
  const hasParts = q.parts.length > 0;
  const label = (i: number) => {
    const l = String.fromCharCode(97 + (i % 26));
    return partFormat === "a)" ? `${l})` : partFormat === "a." ? `${l}.` : partFormat === "(i)" ? `(${["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"][i] ?? i + 1})` : `(${l})`;
  };
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-14 text-sm font-semibold text-navy-950">Q{index + 1}</span>
        {hasParts ? (
          <span className="text-sm text-slate-600">{sum(q.parts.map((p) => p.marks))} marks (from parts)</span>
        ) : (
          <label className="flex items-center gap-2 text-sm text-slate-700">Marks <NumberInput className="w-24" min={0} value={q.marks} onChange={(n) => onChange({ ...q, marks: n })} /></label>
        )}
        <Input className="w-44" placeholder="Type (e.g. scenario)" value={q.questionType} onChange={(e) => onChange({ ...q, questionType: e.target.value })} aria-label="Question type" />
        {choose && (
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={!q.optional} onChange={(e) => onChange({ ...q, optional: !e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Compulsory
          </label>
        )}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => onChange(hasParts ? { ...q, marks: sum(q.parts.map((p) => p.marks)), parts: [] } : { ...q, parts: [newPart(label(0), Math.ceil(q.marks / 2)), newPart(label(1), q.marks - Math.ceil(q.marks / 2))] })}>
            {hasParts ? "Remove parts" : "Add parts"}
          </Button>
          <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move question up"><ArrowUp className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move question down"><ArrowDown className="h-4 w-4" /></Button>
          <Button size="sm" variant="danger" disabled={count === 1} onClick={onDelete} aria-label="Delete question"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {hasParts && (
        <ul className="mt-3 space-y-2 border-l-2 border-brand-100 pl-4">
          {q.parts.map((p, pi) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <span className="w-10 text-sm font-medium text-slate-700">{label(pi)}</span>
              <NumberInput className="w-24" min={0} value={p.marks} onChange={(n) => onChange({ ...q, parts: q.parts.map((x, k) => (k === pi ? { ...x, marks: n } : x)) })} aria-label={`Marks for part ${label(pi)}`} />
              <span className="text-xs text-slate-500">marks</span>
              <Button size="sm" variant="ghost" disabled={pi === 0} onClick={() => onChange({ ...q, parts: move(q.parts, pi, -1) })} aria-label="Move part up"><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" disabled={pi === q.parts.length - 1} onClick={() => onChange({ ...q, parts: move(q.parts, pi, 1) })} aria-label="Move part down"><ArrowDown className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="danger" onClick={() => onChange(q.parts.length === 1 ? { ...q, marks: p.marks, parts: [] } : { ...q, parts: q.parts.filter((_, k) => k !== pi) })} aria-label="Delete part"><Trash2 className="h-3.5 w-3.5" /></Button>
            </li>
          ))}
          <li><Button size="sm" variant="ghost" onClick={() => onChange({ ...q, parts: [...q.parts, newPart(label(q.parts.length), 5)] })}><Plus className="h-3.5 w-3.5" />Add part</Button></li>
        </ul>
      )}
    </li>
  );
}
