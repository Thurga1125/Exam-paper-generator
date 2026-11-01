import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkText } from "./chunk";
import { extractText } from "./extract";
import { embed } from "../ai/openai";

/**
 * Extract → chunk → embed → store. Updates the resource row to ready/failed.
 * Never throws: the failure is recorded on the row so the UI can show it.
 */
export async function ingestResource(
  supabase: SupabaseClient,
  args: { resourceId: string; userId: string; buffer: Buffer; fileName: string },
): Promise<{ ok: boolean; error?: string }> {
  const { resourceId, userId, buffer, fileName } = args;
  try {
    const text = await extractText(buffer, fileName);
    if (text.replace(/\[(Page|Slide|Speaker notes) \d+\]/g, "").trim().length < 20) {
      throw new Error(
        "No readable text found. Scanned/image-only documents are not supported — upload a text-based file.",
      );
    }
    const chunks = chunkText(text);
    const vectors = await embed(chunks);

    await supabase.from("chunks").delete().eq("resource_id", resourceId);
    const rows = chunks.map((content, idx) => ({
      resource_id: resourceId,
      user_id: userId,
      idx,
      content,
      embedding: JSON.stringify(vectors[idx]),
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from("chunks").insert(rows.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
    const { error } = await supabase
      .from("resources")
      .update({ text_content: text, char_count: text.length, status: "ready", error: null, updated_at: new Date().toISOString() })
      .eq("id", resourceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Processing failed";
    await supabase.from("resources").update({ status: "failed", error: message }).eq("id", resourceId);
    return { ok: false, error: message };
  }
}
