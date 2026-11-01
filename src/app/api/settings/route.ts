import { z } from "zod";
import { route, json, body } from "@/lib/api";
import { ExamConfigSchema, normalizeConfig } from "@/lib/schemas";

/** Per-user defaults (institution, formatting…) applied to every new paper. */
export const GET = route(async (_req, { supabase }) => {
  const { data } = await supabase.from("user_settings").select("data").maybeSingle();
  return json({ defaults: normalizeConfig(data?.data) });
});

export const PUT = route(async (req, { supabase, user }) => {
  const { defaults } = await body(req, z.object({ defaults: ExamConfigSchema }));
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, data: defaults, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return json({ defaults });
});
