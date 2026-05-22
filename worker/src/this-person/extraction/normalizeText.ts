// this person — text normalization.
// OCR output, archive text, and extension payloads all arrive as messy text.
// This reduces them to clean, single-spaced candidate lines. Pure module.

const MAX_LINE_LEN = 240;
const MAX_LINES = 4000;

// One raw blob into trimmed, control-character-free, single-spaced lines.
export function normalizeText(raw: string): string[] {
  const lines: string[] = [];
  const source = String(raw ?? "");
  for (const rawLine of source.split(/\r?\n/)) {
    let line = "";
    for (const ch of rawLine) {
      const code = ch.codePointAt(0) ?? 0;
      line += code < 32 || code === 127 ? " " : ch;
    }
    line = line.replace(/\s+/g, " ").trim();
    if (line) lines.push(line.slice(0, MAX_LINE_LEN));
    if (lines.length >= MAX_LINES) break;
  }
  return lines;
}

// A single value, collapsed to one clean line.
export function normalizeValue(raw: string): string {
  let out = "";
  for (const ch of String(raw ?? "")) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

// Lower-cased form for keyword matching.
export function foldCase(value: string): string {
  return normalizeValue(value).toLowerCase();
}
