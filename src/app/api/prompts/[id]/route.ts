import { route, json } from "@/lib/api";

export const DELETE = route<{ id: string }>(async (_req, { supabase }, { id }) => {
  const { error } = await supabase.from("prompts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ ok: true });
});
