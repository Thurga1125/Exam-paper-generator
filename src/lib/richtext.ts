/**
 * Tiny rich-text format used inside question text:
 *   **bold**, *italic*, $math$, markdown pipe tables, ``` code fences, blank-line paragraphs.
 * One parser feeds both the on-screen preview and the DOCX export.
 */

export type Inline =
  | { t: "text"; s: string; b?: boolean; i?: boolean }
  | { t: "math"; s: string };

export type Block =
  | { t: "p"; inline: Inline[] }
  | { t: "table"; rows: Inline[][][]; header: boolean }
  | { t: "code"; text: string };

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push({ t: "code", text: code.join("\n") });
      continue;
    }
    if (isTableLine(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isTableLine(lines[i])) rows.push(splitRow(lines[i++]));
      const header = rows.length > 1 && rows[1].every((c) => /^:?-{2,}:?$/.test(c.trim()));
      const body = header ? [rows[0], ...rows.slice(2)] : rows;
      blocks.push({ t: "table", header, rows: body.map((r) => r.map((c) => parseInline(c.trim()))) });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    blocks.push({ t: "p", inline: parseInline(line) });
    i++;
  }
  return blocks;
}

const isTableLine = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const splitRow = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|");

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\$([^$\n]+)\$|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: "text", s: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "math", s: m[1] });
    else if (m[2] !== undefined) out.push({ t: "text", s: m[2], b: true });
    else out.push({ t: "text", s: m[3], i: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", s: s.slice(last) });
  return out;
}

/* ------------------------------ math ------------------------------ */

const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ",
  pi: "π", sigma: "σ", omega: "ω", phi: "φ", rho: "ρ", tau: "τ", Delta: "Δ", Sigma: "Σ", Omega: "Ω",
  times: "×", cdot: "·", div: "÷", pm: "±", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠",
  approx: "≈", infty: "∞", sum: "∑", prod: "∏", int: "∫", rightarrow: "→", to: "→", Rightarrow: "⇒",
  leftarrow: "←", in: "∈", subset: "⊂", cup: "∪", cap: "∩", forall: "∀", exists: "∃", partial: "∂",
  nabla: "∇", degree: "°", sqrt: "√",
};

export function replaceSymbols(s: string): string {
  return s.replace(/\\([A-Za-z]+)/g, (m, n) => SYMBOLS[n] ?? m).replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/!=/g, "≠").replace(/->/g, "→");
}

/** Math AST produced by a small recursive-descent parser. */
export type MathNode =
  | { t: "run"; s: string }
  | { t: "sup"; base: MathNode[]; sup: MathNode[] }
  | { t: "sub"; base: MathNode[]; sub: MathNode[] }
  | { t: "frac"; num: MathNode[]; den: MathNode[] }
  | { t: "sqrt"; body: MathNode[] }
  | { t: "paren"; body: MathNode[] };

export function parseMath(src: string): MathNode[] {
  const s = replaceSymbols(src);
  let pos = 0;

  const peek = () => s[pos];

  function parseSeq(stop: string): MathNode[] {
    const out: MathNode[] = [];
    while (pos < s.length && !stop.includes(peek())) {
      const node = parseTerm(stop);
      if (node) out.push(...node);
    }
    return out;
  }

  function parseAtom(): MathNode[] {
    const c = peek();
    if (c === "(" || c === "{") {
      const close = c === "(" ? ")" : "}";
      pos++;
      const body = parseSeq(close);
      if (peek() === close) pos++;
      return c === "(" ? [{ t: "paren", body }] : body;
    }
    // sqrt(…) or √(…)
    if (s.startsWith("sqrt", pos) || c === "√") {
      pos += c === "√" ? 1 : 4;
      const arg = peek() === "(" || peek() === "{" ? parseAtom() : parseWord();
      const body = arg.length === 1 && arg[0].t === "paren" ? arg[0].body : arg;
      return [{ t: "sqrt", body }];
    }
    return parseWord();
  }

  function parseWord(): MathNode[] {
    const m = /^[A-Za-z0-9.]+|^./.exec(s.slice(pos));
    if (!m) return [];
    pos += m[0].length;
    return [{ t: "run", s: m[0] }];
  }

  function parseTerm(stop: string): MathNode[] | null {
    let base = parseAtom();
    if (!base.length) {
      pos++;
      return null;
    }
    for (;;) {
      const c = peek();
      if (c === "^") {
        pos++;
        base = [{ t: "sup", base, sup: unwrap(parseAtom()) }];
      } else if (c === "_") {
        pos++;
        base = [{ t: "sub", base, sub: unwrap(parseAtom()) }];
      } else if (c === "/" && !stop.includes("/")) {
        pos++;
        const den = parseAtom();
        base = [{ t: "frac", num: unwrap(base), den: unwrap(den) }];
      } else break;
    }
    return base;
  }

  const unwrap = (n: MathNode[]): MathNode[] => (n.length === 1 && n[0].t === "paren" ? n[0].body : n);

  return parseSeq("");
}

/** Plain-text rendering with unicode super/subscripts for places that cannot show real math. */
export function mathToPlain(nodes: MathNode[]): string {
  const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", n: "ⁿ", i: "ⁱ" };
  const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", i: "ᵢ", j: "ⱼ", n: "ₙ", x: "ₓ" };
  const map = (txt: string, t: Record<string, string>, open: string) =>
    [...txt].every((c) => t[c]) ? [...txt].map((c) => t[c]).join("") : `${open}${txt})`;
  return nodes
    .map((n) => {
      switch (n.t) {
        case "run":
          return n.s;
        case "sup":
          return mathToPlain(n.base) + map(mathToPlain(n.sup), SUP, "^(");
        case "sub":
          return mathToPlain(n.base) + map(mathToPlain(n.sub), SUB, "_(");
        case "frac": {
          const wrap = (x: MathNode[]) => (x.length === 1 && x[0].t === "run" ? mathToPlain(x) : `(${mathToPlain(x)})`);
          return `${wrap(n.num)}/${wrap(n.den)}`;
        }
        case "sqrt":
          return `√(${mathToPlain(n.body)})`;
        case "paren":
          return `(${mathToPlain(n.body)})`;
      }
    })
    .join("");
}
