import { z } from "zod";
import { route, json, body, must } from "@/lib/api";
import { ExamConfigSchema, MarkingSchemeSchema, PaperSchema, StructureSchema } from "@/lib/schemas";

type P = { id: string };

export const GET = route<P>(async (_req, { supabase }, { id }) =>
  json(must(await supabase.from("papers").select("*").eq("id", id).single())),
);

const Patch = z
  .object({
    title: z.string(),
    config: ExamConfigSchema,
    structure: StructureSchema.nullable(),
    prompt: z.string(),
    resource_ids: z.array(z.string().uuid()),
    past_paper_ids: z.array(z.string().uuid()),
    content: PaperSchema.nullable(),
    marking_scheme: MarkingSchemeSchema.nullable(),
    warnings: z.array(z.object({ level: z.enum(["info", "warning", "error"]), message: z.string() })),
  })
  .partial();

export const PATCH = route<P>(async (req, { supabase }, { id }) => {
  const patch = await body(req, Patch);
  const row = must(
    await supabase.from("papers").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("id,title,updated_at").single(),
  );
  return json(row);
});

export const DELETE = route<P>(async (_req, { supabase }, { id }) => {
  const { error } = await supabase.from("papers").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ ok: true });
});
