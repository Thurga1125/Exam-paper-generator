"use client";

import { FileText, FolderOpen, LayoutTemplate, LibraryBig, PlusCircle } from "lucide-react";
import Link from "next/link";
import { PaperList, type PaperSummary } from "@/components/PaperList";
import { Badge, Card, Empty, PageHeader, Spinner } from "@/components/ui";
import { timeAgo, useLoad } from "@/lib/client";
import type { ResourceRow } from "@/lib/schemas";

export default function Dashboard() {
  const papers = useLoad<PaperSummary[]>("/api/papers");
  const resources = useLoad<ResourceRow[]>("/api/resources");

  const all = resources.data ?? [];
  const count = (k: string) => all.filter((r) => r.kind === k).length;
  const recentFiles = all.filter((r) => r.kind !== "structure").slice(0, 6);
  const generated = (papers.data ?? []).filter((p) => p.has_content).length;

  const tiles = [
    { href: "/create", label: "Create New Examination Paper", sub: "Start the step-by-step workspace", icon: PlusCircle, primary: true },
    { href: "/resources", label: "My Resources", sub: `${count("resource")} files`, icon: FolderOpen },
    { href: "/past-papers", label: "Past Papers Library", sub: `${count("past_paper")} papers`, icon: LibraryBig },
    { href: "/structures", label: "Structures & Templates", sub: "Reusable paper blueprints", icon: LayoutTemplate },
    { href: "/papers", label: "Generated Papers", sub: `${generated} papers`, icon: FileText },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Turn your own teaching materials into a professionally formatted examination paper." />
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className={t.primary ? "rounded-xl bg-brand-600 p-4 text-white shadow-sm hover:bg-brand-700" : "rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-200 hover:bg-brand-50/40"}>
            <t.icon className={t.primary ? "h-6 w-6" : "h-6 w-6 text-brand-600"} />
            <p className="mt-3 font-semibold">{t.label}</p>
            <p className={t.primary ? "text-sm text-blue-100" : "text-sm text-slate-500"}>{t.sub}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-navy-950">Recent papers</h2><Link href="/papers" className="text-sm text-brand-600 hover:underline">View all</Link></div>
          {papers.loading && !papers.data ? <Spinner /> : papers.data?.length ? <PaperList papers={papers.data.slice(0, 6)} compact /> : <Empty title="No papers yet">Create one to get started.</Empty>}
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-navy-950">Recently uploaded</h2><Link href="/resources" className="text-sm text-brand-600 hover:underline">Open library</Link></div>
          {resources.loading && !resources.data ? <Spinner /> : recentFiles.length ? (
            <Card className="divide-y divide-slate-100">
              {recentFiles.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.title}</p><p className="truncate text-xs text-slate-500">{r.kind === "past_paper" ? "Past paper" : "Resource"} · {timeAgo(r.created_at)}</p></div>
                  <Badge tone={r.status === "ready" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                </div>
              ))}
            </Card>
          ) : <Empty title="No uploads yet">Add lecture notes and past papers to begin.</Empty>}
        </section>
      </div>
    </>
  );
}
