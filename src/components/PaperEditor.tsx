"use client";

import clsx from "clsx";
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronUp, Download, FileDown, FilePlus2, Loader2, Plus, ScissorsLineDashed, ShieldCheck, Sparkles, Trash2, Wand2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api, download } from "@/lib/client";
import { checkPaper } from "@/lib/paper";
import { blankPart, blankQuestion, mapQuestion, moveQuestion, partLabel, renumber } from "@/lib/paperOps";
import { subPartLabel, partMarks, questionMarks, paperTotal, type ExamConfig, type MarkingScheme, type Paper, type PaperRow, type Part, type Question, type Warning } from "@/lib/schemas";
import { usePaper } from "@/lib/usePaper";
import { ExamDetailsForm, FormattingForm } from "./ConfigForms";
import { PaperPreview } from "./PaperPreview";
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, NumberInput, Select, Spinner, Textarea, useToast } from "./ui";

type Tab = "edit" | "format" | "marking" | "preview";

const AI_ACTIONS = [
  { key: "harder", label: "Make harder" },
  { key: "easier", label: "Make easier" },
  { key: "another", label: "Another on this topic" },
  { key: "scenario", label: "Convert to scenario" },
  { key: "clarify", label: "Improve clarity" },
  { key: "regenerate", label: "Regenerate this question" },
] as const;

export function PaperEditor({ id }: { id: string }) {
  const toast = useToast();
  const { paper, update, flush, saving, saveError, error, loading } = usePaper(id);
  const [tab, setTab] = useState<Tab>("edit");
  const [busyDl, setBusyDl] = useState<string | null>(null);

  const content = paper?.content ?? null;
  const live = useMemo<Warning[]>(() => (paper && content ? checkPaper(content, paper.structure, paper.config) : []), [paper, content]);
  const stored = (paper?.warnings ?? []).filter((w) => !/^(Total marks are|Question number|Question \S+ is not fully supported|Question \S+ has no marks)/.test(w.message));
  const warnings = [...live, ...stored];

  if (loading && !paper) return <Spinner />;
  if (error || !paper) return <ErrorNote message={error ?? "Paper not found"} />;
  if (!content) {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium text-navy-950">This paper has not been generated yet.</p>
        {paper.status === "failed" && paper.error && <div className="mx-auto mt-3 max-w-lg"><ErrorNote message={paper.error} /></div>}
        <Link href={`/create/${paper.id}`} className="mt-4 inline-block font-medium text-brand-600 hover:underline">Continue in the creation wizard →</Link>
      </Card>
    );
  }

  const setContent = (c: Paper, renum = false) => update({ content: renum ? renumber(c, paper.structure) : c });
  const patchConfig = (p: Partial<ExamConfig>) => update({ config: { ...paper.config, ...p } });

  async function dl(type: "paper" | "marking", format: "docx" | "pdf") {
    const key = `${type}-${format}`;
    setBusyDl(key);
    try {
      await flush();
      const notice = await download(`/api/papers/${id}/export?type=${type}&format=${format}`, `exam.${format}`);
      if (notice) toast(notice, "err");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Download failed", "err");
    } finally {
      setBusyDl(null);
    }
  }

  const totalNow = paperTotal(content, paper.structure);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Input className="max-w-xl text-lg font-semibold" value={paper.config.title || paper.title} onChange={(e) => { patchConfig({ title: e.target.value }); update({ title: e.target.value }); }} aria-label="Paper title" />
          <p className="mt-1 text-xs text-slate-500" aria-live="polite">
            Total {totalNow} / {paper.config.totalMarks} marks ·{" "}
            {saving === "saving" ? "Saving…" : saving === "dirty" ? "Unsaved changes…" : saving === "error" ? <span className="text-red-600">Save failed: {saveError}</span> : "Saved to your library"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button loading={busyDl === "paper-docx"} onClick={() => dl("paper", "docx")}><Download className="h-4 w-4" />DOCX</Button>
          <Button variant="secondary" loading={busyDl === "paper-pdf"} onClick={() => dl("paper", "pdf")}><FileDown className="h-4 w-4" />PDF</Button>
        </div>
      </div>

      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {([["edit", "Edit paper"], ["format", "Details & formatting"], ["marking", "Marking scheme"], ["preview", "Preview"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={clsx("-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium", k === "preview" && "xl:hidden", tab === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {label}
            {k === "edit" && warnings.some((w) => w.level === "error") && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500" />}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={clsx(tab === "preview" && "hidden xl:block")}>
          {tab === "edit" || tab === "preview" ? (
            <EditTab paper={paper} content={content} warnings={warnings} setContent={setContent} flush={flush} />
          ) : tab === "format" ? (
            <div className="space-y-5">
              <Card className="p-4 sm:p-5"><h2 className="mb-3 font-semibold text-navy-950">Examination details</h2><ExamDetailsForm config={paper.config} onChange={patchConfig} /></Card>
              <Card className="p-4 sm:p-5"><h2 className="mb-3 font-semibold text-navy-950">Document formatting</h2><FormattingForm value={paper.config.formatting} onChange={(p) => patchConfig({ formatting: { ...paper.config.formatting, ...p } })} /></Card>
            </div>
          ) : (
            <MarkingTab paper={paper} update={update} flush={flush} onDownload={dl} busyDl={busyDl} />
          )}
        </div>
        <div className={clsx(tab === "preview" ? "block" : "hidden xl:block")}>
          <div className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
            <PaperPreview config={paper.config} paper={content} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- edit tab ------------------------------- */

type P = PaperRow & { config: ExamConfig };

function EditTab({ paper, content, warnings, setContent, flush }: {
  paper: P; content: Paper; warnings: Warning[]; setContent: (c: Paper, renum?: boolean) => void; flush: () => Promise<void>;
}) {
  const [showWarn, setShowWarn] = useState(true);
  const setQ = (id: string, fn: (q: Question) => Question) => setContent(mapQuestion(content, id, fn));

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <button className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-amber-900" onClick={() => setShowWarn((v) => !v)}>
            <AlertTriangle className="h-4 w-4" />{warnings.length} item{warnings.length > 1 ? "s" : ""} need your attention
            {showWarn ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
          </button>
          {showWarn && (
            <ul className="space-y-1 px-4 pb-3 text-sm">
              {warnings.map((w, i) => <li key={i} className={w.level === "error" ? "text-red-700" : "text-amber-900"}>• {w.message}</li>)}
            </ul>
          )}
        </Card>
      )}

      <Card className="p-4">
        <Field label="Instructions to candidates" hint="One per line.">
          <Textarea className="min-h-24" value={content.instructions.join("\n")} onChange={(e) => setContent({ ...content, instructions: e.target.value.split("\n") })} onBlur={() => setContent({ ...content, instructions: content.instructions.map((x) => x.trim()).filter(Boolean) })} />
        </Field>
      </Card>

      {content.sections.map((s, si) => (
        <div key={s.id} className="space-y-3">
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Section title"><Input value={s.title} onChange={(e) => setContent({ ...content, sections: content.sections.map((x, k) => (k === si ? { ...x, title: e.target.value } : x)) })} /></Field>
              <Field label="Section instructions"><Input value={s.instructions} onChange={(e) => setContent({ ...content, sections: content.sections.map((x, k) => (k === si ? { ...x, instructions: e.target.value } : x)) })} /></Field>
            </div>
          </Card>
          {s.questions.map((q) => (
            <QuestionCard key={q.id} paper={paper} q={q} content={content} setQ={setQ} setContent={setContent} flush={flush} />
          ))}
          <Button size="sm" variant="secondary" onClick={() => setContent({ ...content, sections: content.sections.map((x, k) => (k === si ? { ...x, questions: [...x.questions, blankQuestion()] } : x)) }, true)}>
            <Plus className="h-3.5 w-3.5" />Add question to {s.title}
          </Button>
        </div>
      ))}
      <p className="text-xs text-slate-500">Tip: use <code>**bold**</code>, <code>*italic*</code>, <code>$x^2 + y_i$</code> for equations and Markdown pipe tables inside question text.</p>
    </div>
  );
}

function QuestionCard({ paper, q, content, setQ, setContent, flush }: {
  paper: P; q: Question; content: Paper; setQ: (id: string, fn: (q: Question) => Question) => void; setContent: (c: Paper, renum?: boolean) => void; flush: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [custom, setCustom] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [check, setCheck] = useState<null | { verdict: string; issues: string[]; suggestions: string[]; answerable: boolean; supportedBySources: boolean }>(null);
  const hasParts = q.parts.length > 0;

  async function ai(action: string, instr?: string) {
    setBusy(action);
    setMenu(false);
    setCheck(null);
    try {
      await flush();
      const r = await api<{ question?: Question; check?: typeof check; marking?: unknown }>(`/api/papers/${paper.id}/questions/${q.id}/ai`, { method: "POST", json: { action, instruction: instr } });
      if (r.question) {
        // the server already stored it; mirror it locally (without re-saving unrelated edits)
        setQ(q.id, () => ({ ...r.question!, number: q.number, pageBreakBefore: q.pageBreakBefore }));
        toast("Question updated");
      } else if (r.check) {
        setCheck(r.check);
      } else if (r.marking) {
        toast("Marking scheme created for this question — see the Marking scheme tab");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI action failed", "err");
    } finally {
      setBusy(null);
    }
  }

  const setPart = (pi: number, fn: (p: Part) => Part) => setQ(q.id, (x) => ({ ...x, parts: x.parts.map((p, k) => (k === pi ? fn(p) : p)) }));

  return (
    <Card className={clsx("p-4", busy && "opacity-90")}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-navy-900 px-2 py-0.5 text-sm font-semibold text-white">{q.number || "—"}</span>
        <Badge tone={q.difficulty === "easy" ? "green" : q.difficulty === "hard" ? "red" : "amber"}>{q.difficulty}</Badge>
        <Badge>{q.type}</Badge>
        {!q.supported && <Badge tone="red">Weak source support</Badge>}
        <span className="text-sm font-medium text-slate-700">{questionMarks(q)} marks</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <div className="relative">
            <Button size="sm" variant="secondary" onClick={() => setMenu((m) => !m)} loading={!!busy}><Sparkles className="h-3.5 w-3.5" />{busy ? "Working…" : "AI actions"}<ChevronDown className="h-3.5 w-3.5" /></Button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <ul className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  {AI_ACTIONS.map((a) => <li key={a.key}><button className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => ai(a.key)}>{a.label}</button></li>)}
                  <li><button className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => { setMenu(false); setCustom(true); }}>Rewrite with my instruction…</button></li>
                  <li className="my-1 border-t border-slate-100" />
                  <li><button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => ai("check")}><ShieldCheck className="h-4 w-4" />Check academic correctness</button></li>
                  <li><button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => ai("marking")}><Wand2 className="h-4 w-4" />Generate marking scheme</button></li>
                </ul>
              </>
            )}
          </div>
          <Button size="sm" variant="ghost" title={q.pageBreakBefore ? "Remove page break before" : "Add page break before"} aria-pressed={q.pageBreakBefore} onClick={() => setQ(q.id, (x) => ({ ...x, pageBreakBefore: !x.pageBreakBefore }))} className={q.pageBreakBefore ? "bg-brand-50 text-brand-700" : ""}><ScissorsLineDashed className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" aria-label="Move up" onClick={() => setContent(moveQuestion(content, q.id, -1), true)}><ArrowUp className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" aria-label="Move down" onClick={() => setContent(moveQuestion(content, q.id, 1), true)}><ArrowDown className="h-4 w-4" /></Button>
          <Button size="sm" variant="danger" aria-label="Delete question" onClick={() => { if (confirm(`Delete question ${q.number}?`)) setContent({ ...content, sections: content.sections.map((s) => ({ ...s, questions: s.questions.filter((x) => x.id !== q.id) })) }, true); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {busy && <p className="mb-2 flex items-center gap-2 text-xs text-brand-700"><Loader2 className="h-3.5 w-3.5 animate-spin" />Updating only this question…</p>}

      <Textarea value={q.text} onChange={(e) => setQ(q.id, (x) => ({ ...x, text: e.target.value }))} placeholder="Question text" className="min-h-20" aria-label={`Question ${q.number} text`} />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {!hasParts && <label className="flex items-center gap-2 text-sm text-slate-700">Marks <NumberInput className="w-24" min={0} value={q.marks} onChange={(n) => setQ(q.id, (x) => ({ ...x, marks: n }))} /></label>}
        <label className="flex items-center gap-2 text-sm text-slate-700">Difficulty
          <Select className="w-28" value={q.difficulty} onChange={(e) => setQ(q.id, (x) => ({ ...x, difficulty: e.target.value as Question["difficulty"] }))}><option>easy</option><option>medium</option><option>hard</option></Select>
        </label>
        <label className="flex min-w-40 flex-1 items-center gap-2 text-sm text-slate-700">Topic <Input value={q.topic} onChange={(e) => setQ(q.id, (x) => ({ ...x, topic: e.target.value }))} /></label>
      </div>

      {q.sourceNote && <p className={clsx("mt-2 text-xs", q.supported ? "text-slate-500" : "text-red-700")}>Sources: {q.sourceNote}</p>}

      {hasParts && (
        <ul className="mt-3 space-y-3 border-l-2 border-brand-100 pl-3">
          {q.parts.map((p, pi) => (
            <li key={p.id} className="space-y-2">
              <div className="flex items-start gap-2">
                <Input className="w-16 text-center" value={p.label} onChange={(e) => setPart(pi, (x) => ({ ...x, label: e.target.value }))} aria-label="Part label" />
                <Textarea className="min-h-16 flex-1" value={p.text} onChange={(e) => setPart(pi, (x) => ({ ...x, text: e.target.value }))} aria-label={`Part ${p.label} text`} />
                <div className="w-24 shrink-0">
                  {p.parts.length ? <p className="pt-2 text-center text-sm text-slate-600">{partMarks(p)} marks</p> : <NumberInput min={0} value={p.marks} onChange={(n) => setPart(pi, (x) => ({ ...x, marks: n }))} aria-label={`Marks for ${p.label}`} />}
                </div>
                <Button size="sm" variant="danger" aria-label="Delete part" onClick={() => setQ(q.id, (x) => ({ ...x, parts: x.parts.filter((_, k) => k !== pi).map((pp, k) => ({ ...pp, label: pp.label === partLabel(k + 1) ? partLabel(k) : pp.label })), marks: x.parts.length === 1 ? p.marks : x.marks }))}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              {p.parts.length > 0 && (
                <ul className="ml-10 space-y-2 border-l-2 border-slate-100 pl-3">
                  {p.parts.map((s, si) => (
                    <li key={s.id} className="flex items-start gap-2">
                      <Input className="w-16 text-center" value={s.label} onChange={(e) => setPart(pi, (x) => ({ ...x, parts: x.parts.map((y, k) => (k === si ? { ...y, label: e.target.value } : y)) }))} aria-label="Sub-part label" />
                      <Textarea className="min-h-12 flex-1" value={s.text} onChange={(e) => setPart(pi, (x) => ({ ...x, parts: x.parts.map((y, k) => (k === si ? { ...y, text: e.target.value } : y)) }))} />
                      <NumberInput className="w-20" min={0} value={s.marks} onChange={(n) => setPart(pi, (x) => ({ ...x, parts: x.parts.map((y, k) => (k === si ? { ...y, marks: n } : y)) }))} aria-label="Sub-part marks" />
                      <Button size="sm" variant="danger" aria-label="Delete sub-part" onClick={() => setPart(pi, (x) => ({ ...x, parts: x.parts.filter((_, k) => k !== si), marks: x.parts.length === 1 ? s.marks : x.marks }))}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </li>
                  ))}
                </ul>
              )}
              <Button size="sm" variant="ghost" className="ml-10" onClick={() => setPart(pi, (x) => ({ ...x, marks: x.parts.length ? x.marks : 0, parts: [...x.parts, { id: crypto.randomUUID(), label: subPartLabel(x.parts.length), text: "", marks: x.parts.length ? 2 : x.marks }] }))}>
                <Plus className="h-3.5 w-3.5" />Add sub-part
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2">
        <Button size="sm" variant="ghost" onClick={() => setQ(q.id, (x) => ({ ...x, parts: [...x.parts, blankPart(partLabel(x.parts.length), x.parts.length ? 5 : x.marks)], marks: 0 }))}><FilePlus2 className="h-3.5 w-3.5" />Add part</Button>
      </div>

      {check && (
        <div className={clsx("mt-3 rounded-lg border p-3 text-sm", check.verdict === "sound" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
          <p className="font-medium">{check.verdict === "sound" ? "No academic problems found." : "Needs attention"}{!check.supportedBySources && " · Not fully supported by your resources."}{!check.answerable && " · May not be answerable as written."}</p>
          {check.issues.length > 0 && <ul className="mt-1 list-disc pl-5">{check.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {check.suggestions.length > 0 && <><p className="mt-2 font-medium">Suggestions</p><ul className="list-disc pl-5">{check.suggestions.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          <button className="mt-2 text-xs underline" onClick={() => setCheck(null)}>Dismiss</button>
        </div>
      )}

      {custom && (
        <Modal title={`Rewrite question ${q.number}`} onClose={() => setCustom(false)}>
          <Field label="What should change?" hint="Only this question is rewritten.">
            <Textarea autoFocus value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="E.g. Use a banking example and ask for the SQL query as well." />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCustom(false)}>Cancel</Button>
            <Button disabled={!instruction.trim()} onClick={() => { setCustom(false); void ai("custom", instruction); setInstruction(""); }}>Rewrite</Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

/* ----------------------------- marking scheme ----------------------------- */

function MarkingTab({ paper, update, flush, onDownload, busyDl }: {
  paper: P; update: (p: Partial<PaperRow>) => void; flush: () => Promise<void>; onDownload: (t: "paper" | "marking", f: "docx" | "pdf") => void; busyDl: string | null;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const scheme = paper.marking_scheme;
  const questions = paper.content?.sections.flatMap((s) => s.questions) ?? [];
  const missing = scheme ? questions.filter((q) => !scheme.questions.some((m) => m.questionId === q.id)) : questions;

  async function generate() {
    setBusy(true);
    try {
      await flush();
      const s = await api<MarkingScheme>(`/api/papers/${paper.id}/marking`, { method: "POST" });
      update({ marking_scheme: s });
      toast("Marking scheme generated");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Generation failed", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="mb-3 text-sm text-slate-600">A separate, examiner-only document with expected answers, model answers, mark allocations, rubrics and guidelines. It is generated from your resources and kept apart from the question paper.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={generate} loading={busy}><Wand2 className="h-4 w-4" />{scheme ? "Regenerate whole marking scheme" : "Generate marking scheme"}</Button>
          {scheme && <Button variant="secondary" loading={busyDl === "marking-docx"} onClick={() => onDownload("marking", "docx")}><Download className="h-4 w-4" />DOCX</Button>}
          {scheme && <Button variant="secondary" loading={busyDl === "marking-pdf"} onClick={() => onDownload("marking", "pdf")}><FileDown className="h-4 w-4" />PDF</Button>}
        </div>
        {busy && <p className="mt-3 text-xs text-slate-500">Writing model answers for {questions.length} questions — this can take a couple of minutes.</p>}
        {scheme && missing.length > 0 && <p className="mt-3 text-xs text-amber-700">{missing.length} question(s) have no marking entry yet (new or changed). Use “Generate marking scheme” in the question’s AI menu, or regenerate everything.</p>}
      </Card>

      {scheme && (
        <>
          {scheme.generalGuidelines.length > 0 && (
            <Card className="p-4"><h3 className="mb-2 font-semibold text-navy-950">Examiner guidelines</h3><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{scheme.generalGuidelines.map((g, i) => <li key={i}>{g}</li>)}</ul></Card>
          )}
          {questions.map((q) => {
            const m = scheme.questions.find((x) => x.questionId === q.id);
            if (!m) return null;
            return (
              <Card key={q.id} className="p-4">
                <h3 className="mb-2 font-semibold text-navy-950">Question {q.number} <span className="font-normal text-slate-500">· {questionMarks(q)} marks</span></h3>
                <div className="space-y-3">
                  {m.parts.map((p, i) => (
                    <div key={i} className="rounded-lg bg-slate-50 p-3 text-sm">
                      <p className="font-medium">{p.label || "Answer"} <span className="text-slate-500">({p.marks} marks)</span></p>
                      <p className="mt-1 whitespace-pre-wrap"><strong>Expected:</strong> {p.expectedAnswer}</p>
                      <p className="mt-1 whitespace-pre-wrap"><strong>Model answer:</strong> {p.modelAnswer}</p>
                      <ul className="mt-1 list-disc pl-5">{p.allocation.map((a, k) => <li key={k}>{a.point} <span className="text-slate-500">({a.marks})</span></li>)}</ul>
                      {p.rubric && <p className="mt-1 text-slate-600"><strong>Rubric:</strong> {p.rubric}</p>}
                    </div>
                  ))}
                  {m.examinerNotes && <p className="text-xs italic text-slate-600">Examiner notes: {m.examinerNotes}</p>}
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
