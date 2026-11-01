/**
 * Legacy (non-Unicode) Tamil fonts such as Bamini store Tamil as Latin-range character codes.
 * We keep all content in Unicode and convert Tamil runs only when writing the DOCX.
 */
export const isLegacyTamilFont = (name: string) => /bamini/i.test(name);

/** Unicode Tamil block + joiners. */
const isTamilChar = (ch: string) => /[஀-௿‌‍]/.test(ch);

export interface Segment {
  text: string;
  tamil: boolean;
}

/**
 * Splits text into Tamil runs (to be converted + set in the legacy font) and everything else
 * (spaces, digits, punctuation, English — kept in a normal font, because a legacy font would
 * draw those ASCII codes as Tamil glyphs).
 */
export function splitScripts(text: string): Segment[] {
  const out: Segment[] = [];
  for (const ch of text) {
    const tamil = isTamilChar(ch);
    const last = out[out.length - 1];
    if (last && last.tamil === tamil) last.text += ch;
    else out.push({ text: ch, tamil });
  }
  return out;
}

type Convert = (unicodeTamil: string) => string;
// Kept on globalThis so every copy of this module (Next dev bundles, test runners) shares one state.
const g = globalThis as unknown as { __baminiState?: { converter: Convert | null; loading: Promise<boolean> | null } };
const state = (g.__baminiState ??= { converter: null, loading: null });

/** Loads the Unicode→Bamini converter (server only). Resolves false if it cannot be loaded. */
export function loadBaminiConverter(): Promise<boolean> {
  if (state.converter) return Promise.resolve(true);
  state.loading ??= (async () => {
    if (process.env.EXAM_DISABLE_ARIL === "1") return false; // lets tests guarantee the real converter never loads
    try {
      const mod = (await import("@digital-tamil/aril-wasm")) as unknown as { to_legacy?: (s: string, enc: string) => string; default?: { to_legacy?: (s: string, enc: string) => string } };
      const fn = mod.to_legacy ?? mod.default?.to_legacy;
      if (!fn) return false;
      fn("அ", "bamini"); // smoke-test the engine
      state.converter = (s) => fn(s, "bamini");
      return true;
    } catch (e) {
      console.error("[legacyFont] could not load Bamini converter:", e);
      return false;
    }
  })();
  return state.loading;
}

export function toBamini(text: string): string {
  if (!state.converter) throw new Error("Bamini converter not loaded");
  return state.converter(text);
}

/** For tests: install a fake converter. */
export function setConverterForTests(fn: Convert | null) {
  state.converter = fn;
  state.loading = null;
}
