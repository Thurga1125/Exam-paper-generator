import JSZip from "jszip";
import mammoth from "mammoth";

export const SUPPORTED_EXTENSIONS = ["pdf", "docx", "pptx", "txt", "md"] as const;

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export class UnsupportedFileError extends Error {}

/** Extract plain text from an uploaded learning resource / paper. */
export async function extractText(buf: Buffer, fileName: string): Promise<string> {
  const ext = extensionOf(fileName);
  let text: string;
  switch (ext) {
    case "pdf":
      text = await extractPdf(buf);
      break;
    case "docx":
      text = (await mammoth.extractRawText({ buffer: buf })).value;
      break;
    case "pptx":
      text = await extractPptx(buf);
      break;
    case "txt":
    case "md":
      text = buf.toString("utf8");
      break;
    default:
      throw new UnsupportedFileError(
        `Unsupported file type ".${ext}". Upload PDF, DOCX, PPTX or TXT files.`,
      );
  }
  return normalizeText(text);
}

async function extractPdf(buf: Buffer): Promise<string> {
  const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await pdfText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return pages.map((p, i) => `[Page ${i + 1}]\n${p}`).join("\n\n");
}

async function extractPptx(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => num(a) - num(b));
  const out: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.files[name].async("string");
    const paragraphs = [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>|<a:p [\s\S]*?<\/a:p>/g)].map((p) =>
      [...p[0].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((t) => decodeXml(t[1])).join(""),
    );
    const body = paragraphs.filter((p) => p.trim()).join("\n");
    if (body) out.push(`[Slide ${num(name)}]\n${body}`);
  }
  const notes = Object.keys(zip.files)
    .filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))
    .sort((a, b) => num(a) - num(b));
  for (const name of notes) {
    const xml = await zip.files[name].async("string");
    const t = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(" ");
    if (t.trim()) out.push(`[Speaker notes ${num(name)}]\n${t}`);
  }
  return out.join("\n\n");
}

const num = (s: string) => Number(/(\d+)\.xml$/.exec(s)?.[1] ?? 0);

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

export function normalizeText(t: string): string {
  return t
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
