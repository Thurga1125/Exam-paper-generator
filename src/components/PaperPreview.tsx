"use client";

import { useEffect, useRef, useState } from "react";
import { mathToPlain, parseBlocks, parseInline, parseMath, type Inline } from "@/lib/richtext";
import { examTypeLabel, formatDuration, labels, marksText, questionNumber, sectionTitle } from "@/lib/i18n";
import { isLegacyTamilFont } from "@/lib/legacyFont";
import { partMarks, questionMarks, type ExamConfig, type Paper, type Part, type Question, type SubPart } from "@/lib/schemas";

const PAGE_MM = { A4: { w: 210, h: 297 }, Letter: { w: 215.9, h: 279.4 } } as const;
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((x, i) =>
        x.t === "math" ? (
          <i key={i} style={{ fontFamily: "Cambria Math, Cambria, serif" }}>{(() => { try { return mathToPlain(parseMath(x.s)); } catch { return x.s; } })()}</i>
        ) : (
          <span key={i} style={{ fontWeight: x.b ? 700 : undefined, fontStyle: x.i ? "italic" : undefined }}>{x.s}</span>
        ),
      )}
    </>
  );
}

/** Renders question text (paragraphs, tables, code) with the label and marks in a row. */
function Row({ label, text, marks, indent, size, bold, boldMarks, spacing }: {
  label: string; text: string; marks: string; indent: number; size: number; bold?: boolean; boldMarks?: boolean; spacing: { line: number; para: number };
}) {
  const blocks = parseBlocks(text || "");
  return (
    <div style={{ marginLeft: `${indent}mm`, fontSize: `${size}pt`, lineHeight: spacing.line, marginBottom: `${spacing.para}pt` }}>
      <div style={{ display: "flex", gap: "3mm" }}>
        <span style={{ minWidth: "9mm", fontWeight: bold ? 700 : undefined }}>{label}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {blocks.length === 0 && <p>&nbsp;</p>}
          {blocks.map((b, i) =>
            b.t === "p" ? (
              <p key={i} style={{ margin: 0, marginTop: i ? `${spacing.para}pt` : 0 }}><Inlines items={b.inline} /></p>
            ) : b.t === "code" ? (
              <pre key={i} style={{ fontFamily: "Courier New, monospace", fontSize: `${size - 1}pt`, margin: "2pt 0", whiteSpace: "pre-wrap" }}>{b.text}</pre>
            ) : (
              <table key={i} style={{ borderCollapse: "collapse", margin: "4pt 0", fontSize: `${size - 1}pt` }}>
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ border: "1px solid #000", padding: "2pt 6pt", fontWeight: b.header && ri === 0 ? 700 : undefined }}><Inlines items={c} /></td>)}</tr>
                  ))}
                </tbody>
              </table>
            ),
          )}
        </div>
        <span style={{ whiteSpace: "nowrap", fontWeight: boldMarks ? 700 : undefined, alignSelf: "flex-start" }}>{marks}</span>
      </div>
    </div>
  );
}

export function PaperPreview({ config, paper }: { config: ExamConfig; paper: Paper }) {
  const f = config.formatting;
  const pg = PAGE_MM[f.pageSize];
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [sheetH, setSheetH] = useState(0);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const mmPx = 96 / 25.4;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 2) / (pg.w * mmPx))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [pg.w]);

  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSheetH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // legacy fonts (Bamini) cannot show Unicode text, so the preview uses a Unicode Tamil font; the DOCX is converted
  const legacy = isLegacyTamilFont(f.fontFamily);
  const font = legacy ? `"Latha", "Tamil Sangam MN", "Nirmala UI", serif` : `"${f.fontFamily}", "Times New Roman", serif`;
  const L = labels(config.language);
  const spacing = { line: f.lineSpacing, para: f.paragraphSpacing };
  const dur = formatDuration(config.durationMinutes, config.language);
  const mmPx = 96 / 25.4;

  const renderSub = (s: SubPart) => (
    <Row key={s.id} label={s.label} text={s.text} marks={`[${num(s.marks)}]`} indent={18} size={f.questionSize} boldMarks={f.boldMarks} spacing={spacing} />
  );
  const renderPart = (p: Part) => (
    <div key={p.id}>
      <Row label={p.label} text={p.text} marks={`[${num(partMarks(p))}]`} indent={9} size={f.questionSize} boldMarks={f.boldMarks} spacing={spacing} />
      {p.parts.map(renderSub)}
    </div>
  );
  const renderQ = (q: Question) => (
    <div key={q.id} style={{ marginTop: `${f.questionSpacing}pt` }}>
      {q.pageBreakBefore && <div className="page-break-marker -mx-4 mb-3 text-center text-[9px] uppercase tracking-wider text-slate-400" style={{ fontFamily: "sans-serif" }}>page break</div>}
      <Row label={questionNumber(q.number, config.language)} text={q.text} marks={marksText(questionMarks(q), config.language)} indent={0} size={f.questionSize} bold={f.boldQuestionNumbers} boldMarks={f.boldMarks} spacing={spacing} />
      {q.parts.map(renderPart)}
    </div>
  );

  const centered = (t: string, size: number, bold = false) => <div style={{ textAlign: "center", fontSize: `${size}pt`, fontWeight: bold ? 700 : 400, marginBottom: "3pt" }}>{t}</div>;

  return (
    <div ref={wrap} className="w-full overflow-hidden">
      <div style={{ height: sheetH * scale || undefined }}>
        <div
          ref={sheet}
          className="paper-sheet"
          style={{
            width: `${pg.w}mm`,
            minHeight: `${pg.h}mm`,
            padding: `${f.marginTop}cm ${f.marginRight}cm ${f.marginBottom}cm ${f.marginLeft}cm`,
            fontFamily: font,
            fontSize: `${f.fontSize}pt`,
            lineHeight: f.lineSpacing,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${pg.h * mmPx - 2}px, #cbd5e1 ${pg.h * mmPx - 2}px, #cbd5e1 ${pg.h * mmPx}px)`,
          }}
        >
          {f.headerText && <div style={{ textAlign: "center", fontSize: `${f.fontSize - 2}pt`, marginBottom: "8pt", color: "#333" }}>{f.headerText}</div>}
          {config.institution && centered(config.institution.toUpperCase(), f.headingSize + 2, true)}
          {centered(config.title || [examTypeLabel(config.examType, config.language), config.yearSemester].filter(Boolean).join(" – ") || config.subject, f.headingSize + 1, true)}
          {config.subject && centered([config.subject, config.moduleCode && `(${config.moduleCode})`].filter(Boolean).join(" "), f.headingSize, true)}
          {(config.programme || config.faculty) && centered([config.programme, config.faculty].filter(Boolean).join(" · "), f.headingSize - 1, true)}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1.5px solid #000", borderBottom: "1.5px solid #000", padding: "4pt 0", margin: "8pt 0", fontWeight: 700 }}>
            <span>{L.timeAllowed}: {dur}</span><span>{L.maxMarks}: {num(config.totalMarks)}</span>
          </div>
          {config.showStudentDetails && (
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, margin: "6pt 0" }}>
              <span>{L.name}: {".".repeat(38)}</span><span>{L.indexNo}: {".".repeat(18)}</span>
            </div>
          )}

          {paper.instructions.length > 0 && (
            <>
              <div style={{ fontWeight: 700, fontSize: `${f.headingSize - 1}pt`, margin: "10pt 0 4pt" }}>{L.instructions}</div>
              <ol style={{ margin: 0, paddingLeft: "7mm", fontStyle: f.italicInstructions ? "italic" : undefined }}>
                {paper.instructions.map((t, i) => <li key={i}><Inlines items={parseInline(t)} /></li>)}
              </ol>
            </>
          )}

          {paper.sections.map((s) => (
            <section key={s.id}>
              <div style={{ textAlign: "center", fontWeight: 700, fontSize: `${f.headingSize}pt`, borderBottom: "1px solid #000", margin: "16pt 0 3pt", paddingBottom: "2pt" }}>{sectionTitle(s.title, config.language).toUpperCase()}</div>
              {s.instructions && <div style={{ textAlign: "center", fontStyle: f.italicInstructions ? "italic" : undefined, marginBottom: "4pt" }}>{s.instructions}</div>}
              {s.questions.map(renderQ)}
            </section>
          ))}

          <div style={{ textAlign: "center", fontWeight: 700, marginTop: "20pt" }}>— {L.endOfPaper} —</div>
          {f.showPageNumbers && <div style={{ textAlign: "center", fontSize: `${f.fontSize - 2}pt`, color: "#666", marginTop: "12pt" }}>{f.footerText && `${f.footerText}  `}{L.page} 1</div>}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-slate-400">Grey lines mark approximate page boundaries. Exact pagination is determined by the downloaded DOCX/PDF.</p>
    </div>
  );
}
