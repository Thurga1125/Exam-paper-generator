import { z } from "zod";
import { route, json, body, must } from "@/lib/api";
import { StructureSchema } from "@/lib/schemas";

type P = { id: string };

export const PATCH = route<P>(async (req, { supabase }, { id }) => {
  const { data } = await body(req, z.object({ data: StructureSchema }));
  const row = must(
    await supabase
      .from("structures")
      .update({ name: data.name || "Untitled structure", data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single(),
  );
  return json(row);
});

export const DELETE = route<P>(async (_req, { supabase }, { id }) => {
  const { error } = await supabase.from("structures").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return json({ ok: true });
});
