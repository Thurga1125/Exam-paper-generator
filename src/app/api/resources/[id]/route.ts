import { z } from "zod";
import { route, json, body, must } from "@/lib/api";

type P = { id: string };

export const GET = route<P>(async (req, { supabase }, { id }) => {
  const row = must(await supabase.from("resources").select("*").eq("id", id).single());
  const signed = await supabase.storage.from("documents").createSignedUrl(row.storage_path, 3600);
  const full = req.nextUrl.searchParams.get("full") === "1";
  const text: string = row.text_content ?? "";
  return json({
    ...row,
    text_content: full ? text : text.slice(0, 20000),
    text_truncated: !full && text.length > 20000,
    url: signed.data?.signedUrl ?? null,
  });
});

const Patch = z
  .object({
    title: z.string().min(1),
    description: z.string(),
    subject: z.string(),
    module: z.string(),
    topic: z.string(),
    academic_year: z.string(),
    semester: z.string(),
    exam_type: z.string(),
    paper_year: z.string(),
    notes: z.string(),
  })
  .partial();

export const PATCH = route<P>(async (req, { supabase }, { id }) => {
  const patch = await body(req, Patch);
  // Changing notes/exam metadata invalidates the cached pattern analysis of a past paper.
  const reset = "notes" in patch || "exam_type" in patch || "paper_year" in patch ? { analysis: null } : {};
  const row = must(
    await supabase
      .from("resources")
      .update({ ...patch, ...reset, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,title,description,subject,module,topic,academic_year,semester,exam_type,paper_year,notes")
      .single(),
  );
  return json(row);
});

export const DELETE = route<P>(async (_req, { supabase }, { id }) => {
  const row = must(await supabase.from("resources").select("storage_path").eq("id", id).single());
  await supabase.storage.from("documents").remove([row.storage_path]);
  const { error } = await supabase.from("resources").delete().eq("id", id);
  if (error) throw new Error(error.message);
  // keep papers from pointing at deleted files
  const { data: papers } = await supabase.from("papers").select("id,resource_ids,past_paper_ids").or(`resource_ids.cs.{${id}},past_paper_ids.cs.{${id}}`);
  for (const p of papers ?? []) {
    await supabase
      .from("papers")
      .update({
        resource_ids: (p.resource_ids as string[]).filter((x) => x !== id),
        past_paper_ids: (p.past_paper_ids as string[]).filter((x) => x !== id),
      })
      .eq("id", p.id);
  }
  return json({ ok: true });
});
