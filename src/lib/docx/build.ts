import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  LineRuleType,
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSuperScript,
  Math as DocxMath,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
  type ParagraphChild,
  type IRunOptions,
} from "docx";
import {
  normalizeConfig,
  partMarks,
  questionMarks,
  type ExamConfig,
  type MarkingScheme,
  type Paper,
  type Part,
  type Question,
  type Structure,
  type SubPart,
} from "../schemas";
import { parseBlocks, parseInline, parseMath, type Block, type Inline, type MathNode } from "../richtext";
import { examTypeLabel, formatDuration, labels, marksText, questionNumber, sectionTitle, type Lang } from "../i18n";
import { isLegacyTamilFont, loadBaminiConverter, splitScripts, toBamini } from "../legacyFont";

const CM = 567; // twips per cm
const PAGE = { A4: { w: 11906, h: 16838 }, Letter: { w: 12240, h: 15840 } } as const;

interface Ctx {
  cfg: ExamConfig;
  /** printable width in twips */
  width: number;
  font: string;
  lang: Lang;
  /** true => Tamil runs are converted to a legacy font (Bamini); other text uses `latin` */
  legacy: boolean;
  latin: string;
  /** shown to the user when we had to change something about the export */
  notice?: string;
}

const UNICODE_TAMIL_FALLBACK = "Latha";

async function ctxFor(cfg: ExamConfig): Promise<Ctx> {
  const f = cfg.formatting;
  const pg = PAGE[f.pageSize];
  const base = { cfg, width: pg.w - Math.round((f.marginLeft + f.marginRight) * CM), lang: cfg.language, latin: "Times New Roman" };
  if (isLegacyTamilFont(f.fontFamily)) {
    if (await loadBaminiConverter()) return { ...base, font: f.fontFamily, legacy: true };
    return {
      ...base,
      font: UNICODE_TAMIL_FALLBACK,
      legacy: false,
      notice: `Bamini conversion is unavailable on the server, so the document uses the Unicode font “${UNICODE_TAMIL_FALLBACK}” instead.`,
    };
  }
  return { ...base, font: f.fontFamily, legacy: false };
}

const fontOpt = (name: string) => ({ ascii: name, hAnsi: name, cs: name, eastAsia: name });
const pt = (n: number) => Math.round(n * 2); // half-points
const spacingLine = (m: number) => ({ line: Math.round(240 * m), lineRule: LineRuleType.AUTO });

/** One or more runs for `text`. With a legacy Tamil font, Tamil is converted + set in that font and the rest in a normal font. */
function run(c: Ctx, text: string, o: Partial<IRunOptions> & { sizePt?: number } = {}): TextRun[] {
  const { sizePt, ...rest } = o;
  const size = pt(sizePt ?? c.cfg.formatting.fontSize);
  if (!c.legacy) return [new TextRun({ text, font: fontOpt(c.font), size, ...rest })];
  return splitScripts(text).map((seg) =>
    seg.tamil
      ? new TextRun({ text: toBamini(seg.text), font: fontOpt(c.font), size, ...rest })
      : new TextRun({ text: seg.text, font: fontOpt(c.latin), size, ...rest }),
  );
}

/* ------------------------------ math ------------------------------ */

function mathChildren(nodes: MathNode[]): (MathRun | MathFraction | MathRadical | MathSubScript | MathSuperScript)[] {
  return nodes.flatMap((n) => {
    switch (n.t) {
      case "run":
        return [new MathRun(n.s)];
      case "sup":
        return [new MathSuperScript({ children: mathChildren(n.base), superScript: mathChildren(n.sup) })];
      case "sub":
        return [new MathSubScript({ children: mathChildren(n.base), subScript: mathChildren(n.sub) })];
      case "frac":
        return [new MathFraction({ numerator: mathChildren(n.num), denominator: mathChildren(n.den) })];
      case "sqrt":
        return [new MathRadical({ children: mathChildren(n.body) })];
      case "paren":
        return [new MathRun("("), ...mathChildren(n.body), new MathRun(")")];
    }
  });
}

/* --------------------------- inline / blocks --------------------------- */

function inlineRuns(c: Ctx, inl: Inline[], base: Partial<IRunOptions> & { sizePt?: number } = {}): ParagraphChild[] {
  return inl.flatMap((x): ParagraphChild[] => {
    if (x.t === "math") {
      try {
        const kids = mathChildren(parseMath(x.s));
        if (kids.length) return [new DocxMath({ children: kids })];
      } catch {
        /* fall through to plain text */
      }
      return run(c, x.s, { ...base, italics: true });
    }
    return run(c, x.s, { ...base, bold: x.b ?? base.bold, italics: x.i ?? base.italics });
  });
}

interface BlockOpts {
  indent: number; // twips
  sizePt: number;
  /** extra children appended to the first paragraph (e.g. tab + marks) */
  trailing?: ParagraphChild[];
  leading?: ParagraphChild[];
  hanging?: number;
  keepNext?: boolean;
  spaceBefore?: number;
  pageBreakBefore?: boolean;
}

function blocksToElements(c: Ctx, text: string, o: BlockOpts): (Paragraph | Table)[] {
  const f = c.cfg.formatting;
  const blocks: Block[] = parseBlocks(text);
  if (!blocks.length) blocks.push({ t: "p", inline: [] });
  const out: (Paragraph | Table)[] = [];
  let first = true;

  for (const b of blocks) {
    if (b.t === "p") {
      const kids: ParagraphChild[] = [
        ...(first ? (o.leading ?? []) : []),
        ...inlineRuns(c, b.inline, { sizePt: o.sizePt }),
        ...(first ? (o.trailing ?? []) : []),
      ];
      out.push(
        new Paragraph({
          children: kids,
          keepNext: o.keepNext && first,
          pageBreakBefore: o.pageBreakBefore && first,
          indent: { left: o.indent + (first ? (o.hanging ?? 0) : 0), hanging: first ? o.hanging : undefined },
          tabStops: [{ type: TabStopType.RIGHT, position: c.width }],
          spacing: { ...spacingLine(f.lineSpacing), before: first ? (o.spaceBefore ?? 0) : 0, after: f.paragraphSpacing * 20 },
        }),
      );
    } else if (b.t === "code") {
      out.push(
        ...b.text.split("\n").map(
          (ln) =>
            new Paragraph({
              indent: { left: o.indent + (o.hanging ?? 0) },
              spacing: { line: 240, after: 0 },
              children: [new TextRun({ text: ln || " ", font: "Courier New", size: pt(Math.max(8, o.sizePt - 1)) })],
            }),
        ),
        new Paragraph({ spacing: { after: f.paragraphSpacing * 20 }, children: [] }),
      );
    } else {
      out.push(tableFrom(c, b, o));
      out.push(new Paragraph({ spacing: { after: f.paragraphSpacing * 20 }, children: [] }));
    }
    if (first) first = false;
  }
  if (first && (o.leading || o.trailing)) {
    out.push(new Paragraph({ children: [...(o.leading ?? []), ...(o.trailing ?? [])] }));
  }
  return out;
}

function tableFrom(c: Ctx, b: Extract<Block, { t: "table" }>, o: BlockOpts): Table {
  const cols = Math.max(...b.rows.map((r) => r.length));
  const total = c.width - o.indent - (o.hanging ?? 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: Array(cols).fill(Math.floor(total / cols)),
    indent: { size: o.indent + (o.hanging ?? 0), type: WidthType.DXA },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: b.rows.map(
      (r, ri) =>
        new TableRow({
          tableHeader: b.header && ri === 0,
          children: Array.from({ length: cols }, (_, ci) =>
            new TableCell({
              width: { size: Math.floor(total / cols), type: WidthType.DXA },
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
              children: [
                new Paragraph({
                  children: inlineRuns(c, r[ci] ?? [], { sizePt: o.sizePt - 1, bold: b.header && ri === 0 }),
                }),
              ],
            }),
          ),
        }),
    ),
  });
}

/* ----------------------------- paper body ----------------------------- */

const marksRun = (c: Ctx, text: string, sizePt?: number) =>
  run(c, text, { bold: c.cfg.formatting.boldMarks, sizePt });

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function questionElements(c: Ctx, q: Question): (Paragraph | Table)[] {
  const f = c.cfg.formatting;
  const sz = f.questionSize;
  const hang = q.number.length > 4 ? 1100 : 720;
  const out: (Paragraph | Table)[] = [];
  const hasParts = q.parts.length > 0;
  const total = questionMarks(q);

  out.push(
    ...blocksToElements(c, q.text || " ", {
      indent: 0,
      hanging: hang,
      sizePt: sz,
      keepNext: hasParts,
      spaceBefore: f.questionSpacing * 20,
      pageBreakBefore: q.pageBreakBefore,
      leading: [...run(c, questionNumber(q.number, c.lang), { bold: f.boldQuestionNumbers, sizePt: sz }), ...run(c, "\t", { sizePt: sz })],
      trailing: [...run(c, "\t", { sizePt: sz }), ...marksRun(c, marksText(total, c.lang), sz)],
    }),
  );

  for (const p of q.parts) out.push(...partElements(c, p, sz, hang));
  return out;
}

function partElements(c: Ctx, p: Part, sz: number, hang: number): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const hasSub = p.parts.length > 0;
  out.push(
    ...blocksToElements(c, p.text || " ", {
      indent: hang,
      hanging: 600,
      sizePt: sz,
      keepNext: hasSub,
      leading: [...run(c, p.label, { sizePt: sz }), ...run(c, "\t", { sizePt: sz })],
      trailing: [...run(c, "\t", { sizePt: sz }), ...marksRun(c, `[${num(partMarks(p))}]`, sz)],
    }),
  );
  for (const s of p.parts) out.push(...subPartElements(c, s, sz, hang + 600));
  return out;
}

function subPartElements(c: Ctx, s: SubPart, sz: number, indent: number): (Paragraph | Table)[] {
  return blocksToElements(c, s.text || " ", {
    indent,
    hanging: 600,
    sizePt: sz,
    leading: [...run(c, s.label, { sizePt: sz }), ...run(c, "\t", { sizePt: sz })],
    trailing: [...run(c, "\t", { sizePt: sz }), ...marksRun(c, `[${num(s.marks)}]`, sz)],
  });
}

function centered(c: Ctx, text: string, size: number, bold = false, after = 60): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after },
    children: [...run(c, text, { sizePt: size, bold })],
  });
}

/** Default heading when the lecturer left the title empty, e.g. "முதலாம் தவணைப் பரீட்சை – 2026". */
export function defaultTitle(cfg: ExamConfig): string {
  return [examTypeLabel(cfg.examType, cfg.language), cfg.yearSemester].filter(Boolean).join(" – ");
}

function titleBlock(c: Ctx): (Paragraph | Table)[] {
  const cfg = c.cfg;
  const f = cfg.formatting;
  const L = labels(c.lang);
  const out: (Paragraph | Table)[] = [];
  if (cfg.institution) out.push(centered(c, cfg.institution.toUpperCase(), f.headingSize + 2, true));
  out.push(centered(c, cfg.title || defaultTitle(cfg) || cfg.subject, f.headingSize + 1, true, 60));
  const subjectLine = [cfg.subject, cfg.moduleCode && `(${cfg.moduleCode})`].filter(Boolean).join(" ");
  const gradeLine = [cfg.programme, cfg.faculty].filter(Boolean).join(" · ");
  if (subjectLine && subjectLine !== cfg.title) out.push(centered(c, subjectLine, f.headingSize, true));
  if (gradeLine) out.push(centered(c, gradeLine, f.headingSize - 1, true));
  if (cfg.title && cfg.yearSemester) out.push(centered(c, cfg.yearSemester, f.headingSize - 2));

  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const line = { style: BorderStyle.SINGLE, size: 8, color: "000000" };
  const half = Math.floor(c.width / 2);
  const cell = (text: string, align: (typeof AlignmentType)[keyof typeof AlignmentType], borders = true) =>
    new TableCell({
      width: { size: half, type: WidthType.DXA },
      borders: borders ? { top: line, bottom: line, left: none, right: none } : { top: none, bottom: none, left: none, right: none },
      margins: { top: 80, bottom: 80 },
      children: [new Paragraph({ alignment: align, children: [...run(c, text, { bold: true })] })],
    });
  out.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
  const rows = [
    new TableRow({
      children: [
        cell(`${L.timeAllowed}: ${formatDuration(cfg.durationMinutes, c.lang)}`, AlignmentType.LEFT),
        cell(`${L.maxMarks}: ${num(cfg.totalMarks)}`, AlignmentType.RIGHT),
      ],
    }),
  ];
  if (cfg.showStudentDetails) {
    rows.push(
      new TableRow({
        children: [
          cell(`${L.name}: ${".".repeat(38)}`, AlignmentType.LEFT, false),
          cell(`${L.indexNo}: ${".".repeat(18)}`, AlignmentType.RIGHT, false),
        ],
      }),
    );
  }
  out.push(new Table({ width: { size: c.width, type: WidthType.DXA }, columnWidths: [half, c.width - half], rows }));
  return out;
}

function headerFooter(c: Ctx) {
  const f = c.cfg.formatting;
  const header = f.headerText.trim()
    ? new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [...run(c, f.headerText, { sizePt: f.fontSize - 2 })] })] })
    : undefined;
  const kids: ParagraphChild[] = [];
  if (f.footerText.trim()) kids.push(...run(c, f.footerText + (f.showPageNumbers ? "     " : ""), { sizePt: f.fontSize - 2 }));
  if (f.showPageNumbers) {
    kids.push(...run(c, `${labels(c.lang).page} `, { sizePt: f.fontSize - 2 }));
    kids.push(new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], font: fontOpt(c.legacy ? c.latin : c.font), size: pt(f.fontSize - 2) }));
  }
  const footer = kids.length
    ? new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: kids })] })
    : undefined;
  return { header, footer };
}

function documentFor(c: Ctx, children: (Paragraph | Table)[], title: string): Document {
  const f = c.cfg.formatting;
  const pg = PAGE[f.pageSize];
  const { header, footer } = headerFooter(c);
  return new Document({
    title,
    creator: "Smart Exam Paper Studio",
    styles: {
      default: {
        document: {
          run: { font: fontOpt(c.legacy ? c.latin : c.font), size: pt(f.fontSize) },
          paragraph: { spacing: { ...spacingLine(f.lineSpacing), after: f.paragraphSpacing * 20 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: pg.w, height: pg.h },
            margin: {
              top: Math.round(f.marginTop * CM),
              bottom: Math.round(f.marginBottom * CM),
              left: Math.round(f.marginLeft * CM),
              right: Math.round(f.marginRight * CM),
            },
          },
        },
        headers: header ? { default: header } : undefined,
        footers: footer ? { default: footer } : undefined,
        children,
      },
    ],
  });
}

/* ----------------------------- public API ----------------------------- */

export interface BuiltDocx {
  buffer: Buffer;
  /** set when the export differs from what the user asked for (e.g. font substituted) */
  notice?: string;
}

export async function buildPaperDocx(rawConfig: unknown, paper: Paper, structure: Structure | null): Promise<BuiltDocx> {
  const cfg = normalizeConfig(rawConfig);
  const c = await ctxFor(cfg);
  const f = cfg.formatting;
  const L = labels(c.lang);
  const kids: (Paragraph | Table)[] = [...titleBlock(c)];

  if (paper.instructions.length) {
    kids.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [...run(c, L.instructions, { bold: true, sizePt: f.headingSize - 1 })],
      }),
    );
    paper.instructions.forEach((t, i) =>
      kids.push(
        new Paragraph({
          indent: { left: 400, hanging: 400 },
          spacing: { after: 40 },
          children: [...run(c, `${i + 1}.\t`), ...inlineRuns(c, parseInline(t), { italics: f.italicInstructions })],
          tabStops: [{ type: TabStopType.LEFT, position: 400 }],
        }),
      ),
    );
  }

  paper.sections.forEach((s) => {
    kids.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: true,
        spacing: { before: 320, after: 60 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 2 } },
        children: [...run(c, sectionTitle(s.title, c.lang).toUpperCase(), { bold: true, sizePt: f.headingSize })],
      }),
    );
    if (s.instructions.trim()) {
      kids.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [...run(c, s.instructions, { italics: f.italicInstructions })],
        }),
      );
    }
    s.questions.forEach((q) => kids.push(...questionElements(c, q)));
  });

  kids.push(new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER, children: [...run(c, `— ${L.endOfPaper} —`, { bold: true })] }));
  void structure;
  const doc = documentFor(c, kids, cfg.title || defaultTitle(cfg) || cfg.subject || "Examination paper");
  return { buffer: Buffer.from(await Packer.toBuffer(doc)), notice: c.notice };
}

export async function buildMarkingDocx(rawConfig: unknown, paper: Paper, scheme: MarkingScheme): Promise<BuiltDocx> {
  const cfg = normalizeConfig(rawConfig);
  const c = await ctxFor(cfg);
  const f = cfg.formatting;
  const L = labels(c.lang);
  const title = cfg.title || defaultTitle(cfg) || cfg.subject;
  const kids: (Paragraph | Table)[] = [];
  if (cfg.institution) kids.push(centered(c, cfg.institution.toUpperCase(), f.headingSize + 1, true));
  kids.push(centered(c, `${L.markingScheme} — ${title}`, f.headingSize + 1, true));
  kids.push(centered(c, L.confidential, f.headingSize - 2, true, 200));

  if (scheme.generalGuidelines.length) {
    kids.push(new Paragraph({ spacing: { before: 120, after: 80 }, children: [...run(c, L.examinerGuidelines, { bold: true, sizePt: f.headingSize - 1 })] }));
    scheme.generalGuidelines.forEach((g, i) =>
      kids.push(
        new Paragraph({
          indent: { left: 400, hanging: 400 },
          tabStops: [{ type: TabStopType.LEFT, position: 400 }],
          children: [...run(c, `${i + 1}.\t${g}`)],
        }),
      ),
    );
  }

  const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const w = [900, c.width - 900 - 1500 - 1100, 1500, 1100];
  const cell = (inner: Paragraph[], width: number, shade?: string) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: shade ? { fill: shade } : undefined,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: inner,
    });
  const para = (text: string, bold = false) =>
    text
      .split("\n")
      .map((ln) => new Paragraph({ spacing: { after: 40 }, children: inlineRuns(c, parseInline(ln), { bold, sizePt: f.fontSize - 1 }) }));

  const byId = new Map(scheme.questions.map((q) => [q.questionId, q]));
  for (const s of paper.sections) {
    kids.push(new Paragraph({ spacing: { before: 280, after: 80 }, keepNext: true, children: [...run(c, sectionTitle(s.title, c.lang).toUpperCase(), { bold: true, sizePt: f.headingSize })] }));
    for (const q of s.questions) {
      const mq = byId.get(q.id);
      kids.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: 160, after: 60 },
          children: [
            ...run(c, `${L.question} ${q.number.replace(/^(question|q)\s*/i, "")} `, { bold: true }),
            ...run(c, `${marksText(questionMarks(q), c.lang)} — ${q.topic}`, { italics: true }),
          ],
        }),
      );
      if (!mq) {
        kids.push(new Paragraph({ children: [...run(c, "—", { italics: true })] }));
        continue;
      }
      const rows = [
        new TableRow({
          tableHeader: true,
          children: [
            cell(para(L.part, true), w[0], "D9E2F3"),
            cell(para(`${L.expected} · ${L.modelAnswer} · ${L.rubric}`, true), w[1], "D9E2F3"),
            cell(para(L.allocation, true), w[2], "D9E2F3"),
            cell(para(L.marks, true), w[3], "D9E2F3"),
          ],
        }),
        ...mq.parts.map(
          (p) =>
            new TableRow({
              children: [
                cell(para(p.label || "—"), w[0]),
                cell(
                  [
                    ...para(`${L.expected}: ${p.expectedAnswer}`),
                    ...para(`${L.modelAnswer}: ${p.modelAnswer}`),
                    ...(p.rubric ? para(`${L.rubric}: ${p.rubric}`) : []),
                  ],
                  w[1],
                ),
                cell(p.allocation.flatMap((a) => para(`${a.point} (${num(a.marks)})`)), w[2]),
                cell(para(num(p.marks)), w[3]),
              ],
            }),
        ),
      ];
      kids.push(
        new Table({
          width: { size: c.width, type: WidthType.DXA },
          columnWidths: w,
          borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
          rows,
        }),
      );
      if (mq.examinerNotes.trim()) {
        kids.push(new Paragraph({ spacing: { before: 60, after: 60 }, children: [...run(c, `${L.examinerNotes}: `, { bold: true }), ...run(c, mq.examinerNotes, { italics: true })] }));
      }
    }
  }
  const doc = documentFor(c, kids, `${L.markingScheme} — ${title}`);
  return { buffer: Buffer.from(await Packer.toBuffer(doc)), notice: c.notice };
}
