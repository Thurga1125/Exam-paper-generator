import { z } from "zod";
import { route, json, must, HttpError } from "@/lib/api";
import { ingestResource } from "@/lib/ingest/pipeline";
import { extensionOf, SUPPORTED_EXTENSIONS } from "@/lib/ingest/extract";

export const maxDuration = 300;

const COLUMNS =
  "id,kind,title,description,file_name,mime_type,size_bytes,storage_path,subject,module,topic,academic_year,semester,exam_type,paper_year,notes,char_count,status,error,analysis,created_at";

const MAX_BYTES = 25 * 1024 * 1024;

export const GET = route(async (req, { supabase }) => {
  const kind = req.nextUrl.searchParams.get("kind");
  const q = req.nextUrl.searchParams.get("q")?.trim();
  let query = supabase.from("resources").select(COLUMNS).order("created_at", { ascending: false });
  if (kind) query = query.eq("kind", kind);
  if (q) {
    const s = q.replace(/[%,()]/g, " ");
    query = query.or(
      ["title", "description", "subject", "module", "topic", "file_name", "paper_year", "academic_year"].map((c) => `${c}.ilike.%${s}%`).join(","),
    );
  }
  // a file still "processing" long after upload was interrupted (e.g. server restart)
  await supabase
    .from("resources")
    .update({ status: "failed", error: "Processing was interrupted. Click “Replace file” to try again." })
    .eq("status", "processing")
    .lt("updated_at", new Date(Date.now() - 12 * 60_000).toISOString());

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return json(data);
});

const Meta = z.object({
  kind: z.enum(["resource", "past_paper", "structure"]),
  title: z.string().default(""),
  description: z.string().default(""),
  subject: z.string().default(""),
  module: z.string().default(""),
  topic: z.string().default(""),
  academic_year: z.string().default(""),
  semester: z.string().default(""),
  exam_type: z.string().default(""),
  paper_year: z.string().default(""),
  notes: z.string().default(""),
});

export const POST = route(async (req, { supabase, user }) => {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) throw new HttpError(400, "No files were uploaded");
  const meta = Meta.parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));

  const results: unknown[] = [];
  for (const file of files) {
    const ext = extensionOf(file.name);
    if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
      results.push({ file: file.name, error: `Unsupported file type ".${ext}". Use PDF, DOCX, PPTX or TXT.` });
      continue;
    }
    if (file.size > MAX_BYTES) {
      results.push({ file: file.name, error: "File is larger than 25 MB." });
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const id = crypto.randomUUID();
    const storagePath = `${user.id}/${id}/${file.name.replace(/[^\w.\- ]+/g, "_")}`;

    const up = await supabase.storage.from("documents").upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
    });
    if (up.error) {
      results.push({ file: file.name, error: `Storage upload failed: ${up.error.message}` });
      continue;
    }
    const title = (files.length === 1 && meta.title.trim()) || file.name.replace(/\.[^.]+$/, "");
    const inserted = await supabase
      .from("resources")
      .insert({
        id,
        user_id: user.id,
        ...meta,
        title,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        storage_path: storagePath,
        status: "processing",
      })
      .select(COLUMNS)
      .single();
    if (inserted.error) {
      await supabase.storage.from("documents").remove([storagePath]);
      results.push({ file: file.name, error: inserted.error.message });
      continue;
    }
    const r = await ingestResource(supabase, { resourceId: id, userId: user.id, buffer, fileName: file.name });
    const fresh = must(await supabase.from("resources").select(COLUMNS).eq("id", id).single());
    results.push({ file: file.name, resource: fresh, error: r.ok ? undefined : r.error });
  }
  return json({ results }, 201);
});
