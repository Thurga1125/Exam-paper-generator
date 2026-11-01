import { z } from "zod";
import { route, json, body, must, HttpError } from "@/lib/api";
import { parseStructure } from "@/lib/ai/analysis";

export const maxDuration = 120;

/** Build an editable structure from an uploaded structure/template/paper file. */
export const POST = route(async (req, { supabase }) => {
  const { resourceId } = await body(req, z.object({ resourceId: z.string().uuid() }));
  const r = must(await supabase.from("resources").select("title,status,text_content").eq("id", resourceId).single());
  if (r.status !== "ready") throw new HttpError(409, "That file has not been processed successfully.");
  const structure = await parseStructure(r.text_content, r.title);
  return json(structure);
});
