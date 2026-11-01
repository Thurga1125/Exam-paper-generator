"use client";

import clsx from "clsx";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useLoad } from "@/lib/client";
import { usePaper } from "@/lib/usePaper";
import { emptyStructure, fitStructureToTotal } from "@/lib/structure";
import { structureTotal, type ExamConfig, type PaperRow, type ResourceRow, type Structure } from "@/lib/schemas";
import { ExamDetailsForm, FormattingForm, GenerationOptionsForm } from "./ConfigForms";
import { Library } from "./Library";
import { StructureEditor } from "./StructureEditor";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Spinner, Textarea, useToast } from "./ui";

const STEPS = [
  { key: "resources", label: "Learning resources" },
  { key: "past", label: "Past papers" },
  { key: "structure", label: "Paper structure" },
  { key: "prompt", label: "AI prompt" },
  { key: "config", label: "Exam & formatting" },
  { key: "generate", label: "Generate" },
] as const;

export function Wizard({ id }: { id: string }) {
  const { paper, update, flush, saving, saveError, error, loading } = usePaper(id);
  const [step, setStep] = useState(0);

  if (loading && !paper) return <Spinner />;
  if (error || !paper) return <ErrorNote message={error ?? "Paper not found"} />;

  const patchConfig = (p: Partial<ExamConfig>) => update({ config: { ...paper.config, ...p } });
  const go = async (n: number) => {
    await flush();
    setStep(Math.max(0, Math.min(STEPS.length - 1, n)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-950">{paper.config.title || paper.config.subject || "New examination paper"}</h1>
          <p className="text-sm text-slate-500">Step {step + 1} of {STEPS.length} · {STEPS[step].label}</p>
        </div>
        <span className="text-xs text-slate-500" aria-live="polite">
          {saving === "saving" ? "Saving…" : saving === "dirty" ? "Unsaved changes…" : saving === "error" ? <span className="text-red-600">Save failed: {saveError}</span> : "All changes saved"}
        </span>
      </div>

      <ol className="mb-6 flex gap-1 overflow-x-auto pb-1" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className="min-w-fit flex-1">
            <button
              onClick={() => go(i)}
              aria-current={i === step ? "step" : undefined}
              className={clsx(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium",
                i === step ? "border-brand-600 bg-brand-600 text-white" : i < step ? "border-brand-200 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              <span className={clsx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs", i === step ? "bg-white/20" : "bg-slate-200/70")}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">Upload new files or tick previously uploaded ones. The AI will only use the files you select here.</p>
          <Library kind="resource" selected={paper.resource_ids} onSelectedChange={(ids) => update({ resource_ids: ids })} initialSubject={paper.config.subject} />
          <Card className="p-4">
            <Field label="Additional information about these resources" hint="E.g. which chapters are examinable, the learning outcomes, what was taught in depth vs. briefly.">
              <Textarea value={paper.config.resourceNotes} onChange={(e) => patchConfig({ resourceNotes: e.target.value })} />
            </Field>
          </Card>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <p className="text-sm text-slate-600">Optional but recommended. Tick the past papers whose pattern, difficulty and style the new paper should follow. Their questions are never copied.</p>
          <Library kind="past_paper" selected={paper.past_paper_ids} onSelectedChange={(ids) => update({ past_paper_ids: ids })} initialSubject={paper.config.subject} />
        </div>
      )}

      {step === 2 && <StructureStep paper={paper} update={update} />}

      {step === 3 && <PromptStep paper={paper} update={update} patchConfig={patchConfig} />}

      {step === 4 && (
        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 font-semibold text-navy-950">Examination details</h2>
            <ExamDetailsForm config={paper.config} onChange={patchConfig} />
          </Card>
          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 font-semibold text-navy-950">Document formatting</h2>
            <FormattingForm value={paper.config.formatting} onChange={(p) => patchConfig({ formatting: { ...paper.config.formatting, ...p } })} />
          </Card>
        </div>
      )}

      {step === 5 && <GenerateStep paper={paper} flush={flush} update={update} />}

      <div className="mt-8 flex justify-between border-t border-slate-200 pt-4">
        <Button variant="secondary" disabled={step === 0} onClick={() => go(step - 1)}><ChevronLeft className="h-4 w-4" />Back</Button>
        {step < STEPS.length - 1 && <Button onClick={() => go(step + 1)}>Next<ChevronRight className="h-4 w-4" /></Button>}
      </div>
    </div>
  );
}

/* --------------------------- step 3: structure --------------------------- */

interface SavedStructure { id: string; name: string; data: Structure }

function StructureStep({ paper, update }: { paper: PaperRow & { config: ExamConfig }; update: (p: Partial<PaperRow>) => void }) {
  const toast = useToast();
  const saved = useLoad<SavedStructure[]>("/api/structures");
  const files = useLoad<ResourceRow[]>("/api/resources?kind=structure");
  const [busy, setBusy] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const s = paper.structure;

  async function run<T>(key: string, fn: () => Promise<T>, then: (r: T) => void) {
    setBusy(key);
    try {
      then(await fn());
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "err");
    } finally {
      setBusy(null);
    }
  }

  const setStructure = (st: Structure) => update({ structure: { ...st, totalMarks: structureTotal(st) } });

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <h2 className="font-semibold text-navy-950">Start from</h2>
        <p className="mb-3 text-sm text-slate-600">Build the blueprint manually, import it from an uploaded paper/template, reuse a saved one, or let the AI propose one from your settings and past papers.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setStructure({ ...emptyStructure(), durationMinutes: paper.config.durationMinutes })}>Blank structure</Button>
          <Button variant="secondary" loading={busy === "suggest"} onClick={() => run("suggest", () => api<Structure>("/api/structures/suggest", { method: "POST", json: { paperId: paper.id } }), (st) => { setStructure(st); toast("Structure proposed — review and adjust it below"); })}>
            <Sparkles className="h-4 w-4" />Suggest with AI
          </Button>
          <Button variant="secondary" onClick={() => setShowUpload((v) => !v)}>{showUpload ? "Hide" : "Upload / import from a file"}</Button>
        </div>

        {showUpload && (
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            {(files.data ?? []).length > 0 && (
              <ul className="space-y-2">
                {files.data!.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <span className="truncate text-sm">{f.title} <span className="text-slate-400">· {f.file_name}</span></span>
                    <Button size="sm" disabled={f.status !== "ready"} loading={busy === f.id} onClick={() => run(f.id, () => api<Structure>("/api/structures/import", { method: "POST", json: { resourceId: f.id } }), (st) => { setStructure(st); toast("Structure imported — please review it"); })}>
                      Import structure
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Library kind="structure" />
          </div>
        )}

        {(saved.data ?? []).length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Saved structures</p>
            <ul className="flex flex-wrap gap-2">
              {saved.data!.map((x) => (
                <li key={x.id} className="flex items-center overflow-hidden rounded-lg border border-slate-200 text-sm">
                  <button className="px-3 py-1.5 hover:bg-brand-50" onClick={() => setStructure(structuredClone(x.data))}>{x.name}</button>
                  <button aria-label={`Delete ${x.name}`} className="border-l border-slate-200 px-2 py-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={async () => { if (confirm(`Delete saved structure “${x.name}”?`)) { await api(`/api/structures/${x.id}`, { method: "DELETE" }); await saved.reload(); } }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {s ? (
        <>
          <StructureEditor value={s} onChange={setStructure} targetMarks={paper.config.totalMarks} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" loading={busy === "save"} onClick={() => run("save", () => api("/api/structures", { method: "POST", json: { data: s } }), async () => { toast("Saved as a reusable structure"); await saved.reload(); })}>Save as reusable structure</Button>
            {Math.abs(structureTotal(s) - paper.config.totalMarks) > 1e-6 && (
              <Button variant="ghost" onClick={() => update({ config: { ...paper.config, totalMarks: structureTotal(s) }, structure: { ...s, totalMarks: structureTotal(s) } })}>
                Set exam total marks to {structureTotal(s)}
              </Button>
            )}
          </div>
        </>
      ) : (
        <Empty title="No structure yet">Choose how to start above. A structure is required to generate a paper.</Empty>
      )}
    </div>
  );
}

/* ----------------------------- step 4: prompt ----------------------------- */

interface SavedPrompt { id: string; title: string; body: string }

const PROMPT_PLACEHOLDER =
  "Prepare a second-year undergraduate examination paper for Database Management Systems. Follow the uploaded paper structure. Use the lecture notes as the primary knowledge source and follow the style of the past papers. Include SQL queries, normalization, ER diagrams and transaction management. Create a balanced paper with easy, medium and difficult questions. Do not copy questions from previous papers.";

function PromptStep({ paper, update, patchConfig }: { paper: PaperRow & { config: ExamConfig }; update: (p: Partial<PaperRow>) => void; patchConfig: (p: Partial<ExamConfig>) => void }) {
  const toast = useToast();
  const prompts = useLoad<SavedPrompt[]>("/api/prompts");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api("/api/prompts", { method: "POST", json: { title: title.trim(), body: paper.prompt } });
      setTitle("");
      toast("Prompt saved");
      await prompts.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <Field label="Your instructions to the AI" hint="This is combined with your resources, the paper structure and the past-paper analysis.">
          <Textarea className="min-h-56 text-[15px] leading-relaxed" value={paper.prompt} onChange={(e) => update({ prompt: e.target.value })} placeholder={PROMPT_PLACEHOLDER} />
        </Field>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Save as reusable prompt" className="min-w-52 flex-1"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Prompt name" /></Field>
          <Button variant="secondary" loading={saving} disabled={!title.trim() || !paper.prompt.trim()} onClick={save}>Save prompt</Button>
        </div>
        {(prompts.data ?? []).length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Saved prompts</p>
            <ul className="space-y-1.5">
              {prompts.data!.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.title}</p><p className="truncate text-xs text-slate-500">{p.body}</p></div>
                  <Button size="sm" variant="secondary" onClick={() => update({ prompt: p.body })}>Use</Button>
                  <Button size="sm" variant="ghost" onClick={() => update({ prompt: paper.prompt ? paper.prompt + "\n\n" + p.body : p.body })}>Append</Button>
                  <button aria-label={`Delete ${p.title}`} className="p-1 text-slate-400 hover:text-red-600" onClick={async () => { await api(`/api/prompts/${p.id}`, { method: "DELETE" }); await prompts.reload(); }}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 font-semibold text-navy-950">Scope & emphasis</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Topics to include" hint="One per line or comma-separated. Leave empty for the whole selected syllabus."><Textarea className="min-h-24" value={paper.config.includeTopics} onChange={(e) => patchConfig({ includeTopics: e.target.value })} /></Field>
          <Field label="Topics to exclude"><Textarea className="min-h-24" value={paper.config.excludeTopics} onChange={(e) => patchConfig({ excludeTopics: e.target.value })} /></Field>
          <Field label="Additional instructions" className="sm:col-span-2"><Textarea className="min-h-20" value={paper.config.additionalInstructions} onChange={(e) => patchConfig({ additionalInstructions: e.target.value })} placeholder="E.g. calculators are not allowed; answers must be in the booklet provided." /></Field>
        </div>
        <div className="mt-5 border-t border-slate-100 pt-4">
          <GenerationOptionsForm config={paper.config} onChange={patchConfig} />
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------- step 6: generate ---------------------------- */

function GenerateStep({ paper, flush, update }: { paper: PaperRow & { config: ExamConfig }; flush: () => Promise<void>; update: (p: Partial<PaperRow>) => void }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const st = paper.structure;
  const total = st ? structureTotal(st) : 0;
  const mismatch = !!st && Math.abs(total - paper.config.totalMarks) > 1e-6;
  const checks: { ok: boolean; warn?: boolean; text: string }[] = [
    { ok: paper.resource_ids.length > 0, warn: true, text: paper.resource_ids.length ? `${paper.resource_ids.length} learning resource(s) selected` : "No learning resources selected — questions will come from the subject and your prompt only and will be flagged for you to verify" },
    { ok: paper.past_paper_ids.length > 0, warn: true, text: `${paper.past_paper_ids.length} past paper(s) selected${paper.past_paper_ids.length ? "" : " (optional, but improves style matching)"}` },
    { ok: !!st?.sections.length, text: st ? `Structure: ${st.sections.length} section(s), ${total} marks` : "No paper structure defined — go back to step 3" },
    { ok: !mismatch, warn: true, text: mismatch ? `Structure total (${total}) differs from the exam total (${paper.config.totalMarks}) — marks will be adjusted automatically` : `Structure total matches the exam total (${paper.config.totalMarks})` },
    { ok: !!(paper.prompt.trim() || paper.config.subject.trim()), text: "Add a subject name (step 5) or a custom prompt (step 4)" },
  ];
  // only things the app cannot work around block generation
  const blocking = checks.some((c) => !c.ok && !c.warn);

  async function generate() {
    setRunning(true);
    setError(null);
    setProgress(2);
    setLog([]);
    setMessage("Starting…");
    try {
      if (st && mismatch) {
        // fix the marks automatically so the paper adds up to the exam total
        let fitted = fitStructureToTotal(st, paper.config.totalMarks);
        let cfg = paper.config;
        if (Math.abs(structureTotal(fitted) - cfg.totalMarks) > 1e-6) cfg = { ...cfg, totalMarks: structureTotal(fitted) };
        fitted = { ...fitted, totalMarks: structureTotal(fitted) };
        update({ structure: fitted, config: cfg });
        setMessage(`Adjusted structure marks to total ${cfg.totalMarks}…`);
      }
      await flush();
      const res = await fetch(`/api/papers/${paper.id}/generate`, { method: "POST" });
      if (!res.ok || !res.body) {
        let msg = `Generation failed (${res.status})`;
        try { msg = (await res.json()).error ?? msg; } catch {}
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "progress") {
            setProgress(ev.progress);
            setMessage(ev.message);
            setLog((l) => [...l, ev.message]);
          } else if (ev.type === "error") throw new Error(ev.message);
          else if (ev.type === "done") finished = true;
        }
      }
      if (!finished) throw new Error("The connection closed before generation finished. Open the paper to check whether it completed.");
      setProgress(100);
      router.push(`/papers/${paper.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 font-semibold text-navy-950">Ready to generate?</h2>
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.text} className="flex items-start gap-2 text-sm">
              {c.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className={clsx("mt-0.5 h-4 w-4 shrink-0", c.warn ? "text-amber-500" : "text-red-600")} />}
              <span className={c.ok ? "text-slate-700" : c.warn ? "text-amber-800" : "text-red-700"}>{c.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <Badge tone="blue">{paper.config.language}</Badge>
          <Badge tone="blue">{paper.config.difficulty === "mixed" ? `Mixed ${paper.config.difficultyMix.easy}/${paper.config.difficultyMix.medium}/${paper.config.difficultyMix.hard}` : paper.config.difficulty}</Badge>
          <Badge>{paper.config.formatting.fontFamily} {paper.config.formatting.fontSize}pt · {paper.config.formatting.pageSize}</Badge>
          {!paper.config.allowExternalKnowledge && <Badge tone="green">Sources only</Badge>}
        </div>
      </Card>

      {running ? (
        <Card className="p-5">
          <div className="mb-2 flex justify-between text-sm"><span className="font-medium text-navy-950">{message}</span><span className="text-slate-500">{progress}%</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${progress}%` }} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} /></div>
          <ul className="mt-4 space-y-1 text-xs text-slate-500">{log.slice(-6).map((l, i) => <li key={i}>✓ {l}</li>)}</ul>
          <p className="mt-3 text-xs text-slate-500">This can take a few minutes. Keep this tab open.</p>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={generate} disabled={blocking} className="px-6 py-2.5"><Sparkles className="h-4 w-4" />Generate Examination Paper</Button>
          {paper.content && <Link href={`/papers/${paper.id}`} className="text-sm font-medium text-brand-600 hover:underline">Open the existing generated paper</Link>}
          {paper.content && <span className="text-xs text-amber-700">Generating again replaces the current paper and its edits.</span>}
        </div>
      )}
      <ErrorNote message={error ?? (paper.status === "failed" && !running ? paper.error : null)} />
    </div>
  );
}
