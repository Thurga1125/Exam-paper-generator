import { route, json, must, HttpError } from "@/lib/api";
import { generateMarkingScheme } from "@/lib/ai/actions";
import type { PaperRow } from "@/lib/schemas";

export const maxDuration = 300;

export const POST = route<{ id: string }>(async (_req, { supabase }, { id }) => {
  const row = must(await supabase.from("papers").select("*").eq("id", id).single()) as PaperRow;
  if (!row.content) throw new HttpError(409, "Generate the paper first.");
  const scheme = await generateMarkingScheme(supabase, row, () => {});
  await supabase.from("papers").update({ marking_scheme: scheme, updated_at: new Date().toISOString() }).eq("id", id);
  return json(scheme);
});
