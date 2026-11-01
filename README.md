# Smart Exam Paper Studio

Generate university examination papers from your own teaching materials, past papers, a paper structure and a custom prompt — then edit them and download an editable Word (`.docx`) or PDF file.

**Stack:** Next.js 16 (App Router, API routes) · TypeScript · Tailwind CSS 4 · Supabase (Postgres + pgvector, Auth, Storage) · OpenAI (chat + embeddings) · `docx` for Word export · LibreOffice for PDF.

## How it works

1. **Ingest** – uploads (PDF/DOCX/PPTX/TXT) are stored in Supabase Storage, text is extracted (`unpdf`, `mammoth`, PPTX XML), chunked (~1200 chars), embedded and stored in `chunks` (pgvector, RLS-protected).
2. **Analyse** – each selected past paper is analysed once (numbering, layout, marks distribution, question types, difficulty, instructions, recurring topics) and cached.
3. **Structure** – a blueprint of sections/questions/parts/marks/answer rules; built manually, imported from an uploaded paper, reused, or AI-suggested.
4. **Generate** – per section: semantic retrieval over the selected resources → question generation constrained by the blueprint (OpenAI Structured Outputs). The code then *verifies* part/question marks, count and structure and retries with feedback; rejects questions that overlap a past paper (6-word shingle check); flags weakly supported questions; checks the grand total. Progress streams to the browser.
5. **Edit** – every AI action (harder, easier, another, scenario, clarity, regenerate, custom instruction, correctness check, marking scheme) touches **one question only**.
6. **Export** – `.docx` is built natively (fonts, sizes, margins, A4/Letter, header/footer, page numbers, tables, Word equations, marks right-aligned); PDF is the DOCX converted by LibreOffice. The marking scheme is a separate document.

## Setup

1. `npm install`
2. Create a Supabase project. In the SQL editor run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) (creates tables, RLS, the `match_chunks` function and the private `documents` bucket).
   - For quick local testing, disable *Confirm email* under Auth → Providers → Email.
3. `cp .env.example .env.local` and fill in the Supabase URL/anon key and `OPENAI_API_KEY` (`OPENAI_MODEL` and `OPENAI_EMBEDDING_MODEL` are optional; the embedding dimension must be 1536).
4. For PDF export install LibreOffice (`brew install --cask libreoffice`, or `apt install libreoffice-writer`) or set `SOFFICE_PATH`. Without it everything works except PDF download (a clear message is shown).
5. `npm run dev` → http://localhost:3000, create an account, and follow **Create New Paper**.

Docker: `docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=… --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=… -t exam-studio .` (image includes LibreOffice).

## Tests

`npm run test:offline -- <sample.docx> [sample.pdf]` – runs checks that need no network: strict-JSON-schema compatibility, text extraction, chunking, difficulty planning, marks validation, originality check, totals, math parsing.
`npm run smoke:docx -- paper.docx marking.docx` – writes sample exports.

## Known limits

- Scanned/image-only PDFs have no text layer and are rejected with a message (no OCR).
- Uploads are processed inside the request (25 MB limit per file); very large decks may need a background queue.
- The on-screen preview approximates pagination; exact page breaks come from Word/LibreOffice.
- Equations are written as `$x^2 + y_i$`, `a/b`, `sqrt(x)` and exported as native Word equations; complex LaTeX is not supported.
- Tamil/Sinhala output needs a font that contains those glyphs (e.g. Latha, Iskoola Pota, Nirmala UI) — choose one under Formatting.
