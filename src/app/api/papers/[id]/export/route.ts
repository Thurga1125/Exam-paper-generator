import { route, must, HttpError } from "@/lib/api";
import { buildMarkingDocx, buildPaperDocx } from "@/lib/docx/build";
import { docxToPdf, PdfUnavailableError } from "@/lib/docx/pdf";
import { normalizeConfig, type PaperRow } from "@/lib/schemas";

export const maxDuration = 120;

const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
} as const;

export const GET = route<{ id: string }>(async (req, { supabase }, { id }) => {
  const type = req.nextUrl.searchParams.get("type") === "marking" ? "marking" : "paper";
  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "docx";
  const row = must(await supabase.from("papers").select("*").eq("id", id).single()) as PaperRow;
  if (!row.content) throw new HttpError(409, "This paper has not been generated yet.");
  if (type === "marking" && !row.marking_scheme) throw new HttpError(409, "Generate the marking scheme first.");

  const config = normalizeConfig(row.config);
  const built =
    type === "marking"
      ? await buildMarkingDocx(config, row.content, row.marking_scheme!)
      : await buildPaperDocx(config, row.content, row.structure);
  let buf: Buffer = built.buffer;

  if (format === "pdf") {
    try {
      buf = await docxToPdf(buf);
    } catch (e) {
      if (e instanceof PdfUnavailableError) throw new HttpError(501, e.message);
      throw e;
    }
  }
  const base = (config.title || config.subject || "exam-paper").replace(/[^\w\-. ]+/g, "").trim().replace(/\s+/g, "-") || "exam-paper";
  const name = `${base}${type === "marking" ? "-marking-scheme" : ""}.${format}`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      ...(built.notice ? { "X-Export-Notice": encodeURIComponent(built.notice), "Access-Control-Expose-Headers": "X-Export-Notice" } : {}),
    },
  });
});
