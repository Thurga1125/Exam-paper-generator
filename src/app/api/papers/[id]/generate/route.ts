import { route, must, HttpError } from "@/lib/api";
import { generatePaper } from "@/lib/ai/generate";
import { examTypeLabel } from "@/lib/i18n";
import { normalizeConfig, type PaperRow } from "@/lib/schemas";

export const maxDuration = 300;

/** Streams newline-delimited JSON progress events while the paper is generated. */
export const POST = route<{ id: string }>(async (_req, { supabase }, { id }) => {
  const row = must(await supabase.from("papers").select("*").eq("id", id).single()) as PaperRow;
  if (row.status === "generating" && Date.now() - new Date(row.updated_at).getTime() < 6 * 60_000) {
    throw new HttpError(409, "This paper is already being generated.");
  }
  await supabase.from("papers").update({ status: "generating", error: null, updated_at: new Date().toISOString() }).eq("id", id);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const { paper, warnings } = await generatePaper(supabase, row, (e) => send({ type: "progress", ...e }));
        const config = normalizeConfig(row.config);
        const title = config.title || [examTypeLabel(config.examType, config.language), config.subject].filter(Boolean).join(" – ") || "Examination";
        const { error } = await supabase
          .from("papers")
          .update({
            content: paper,
            warnings,
            marking_scheme: null,
            status: "ready",
            error: null,
            title,
            config: { ...config, title: config.title || title },
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) throw new Error(error.message);
        send({ type: "done", progress: 100 });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Generation failed";
        console.error("[generate]", e);
        await supabase.from("papers").update({ status: "failed", error: message }).eq("id", id);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
});
