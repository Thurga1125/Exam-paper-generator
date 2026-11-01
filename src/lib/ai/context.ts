import type { SupabaseClient } from "@supabase/supabase-js";
import type { PatternAnalysis, ResourceRow } from "../schemas";
import { analyzePastPaper, describeAnalysis } from "./analysis";

export interface PaperContext {
  titles: Map<string, string>;
  resourceIds: string[];
  pastTexts: string[]; // full text of selected past papers (for the copy check)
  patternText: string; // human-readable summary of the analysed patterns
  analyses: PatternAnalysis[];
}

/** Loads the selected resources and (lazily) analyses the selected past papers. */
export async function loadContext(
  supabase: SupabaseClient,
  resourceIds: string[],
  pastPaperIds: string[],
  onAnalyze?: (title: string) => void,
): Promise<PaperContext> {
  const ids = [...new Set([...resourceIds, ...pastPaperIds])];
  const { data, error } = ids.length
    ? await supabase.from("resources").select("*, text_content").in("id", ids)
    : { data: [], error: null };
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (ResourceRow & { text_content: string })[];

  const titles = new Map(rows.map((r) => [r.id, r.title]));
  const notReady = rows.filter((r) => r.status !== "ready");
  if (notReady.length) {
    throw new Error(
      `These files are not ready yet: ${notReady.map((r) => r.title).join(", ")}. Remove them or wait for processing to finish.`,
    );
  }

  const analyses: PatternAnalysis[] = [];
  const pastTexts: string[] = [];
  const blocks: string[] = [];
  for (const id of pastPaperIds) {
    const r = rows.find((x) => x.id === id);
    if (!r) continue;
    pastTexts.push(r.text_content);
    let a = r.analysis;
    if (!a) {
      onAnalyze?.(r.title);
      a = await analyzePastPaper({
        text: r.text_content,
        title: r.title,
        examType: r.exam_type,
        year: r.paper_year,
        notes: r.notes,
      });
      await supabase.from("resources").update({ analysis: a }).eq("id", r.id);
    }
    analyses.push(a);
    blocks.push(describeAnalysis(a, r.title) + (r.notes ? `\n- User notes: ${r.notes}` : ""));
  }

  return {
    titles,
    resourceIds,
    pastTexts,
    patternText: blocks.join("\n\n"),
    analyses,
  };
}

/* ---------- originality check: shingle overlap with past papers ---------- */

const words = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

function shingles(t: string, n = 6): Set<string> {
  const w = words(t);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

export function buildPastIndex(pastTexts: string[]): Set<string> {
  const idx = new Set<string>();
  for (const t of pastTexts) for (const s of shingles(t)) idx.add(s);
  return idx;
}

/** Fraction (0..1) of the text's 6-word shingles that also occur in a past paper. */
export function overlapWithPast(text: string, index: Set<string>): number {
  if (!index.size) return 0;
  const s = shingles(text);
  if (!s.size) return 0;
  let hit = 0;
  for (const x of s) if (index.has(x)) hit++;
  return hit / s.size;
}
