"use client";

import clsx from "clsx";
import { BarChart3, CheckCircle2, FileText, Pencil, RefreshCw, Search, Trash2, UploadCloud, Eye, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, formatBytes, timeAgo, useLoad } from "@/lib/client";
import type { PatternAnalysis, ResourceKind, ResourceRow } from "@/lib/schemas";
import { Badge, Button, Empty, ErrorNote, Field, Input, Modal, Select, Spinner, Textarea, useToast } from "./ui";

const LABEL: Record<ResourceKind, { one: string; many: string }> = {
  resource: { one: "resource", many: "learning resources" },
  past_paper: { one: "past paper", many: "past papers" },
  structure: { one: "structure file", many: "structure files" },
};

const EXAM_TYPES = ["", "Mid Semester", "End Semester", "Quiz", "Mock", "Supplementary", "Assignment", "Other"];

interface UploadMeta {
  title: string;
  description: string;
  subject: string;
  module: string;
  topic: string;
  academic_year: string;
  semester: string;
  exam_type: string;
  paper_year: string;
  notes: string;
}
const EMPTY_META: UploadMeta = { title: "", description: "", subject: "", module: "", topic: "", academic_year: "", semester: "", exam_type: "", paper_year: "", notes: "" };

export function Library({
  kind,
  selected,
  onSelectedChange,
  initialSubject,
}: {
  kind: ResourceKind;
  /** When provided the list shows checkboxes (used inside the wizard). */
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  initialSubject?: string;
}) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad<ResourceRow[]>(`/api/resources?kind=${kind}`);
  const [query, setQuery] = useState("");
  const [fSubject, setFSubject] = useState("");
  const [fYear, setFYear] = useState("");
  const [fSem, setFSem] = useState("");
  const [preview, setPreview] = useState<ResourceRow | null>(null);
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);

  const rows = useMemo(() => data ?? [], [data]);

  // keep the list fresh while anything is still being processed
  const anyProcessing = rows.some((r) => r.status === "processing");
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(() => void reload(), 5000);
    return () => clearInterval(t);
  }, [anyProcessing, reload]);
  const subjects = useMemo(() => [...new Set(rows.map((r) => r.subject).filter(Boolean))].sort(), [rows]);
  const years = useMemo(() => [...new Set(rows.map((r) => (kind === "past_paper" ? r.paper_year : r.academic_year)).filter(Boolean))].sort(), [rows, kind]);
  const sems = useMemo(() => [...new Set(rows.map((r) => r.semester).filter(Boolean))].sort(), [rows]);

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (q && !`${r.title} ${r.description} ${r.subject} ${r.module} ${r.topic} ${r.file_name} ${r.notes}`.toLowerCase().includes(q)) return false;
    if (fSubject && r.subject !== fSubject) return false;
    if (fYear && (kind === "past_paper" ? r.paper_year : r.academic_year) !== fYear) return false;
    if (fSem && r.semester !== fSem) return false;
    return true;
  });

  const selectable = !!onSelectedChange;
  const sel = new Set(selected ?? []);
  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange?.([...next]);
  };

  async function remove(r: ResourceRow) {
    if (!confirm(`Delete “${r.title}”? Papers that used it will lose this source.`)) return;
    setBusyId(r.id);
    try {
      await api(`/api/resources/${r.id}`, { method: "DELETE" });
      if (sel.has(r.id)) onSelectedChange?.([...sel].filter((x) => x !== r.id));
      toast("Deleted");
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function doReplace(file: File) {
    const id = replaceTarget.current;
    if (!id) return;
    setReplacing(id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api<{ ok: boolean; error?: string }>(`/api/resources/${id}/replace`, { method: "POST", body: fd });
      if (r.ok) toast("File replaced");
      else toast(r.error ?? "Processing failed", "err");
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Replace failed", "err");
    } finally {
      setReplacing(null);
    }
  }

  async function analyze(r: ResourceRow) {
    setBusyId(r.id);
    try {
      await api(`/api/resources/${r.id}/analyze`, { method: "POST" });
      toast("Pattern analysis updated");
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Analysis failed", "err");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Uploader kind={kind} initialSubject={initialSubject} onDone={async (newIds) => {
        await reload();
        if (selectable && newIds.length) onSelectedChange?.([...new Set([...(selected ?? []), ...newIds])]);
      }} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-9" placeholder={`Search ${LABEL[kind].many}…`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
        </div>
        {subjects.length > 0 && (
          <Select className="w-auto" value={fSubject} onChange={(e) => setFSubject(e.target.value)} aria-label="Filter by subject">
            <option value="">All subjects</option>
            {subjects.map((s) => <option key={s}>{s}</option>)}
          </Select>
        )}
        {years.length > 0 && (
          <Select className="w-auto" value={fYear} onChange={(e) => setFYear(e.target.value)} aria-label="Filter by year">
            <option value="">All years</option>
            {years.map((s) => <option key={s}>{s}</option>)}
          </Select>
        )}
        {sems.length > 0 && (
          <Select className="w-auto" value={fSem} onChange={(e) => setFSem(e.target.value)} aria-label="Filter by semester">
            <option value="">All semesters</option>
            {sems.map((s) => <option key={s}>{s}</option>)}
          </Select>
        )}
        {selectable && (
          <Badge tone="blue">{sel.size} selected</Badge>
        )}
      </div>

      <ErrorNote message={error} />
      {loading && !data ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Empty title={rows.length ? "Nothing matches your filters" : `No ${LABEL[kind].many} yet`}>
          {rows.length ? "Try clearing the search or filters." : "Upload files above to build your library. They are stored and can be reused in any paper."}
        </Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtered.map((r) => {
            const on = sel.has(r.id);
            return (
              <li key={r.id} className={clsx("rounded-xl border bg-white p-4 shadow-sm", on ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200")}>
                <div className="flex items-start gap-3">
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={r.status !== "ready"}
                      onChange={() => toggle(r.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
                      aria-label={`Use ${r.title}`}
                    />
                  )}
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-navy-950" title={r.title}>{r.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {r.file_name} · {formatBytes(r.size_bytes)} · {timeAgo(r.created_at)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <StatusBadge r={r} replacing={replacing === r.id} />
                      {r.subject && <Badge>{r.subject}</Badge>}
                      {r.module && <Badge>{r.module}</Badge>}
                      {r.topic && <Badge>{r.topic}</Badge>}
                      {r.paper_year && <Badge tone="blue">{r.paper_year}</Badge>}
                      {r.exam_type && <Badge tone="blue">{r.exam_type}</Badge>}
                      {r.academic_year && <Badge>{r.academic_year}</Badge>}
                      {r.semester && <Badge>{r.semester}</Badge>}
                      {kind === "past_paper" && r.analysis && <Badge tone="green">Pattern analysed</Badge>}
                    </div>
                    {r.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{r.description}</p>}
                    {r.status === "failed" && r.error && <p className="mt-2 text-xs text-red-700">{r.error}</p>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                  <Button size="sm" variant="ghost" onClick={() => setPreview(r)}><Eye className="h-3.5 w-3.5" />Preview</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" />Edit details</Button>
                  <Button size="sm" variant="ghost" loading={replacing === r.id} onClick={() => { replaceTarget.current = r.id; replaceRef.current?.click(); }}>
                    <RefreshCw className="h-3.5 w-3.5" />Replace file
                  </Button>
                  {kind === "past_paper" && r.status === "ready" && (
                    <Button size="sm" variant="ghost" loading={busyId === r.id} onClick={() => analyze(r)}>
                      <BarChart3 className="h-3.5 w-3.5" />{r.analysis ? "Re-analyse" : "Analyse pattern"}
                    </Button>
                  )}
                  <Button size="sm" variant="danger" className="ml-auto" loading={busyId === r.id && !replacing} onClick={() => remove(r)}>
                    <Trash2 className="h-3.5 w-3.5" />Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <input
        ref={replaceRef}
        type="file"
        accept=".pdf,.docx,.pptx,.txt,.md"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void doReplace(f);
        }}
      />
      {preview && <PreviewModal id={preview.id} kind={kind} onClose={() => setPreview(null)} />}
      {editing && <EditModal row={editing} kind={kind} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
    </div>
  );
}

function StatusBadge({ r, replacing }: { r: ResourceRow; replacing: boolean }) {
  if (replacing || r.status === "processing") return <Badge tone="amber">Processing…</Badge>;
  if (r.status === "failed") return <Badge tone="red"><AlertTriangle className="mr-1 h-3 w-3" />Failed</Badge>;
  return <Badge tone="green"><CheckCircle2 className="mr-1 h-3 w-3" />Ready</Badge>;
}

/* ----------------------------- uploader ----------------------------- */

function Uploader({ kind, onDone, initialSubject }: { kind: ResourceKind; onDone: (newIds: string[]) => void | Promise<void>; initialSubject?: string }) {
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [meta, setMeta] = useState<UploadMeta>({ ...EMPTY_META, subject: initialSubject ?? "" });
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const set = (k: keyof UploadMeta, v: string) => setMeta((m) => ({ ...m, [k]: v }));
  const isPaper = kind === "past_paper";
  const accept = isPaper || kind === "structure" ? ".pdf,.docx,.pptx" + (kind === "structure" ? ",.txt" : "") : ".pdf,.docx,.pptx,.txt,.md";

  function add(list: FileList | File[]) {
    setFiles((cur) => {
      const names = new Set(cur.map((f) => f.name + f.size));
      return [...cur, ...[...list].filter((f) => !names.has(f.name + f.size))];
    });
  }

  async function upload() {
    if (!files.length) return;
    setBusy(true);
    setErrors([]);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("kind", kind);
      (Object.keys(meta) as (keyof UploadMeta)[]).forEach((k) => fd.append(k, meta[k]));
      const res = await api<{ results: { file: string; resource?: ResourceRow; error?: string }[] }>("/api/resources", { method: "POST", body: fd });
      const bad = res.results.filter((r) => r.error).map((r) => `${r.file}: ${r.error}`);
      const ok = res.results.filter((r) => r.resource && !r.error);
      setErrors(bad);
      if (ok.length) toast(`${ok.length} file${ok.length > 1 ? "s" : ""} added`);
      setFiles([]);
      setMeta((m) => ({ ...EMPTY_META, subject: m.subject, module: m.module, academic_year: m.academic_year, semester: m.semester }));
      await onDone(ok.map((r) => r.resource!.id));
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Upload failed"]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        role="button"
        tabIndex={0}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          drag ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50 hover:border-brand-500 hover:bg-brand-50/50",
        )}
      >
        <UploadCloud className="mb-2 h-9 w-9 text-brand-600" />
        <p className="font-medium text-navy-950">Drag & drop {LABEL[kind].many} here, or click to browse</p>
        <p className="mt-1 text-xs text-slate-500">PDF, Word (.docx), PowerPoint (.pptx){kind !== "past_paper" ? ", text" : ""} · up to 25 MB each · text-based files only (no scans)</p>
        <input ref={input} type="file" multiple accept={accept} hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      </div>

      {files.length > 0 && (
        <div className="mt-4 space-y-4">
          <ul className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li key={f.name + f.size} className="flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700">
                {f.name} <span className="text-brand-700/60">{formatBytes(f.size)}</span>
                <button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, k) => k !== i))} className="font-bold hover:text-red-600">×</button>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={isPaper ? "Paper name" : "Title"} hint={files.length > 1 ? "Applies to a single file; otherwise file names are used." : undefined}>
              <Input value={meta.title} onChange={(e) => set("title", e.target.value)} placeholder={files.length > 1 ? "(file names)" : ""} disabled={files.length > 1} />
            </Field>
            <Field label="Subject"><Input value={meta.subject} onChange={(e) => set("subject", e.target.value)} /></Field>
            <Field label="Module"><Input value={meta.module} onChange={(e) => set("module", e.target.value)} /></Field>
            {!isPaper && <Field label="Topic"><Input value={meta.topic} onChange={(e) => set("topic", e.target.value)} /></Field>}
            {isPaper ? (
              <>
                <Field label="Paper year"><Input value={meta.paper_year} onChange={(e) => set("paper_year", e.target.value)} placeholder="2025" /></Field>
                <Field label="Examination type">
                  <Select value={meta.exam_type} onChange={(e) => set("exam_type", e.target.value)}>
                    {EXAM_TYPES.map((t) => <option key={t} value={t}>{t || "Select…"}</option>)}
                  </Select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Academic year"><Input value={meta.academic_year} onChange={(e) => set("academic_year", e.target.value)} placeholder="2025/2026" /></Field>
                <Field label="Semester"><Input value={meta.semester} onChange={(e) => set("semester", e.target.value)} placeholder="Semester 1" /></Field>
              </>
            )}
          </div>
          {isPaper ? (
            <Field label="Notes about the question patterns" hint="E.g. “Q1 is always compulsory MCQ; Section B is scenario based.” Used when analysing this paper.">
              <Textarea value={meta.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          ) : (
            <Field label="Description"><Textarea className="min-h-16" value={meta.description} onChange={(e) => set("description", e.target.value)} /></Field>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={upload} loading={busy}>{busy ? "Uploading & processing…" : `Upload ${files.length} file${files.length > 1 ? "s" : ""}`}</Button>
            {!busy && <Button variant="ghost" onClick={() => setFiles([])}>Clear</Button>}
            {busy && <span className="text-xs text-slate-500">Extracting text and indexing. Large files can take several minutes on a free AI plan — keep this tab open.</span>}
          </div>
        </div>
      )}
      {errors.length > 0 && <div className="mt-3 space-y-1">{errors.map((e) => <ErrorNote key={e} message={e} />)}</div>}
    </div>
  );
}

/* ------------------------------ modals ------------------------------ */

type Detail = ResourceRow & { text_content: string; text_truncated: boolean; url: string | null };

function PreviewModal({ id, kind, onClose }: { id: string; kind: ResourceKind; onClose: () => void }) {
  const { data, error, loading } = useLoad<Detail>(`/api/resources/${id}`);
  const [tab, setTab] = useState<"file" | "text" | "analysis">("file");
  const isPdf = data?.file_name.toLowerCase().endsWith(".pdf");
  const initial = data ? (isPdf && data.url ? "file" : "text") : tab;
  const active = data && !isPdf && tab === "file" ? "text" : tab === "file" ? initial : tab;
  return (
    <Modal title={data?.title ?? "Preview"} onClose={onClose} wide>
      {loading && <Spinner />}
      <ErrorNote message={error} />
      {data && (
        <div className="space-y-3">
          <div className="flex gap-1 border-b border-slate-200">
            {([isPdf ? ["file", "Document"] : null, ["text", "Extracted text"], kind === "past_paper" ? ["analysis", "Pattern analysis"] : null] as ([string, string] | null)[])
              .filter((x): x is [string, string] => !!x)
              .map(([k, label]) => (
                <button key={k} onClick={() => setTab(k as typeof tab)} className={clsx("-mb-px border-b-2 px-3 py-2 text-sm font-medium", active === k ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}>{label}</button>
              ))}
          </div>
          {active === "file" && data.url && <iframe src={data.url} title={data.title} className="h-[65vh] w-full rounded-lg border border-slate-200" />}
          {active === "text" && (
            <>
              <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">{data.text_content || "No text extracted."}</pre>
              {data.text_truncated && <p className="text-xs text-slate-500">Showing the first 20,000 characters of {data.char_count.toLocaleString()}.</p>}
            </>
          )}
          {active === "analysis" && <AnalysisView a={data.analysis} />}
          {data.url && !isPdf && <a href={data.url} className="text-sm text-brand-600 hover:underline" download>Download original file</a>}
        </div>
      )}
    </Modal>
  );
}

function AnalysisView({ a }: { a: PatternAnalysis | null }) {
  if (!a) return <Empty title="Not analysed yet">Click “Analyse pattern” on the card, or it will be analysed automatically when you generate a paper.</Empty>;
  const rows: [string, string | string[]][] = [
    ["Numbering", a.numberingStyle], ["Section layout", a.sectionLayout], ["Marks distribution", a.marksDistribution],
    ["Question types", a.questionTypes], ["Recurring topics", a.repeatedTopics], ["Difficulty", a.difficultyProfile],
    ["Student instructions", a.studentInstructions], ["Style notes", a.styleNotes],
    ["Total marks / duration", `${a.totalMarks || "—"} marks · ${a.durationMinutes ? a.durationMinutes + " min" : "—"}`],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-[10rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="text-sm text-slate-800">{Array.isArray(v) ? (v.length ? v.join(" · ") : "—") : v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function EditModal({ row, kind, onClose, onSaved }: { row: ResourceRow; kind: ResourceKind; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    title: row.title, description: row.description, subject: row.subject, module: row.module, topic: row.topic,
    academic_year: row.academic_year, semester: row.semester, exam_type: row.exam_type, paper_year: row.paper_year, notes: row.notes,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    try {
      await api(`/api/resources/${row.id}`, { method: "PATCH", json: f });
      toast("Saved");
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "err");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Edit details" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2"><Input value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Subject"><Input value={f.subject} onChange={(e) => set("subject", e.target.value)} /></Field>
        <Field label="Module"><Input value={f.module} onChange={(e) => set("module", e.target.value)} /></Field>
        {kind === "past_paper" ? (
          <>
            <Field label="Paper year"><Input value={f.paper_year} onChange={(e) => set("paper_year", e.target.value)} /></Field>
            <Field label="Examination type">
              <Select value={f.exam_type} onChange={(e) => set("exam_type", e.target.value)}>
                {EXAM_TYPES.map((t) => <option key={t} value={t}>{t || "Select…"}</option>)}
              </Select>
            </Field>
            <Field label="Notes about the question patterns" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
          </>
        ) : (
          <>
            <Field label="Topic"><Input value={f.topic} onChange={(e) => set("topic", e.target.value)} /></Field>
            <Field label="Academic year"><Input value={f.academic_year} onChange={(e) => set("academic_year", e.target.value)} /></Field>
            <Field label="Semester"><Input value={f.semester} onChange={(e) => set("semester", e.target.value)} /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
          </>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy} disabled={!f.title.trim()}>Save</Button>
      </div>
    </Modal>
  );
}
