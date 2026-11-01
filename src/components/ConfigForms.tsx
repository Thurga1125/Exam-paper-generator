"use client";

import { useState } from "react";
import type { ExamConfig, Formatting } from "@/lib/schemas";
import { EXAM_TYPES, examTypeLabel } from "@/lib/i18n";
import { Field, Input, NumberInput, Select, Textarea } from "./ui";

const FONTS = ["Bamini", "Times New Roman", "Arial", "Calibri", "Cambria", "Georgia", "Verdana", "Garamond", "Latha", "Iskoola Pota", "Nirmala UI"];
export const QUESTION_TYPES = ["theoretical", "numerical", "practical", "scenario-based", "short answer", "multiple choice", "essay", "problem solving", "case study", "coding / SQL"];

type Patch<T> = (p: Partial<T>) => void;

export function ExamDetailsForm({ config, onChange }: { config: ExamConfig; onChange: Patch<ExamConfig> }) {
  const known = (EXAM_TYPES as readonly string[]).includes(config.examType);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="School name" className="sm:col-span-2 lg:col-span-3"><Input value={config.institution} onChange={(e) => onChange({ institution: e.target.value })} placeholder="e.g. Jaffna Hindu College" /></Field>
        <Field label="Examination">
          <Select value={known ? config.examType : "Other"} onChange={(e) => onChange({ examType: e.target.value })}>
            {EXAM_TYPES.map((t) => <option key={t} value={t}>{t === "Other" ? "Other…" : `${t} — ${examTypeLabel(t, "Tamil")}`}</option>)}
          </Select>
        </Field>
        {!known && <Field label="Examination name"><Input value={config.examType === "Other" ? "" : config.examType} onChange={(e) => onChange({ examType: e.target.value || "Other" })} /></Field>}
        <Field label="Heading (optional)" hint="Leave empty to use the examination name and year."><Input value={config.title} onChange={(e) => onChange({ title: e.target.value })} /></Field>
        <Field label="Grade"><Input value={config.programme} onChange={(e) => onChange({ programme: e.target.value })} placeholder="Grade 10" /></Field>
        <Field label="Subject"><Input value={config.subject} onChange={(e) => onChange({ subject: e.target.value })} placeholder="Music" /></Field>
        <Field label="Year / term"><Input value={config.yearSemester} onChange={(e) => onChange({ yearSemester: e.target.value })} placeholder="2026" /></Field>
        <Field label="Medium / department (optional)"><Input value={config.faculty} onChange={(e) => onChange({ faculty: e.target.value })} placeholder="Tamil Medium" /></Field>
        <Field label="Subject code (optional)"><Input value={config.moduleCode} onChange={(e) => onChange({ moduleCode: e.target.value })} /></Field>
        <Field label="Total marks"><NumberInput min={1} value={config.totalMarks} onChange={(n) => onChange({ totalMarks: n })} /></Field>
        <Field label="Duration (minutes)"><NumberInput min={1} value={config.durationMinutes} onChange={(n) => onChange({ durationMinutes: n })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={config.showStudentDetails} onChange={(e) => onChange({ showStudentDetails: e.target.checked })} />
        Add a student name / index number line
      </label>
    </div>
  );
}

export function GenerationOptionsForm({ config, onChange }: { config: ExamConfig; onChange: Patch<ExamConfig> }) {
  const mix = config.difficultyMix;
  const mixTotal = mix.easy + mix.medium + mix.hard;
  const toggle = (t: string) =>
    onChange({ questionTypes: config.questionTypes.includes(t) ? config.questionTypes.filter((x) => x !== t) : [...config.questionTypes, t] });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Difficulty level">
          <Select value={config.difficulty} onChange={(e) => onChange({ difficulty: e.target.value as ExamConfig["difficulty"] })}>
            <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="mixed">Mixed (use distribution)</option>
          </Select>
        </Field>
        <Field label="Language">
          <Select value={config.language} onChange={(e) => {
            const language = e.target.value as ExamConfig["language"];
            const f = config.formatting;
            // sensible font default per language (still fully editable under Formatting)
            const font = language === "Tamil" && /^(Times New Roman|Arial|Calibri|Cambria)$/.test(f.fontFamily) ? "Bamini"
              : language !== "Tamil" && /bamini/i.test(f.fontFamily) ? "Times New Roman" : f.fontFamily;
            onChange({ language, formatting: { ...f, fontFamily: font } });
          }}>
            <option>English</option><option>Tamil</option><option>Sinhala</option>
          </Select>
        </Field>
      </div>
      {config.difficulty === "mixed" && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Difficulty distribution (% of questions)</p>
          <div className="grid max-w-md grid-cols-3 gap-3">
            {(["easy", "medium", "hard"] as const).map((k) => (
              <label key={k} className="text-sm capitalize text-slate-700">{k}
                <NumberInput min={0} max={100} value={mix[k]} onChange={(n) => onChange({ difficultyMix: { ...mix, [k]: n } })} />
              </label>
            ))}
          </div>
          <p className={mixTotal === 100 ? "mt-1 text-xs text-slate-500" : "mt-1 text-xs text-amber-700"}>Total {mixTotal}% {mixTotal !== 100 && "— will be normalised to 100%."}</p>
        </div>
      )}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Question types to include</p>
        <div className="flex flex-wrap gap-2">
          {QUESTION_TYPES.map((t) => {
            const on = config.questionTypes.includes(t);
            return (
              <button key={t} type="button" onClick={() => toggle(t)} aria-pressed={on}
                className={on ? "rounded-full border border-brand-600 bg-brand-600 px-3 py-1 text-xs font-medium text-white" : "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"}>
                {t}
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={config.allowExternalKnowledge} onChange={(e) => onChange({ allowExternalKnowledge: e.target.checked })} />
        <span>
          <strong>Allow knowledge beyond my uploaded resources.</strong>
          <span className="block text-xs text-slate-500">Off (recommended): questions must be supported by your materials; anything weakly supported is flagged.</span>
        </span>
      </label>
    </div>
  );
}

export function FormattingForm({ value, onChange }: { value: Formatting; onChange: Patch<Formatting> }) {
  const preset = FONTS.includes(value.fontFamily);
  const [custom, setCustom] = useState(!preset);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Font family">
          <Select value={custom ? "__custom" : value.fontFamily} onChange={(e) => { if (e.target.value === "__custom") setCustom(true); else { setCustom(false); onChange({ fontFamily: e.target.value }); } }}>
            {FONTS.map((f) => <option key={f}>{f}</option>)}
            <option value="__custom">Custom font…</option>
          </Select>
        </Field>
        {value.fontFamily.toLowerCase().includes("bamini") && (
          <p className="text-xs text-slate-600 sm:col-span-2 lg:col-span-3">
            <strong>Bamini:</strong> you edit in normal Unicode Tamil; the Word/PDF export converts Tamil to Bamini automatically (English text stays in Times New Roman). The preview on screen shows Unicode Tamil. Bamini must be installed on the computer that opens the file.
          </p>
        )}
        {custom && <Field label="Custom font name" hint="Must be installed on the reader’s computer."><Input value={value.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} /></Field>}
        <Field label="Body font size (pt)"><NumberInput min={6} max={72} step={0.5} value={value.fontSize} onChange={(n) => onChange({ fontSize: n })} /></Field>
        <Field label="Heading size (pt)"><NumberInput min={6} max={72} step={0.5} value={value.headingSize} onChange={(n) => onChange({ headingSize: n })} /></Field>
        <Field label="Question size (pt)"><NumberInput min={6} max={72} step={0.5} value={value.questionSize} onChange={(n) => onChange({ questionSize: n })} /></Field>
        <Field label="Line spacing"><NumberInput min={0.8} max={3} step={0.05} value={value.lineSpacing} onChange={(n) => onChange({ lineSpacing: n })} /></Field>
        <Field label="Paragraph spacing (pt)"><NumberInput min={0} max={48} value={value.paragraphSpacing} onChange={(n) => onChange({ paragraphSpacing: n })} /></Field>
        <Field label="Question spacing (pt)"><NumberInput min={0} max={72} value={value.questionSpacing} onChange={(n) => onChange({ questionSpacing: n })} /></Field>
        <Field label="Page size">
          <Select value={value.pageSize} onChange={(e) => onChange({ pageSize: e.target.value as Formatting["pageSize"] })}><option value="A4">A4</option><option value="Letter">Letter</option></Select>
        </Field>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Page margins (cm)</p>
        <div className="grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
          {(["marginTop", "marginBottom", "marginLeft", "marginRight"] as const).map((k) => (
            <label key={k} className="text-sm text-slate-700">{k.replace("margin", "")}
              <NumberInput min={0.5} max={6} step={0.1} value={value[k]} onChange={(n) => onChange({ [k]: n })} />
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Header text"><Input value={value.headerText} onChange={(e) => onChange({ headerText: e.target.value })} placeholder="e.g. CS2012 — Database Management Systems" /></Field>
        <Field label="Footer text"><Textarea className="min-h-0" rows={1} value={value.footerText} onChange={(e) => onChange({ footerText: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {([
          ["showPageNumbers", "Page numbers"], ["boldQuestionNumbers", "Bold question numbers"],
          ["boldMarks", "Bold marks"], ["italicInstructions", "Italic instructions"],
        ] as const).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={value[k]} onChange={(e) => onChange({ [k]: e.target.checked })} />{label}
          </label>
        ))}
      </div>
    </div>
  );
}
