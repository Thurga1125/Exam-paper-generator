"use client";

import { FileText, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, timeAgo } from "@/lib/client";
import type { ExamConfig } from "@/lib/schemas";
import { Badge, Button, useToast } from "./ui";

export interface PaperSummary {
  id: string;
  title: string;
  status: "draft" | "generating" | "ready" | "failed";
  config: ExamConfig;
  updated_at: string;
  has_content: boolean;
  has_marking: boolean;
}

const TONE = { draft: "slate", generating: "amber", ready: "green", failed: "red" } as const;

export function PaperList({ papers, onChanged, compact }: { papers: PaperSummary[]; onChanged?: () => void; compact?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(p: PaperSummary) {
    if (!confirm(`Delete “${p.config?.title || p.title}” permanently?`)) return;
    setBusy(p.id);
    try {
      await api(`/api/papers/${p.id}`, { method: "DELETE" });
      toast("Paper deleted");
      onChanged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {papers.map((p) => {
        const href = p.has_content ? `/papers/${p.id}` : `/create/${p.id}`;
        return (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <FileText className="h-5 w-5 shrink-0 text-brand-600" />
            <div className="min-w-0 flex-1">
              <Link href={href} className="block truncate font-medium text-navy-950 hover:text-brand-700">{p.config?.title || p.title}</Link>
              <p className="truncate text-xs text-slate-500">{[p.config?.subject, p.config?.moduleCode, p.config?.examType].filter(Boolean).join(" · ") || "No details yet"} · edited {timeAgo(p.updated_at)}</p>
            </div>
            <Badge tone={TONE[p.status]}>{p.status === "ready" ? "Generated" : p.status === "draft" ? "Draft" : p.status === "generating" ? "Generating" : "Failed"}</Badge>
            {p.has_marking && <Badge tone="blue">Marking scheme</Badge>}
            {!compact && (
              <div className="flex gap-1">
                <Link href={href}><Button size="sm" variant="secondary"><Pencil className="h-3.5 w-3.5" />{p.has_content ? "Open & edit" : "Continue"}</Button></Link>
                <Button size="sm" variant="danger" aria-label="Delete paper" loading={busy === p.id} onClick={() => remove(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
