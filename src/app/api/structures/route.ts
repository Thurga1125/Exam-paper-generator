import { z } from "zod";
import { route, json, body, must } from "@/lib/api";
import { StructureSchema } from "@/lib/schemas";

export const GET = route(async (_req, { supabase }) => {
  const { data, error } = await supabase.from("structures").select("*").order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return json(data);
});

export const POST = route(async (req, { supabase, user }) => {
  const { data } = await body(req, z.object({ data: StructureSchema }));
  const row = must(
    await supabase.from("structures").insert({ user_id: user.id, name: data.name || "Untitled structure", data }).select("*").single(),
  );
  return json(row, 201);
});
