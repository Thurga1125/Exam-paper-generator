import { route, json, must } from "@/lib/api";
import { normalizeConfig } from "@/lib/schemas";

const LIST_COLUMNS = "id,title,status,config,created_at,updated_at,warnings,error,marking_scheme,content";

export const GET = route(async (req, { supabase }) => {
  const status = req.nextUrl.searchParams.get("status");
  let q = supabase.from("papers").select(LIST_COLUMNS).order("updated_at", { ascending: false });
  if (status === "generated") q = q.eq("status", "ready");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return json(
    (data ?? []).map(({ content, marking_scheme, ...p }) => ({
      ...p,
      has_content: !!content,
      has_marking: !!marking_scheme,
    })),
  );
});

/** Create a new draft seeded with the user's default settings. */
export const POST = route(async (_req, { supabase, user }) => {
  const { data: s } = await supabase.from("user_settings").select("data").maybeSingle();
  const config = normalizeConfig(s?.data);
  const row = must(
    await supabase.from("papers").insert({ user_id: user.id, title: "Untitled examination", config }).select("*").single(),
  );
  return json(row, 201);
});
