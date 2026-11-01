import { z } from "zod";
import { route, json, body, must } from "@/lib/api";
import { suggestStructure } from "@/lib/ai/analysis";
import { loadContext } from "@/lib/ai/context";
import { normalizeConfig, type PaperRow } from "@/lib/schemas";

export const maxDuration = 180;

/** AI-proposed structure from the exam configuration, prompt and past-paper patterns. */
export const POST = route(async (req, { supabase }) => {
  const { paperId } = await body(req, z.object({ paperId: z.string().uuid() }));
  const row = must(await supabase.from("papers").select("*").eq("id", paperId).single()) as PaperRow;
  const ctx = await loadContext(supabase, [], row.past_paper_ids);
  const structure = await suggestStructure({ config: normalizeConfig(row.config), prompt: row.prompt, analyses: ctx.analyses });
  return json(structure);
});
