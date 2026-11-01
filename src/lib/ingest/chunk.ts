/** Split text into overlapping chunks, preferring paragraph boundaries. */
export function chunkText(text: string, target = 1200, overlap = 150): string[] {
  const paras = text.split(/\n{2,}/).flatMap((p) => splitLong(p.trim(), target));
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (!p) continue;
    if (cur && cur.length + p.length + 2 > target) {
      chunks.push(cur);
      cur = cur.slice(-overlap).replace(/^\S*\s/, "") + "\n\n" + p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

function splitLong(p: string, max: number): string[] {
  if (p.length <= max) return [p];
  const parts: string[] = [];
  let cur = "";
  for (const sentence of p.split(/(?<=[.!?])\s+/)) {
    if (cur && cur.length + sentence.length + 1 > max) {
      parts.push(cur);
      cur = sentence;
    } else {
      cur = cur ? cur + " " + sentence : sentence;
    }
    while (cur.length > max * 1.5) {
      parts.push(cur.slice(0, max));
      cur = cur.slice(max);
    }
  }
  if (cur) parts.push(cur);
  return parts;
}
