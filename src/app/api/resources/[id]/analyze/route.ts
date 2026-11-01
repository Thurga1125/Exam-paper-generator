import { route, json, must, HttpError } from "@/lib/api";
import { analyzePastPaper } from "@/lib/ai/analysis";

export const maxDuration = 120;

/** Analyse (or re-analyse) the pattern of a past paper and cache the result. */
export const POST = route<{ id: string }>(async (_req, { supabase }, { id }) => {
  const r = must(await supabase.from("resources").select("*").eq("id", id).single());
  if (r.status !== "ready") throw new HttpError(409, "This file has not been processed successfully.");
  const analysis = await analyzePastPaper({
    text: r.text_content,
    title: r.title,
    examType: r.exam_type,
    year: r.paper_year,
    notes: r.notes,
  });
  await supabase.from("resources").update({ analysis }).eq("id", id);
  return json(analysis);
});
