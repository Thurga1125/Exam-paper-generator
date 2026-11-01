import { route, json, must, HttpError } from "@/lib/api";
import { ingestResource } from "@/lib/ingest/pipeline";
import { extensionOf, SUPPORTED_EXTENSIONS } from "@/lib/ingest/extract";

export const maxDuration = 300;

/** Replace the file of an existing resource, keeping its metadata and id. */
export const POST = route<{ id: string }>(async (req, { supabase, user }, { id }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))) {
    throw new HttpError(400, "Unsupported file type. Use PDF, DOCX, PPTX or TXT.");
  }
  if (file.size > 25 * 1024 * 1024) throw new HttpError(400, "File is larger than 25 MB.");
  const old = must(await supabase.from("resources").select("storage_path").eq("id", id).single());

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${user.id}/${id}/${Date.now()}-${file.name.replace(/[^\w.\- ]+/g, "_")}`;
  const up = await supabase.storage.from("documents").upload(storagePath, buffer, { contentType: file.type || "application/octet-stream" });
  if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`);

  await supabase
    .from("resources")
    .update({ file_name: file.name, mime_type: file.type, size_bytes: file.size, storage_path: storagePath, status: "processing", error: null, analysis: null })
    .eq("id", id);
  await supabase.storage.from("documents").remove([old.storage_path]);

  const r = await ingestResource(supabase, { resourceId: id, userId: user.id, buffer, fileName: file.name });
  return json({ ok: r.ok, error: r.error });
});
