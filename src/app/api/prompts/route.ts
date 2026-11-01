import { z } from "zod";
import { route, json, body, must } from "@/lib/api";

export const GET = route(async (_req, { supabase }) => {
  const { data, error } = await supabase.from("prompts").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return json(data);
});

export const POST = route(async (req, { supabase, user }) => {
  const b = await body(req, z.object({ title: z.string().min(1).max(120), body: z.string().min(1) }));
  return json(must(await supabase.from("prompts").insert({ user_id: user.id, ...b }).select("*").single()), 201);
});
