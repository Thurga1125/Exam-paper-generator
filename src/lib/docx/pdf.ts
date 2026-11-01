import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export class PdfUnavailableError extends Error {}

const CANDIDATES = [
  process.env.SOFFICE_PATH,
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
  "/usr/local/bin/soffice",
  "/opt/homebrew/bin/soffice",
].filter((x): x is string => !!x);

function findSoffice(): string | null {
  for (const c of CANDIDATES) if (existsSync(c)) return c;
  return null;
}

/** Converts a DOCX buffer to PDF using headless LibreOffice. */
export async function docxToPdf(docx: Buffer): Promise<Buffer> {
  const bin = findSoffice();
  if (!bin) {
    throw new PdfUnavailableError(
      "PDF export needs LibreOffice on the server (set SOFFICE_PATH or install LibreOffice). You can still download the DOCX.",
    );
  }
  const dir = await mkdtemp(path.join(tmpdir(), "exam-pdf-"));
  try {
    const input = path.join(dir, "paper.docx");
    await writeFile(input, docx);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        bin,
        [`-env:UserInstallation=file://${path.join(dir, "profile")}`, "--headless", "--convert-to", "pdf", "--outdir", dir, input],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let err = "";
      child.stderr.on("data", (d) => (err += d));
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("PDF conversion timed out"));
      }, 90_000);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new PdfUnavailableError(`Could not start LibreOffice: ${e.message}`));
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`PDF conversion failed (${code}): ${err.slice(0, 300)}`));
      });
    });
    return await readFile(path.join(dir, "paper.pdf"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
