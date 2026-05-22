// this person — data-export ingestion.
// Reads a platform data export (ZIP, JSON, HTML, CSV, TXT) entirely in the
// browser, walks it for advertising-relevant text, and returns that text for
// fragment extraction and participant review. Raw archives are never uploaded
// and never persisted. Size and entry caps guard against archive bombs.

import JSZip from "jszip";

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024; // input file cap
const MAX_ENTRIES = 6000;
const PER_ENTRY_UNCOMPRESSED_CAP = 8 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 600 * 1024; // how much text we actually keep
const TEXT_EXTENSIONS = ["json", "csv", "tsv", "txt", "html", "htm", "xml"];

// Paths containing these terms hold the advertising data; they are read first.
const PRIORITY_TERMS = [
  "ad", "ads", "advert", "advertis", "interest", "topic", "preference",
  "activity", "inferred", "audience", "segment", "personaliz", "brand",
  "profile", "off-facebook", "off_facebook", "off-site",
];

export interface ArchiveResult {
  text: string;
  filesScanned: number;
}

function extension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

function priorityScore(path: string): number {
  const lower = path.toLowerCase();
  let score = 0;
  for (const term of PRIORITY_TERMS) if (lower.includes(term)) score++;
  return score;
}

function collectJsonStrings(value: unknown, out: string[], budget: { left: number }): void {
  if (budget.left <= 0) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length >= 2 && trimmed.length <= 200) {
      out.push(trimmed);
      budget.left -= trimmed.length;
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectJsonStrings(item, out, budget);
  } else if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      collectJsonStrings((value as Record<string, unknown>)[key], out, budget);
    }
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function contentToText(path: string, content: string): string {
  const ext = extension(path);
  if (ext === "json") {
    try {
      const parsed = JSON.parse(content);
      const out: string[] = [];
      collectJsonStrings(parsed, out, { left: MAX_EXTRACTED_CHARS });
      return out.join("\n");
    } catch {
      return content; // not valid JSON — keep raw text
    }
  }
  if (ext === "csv" || ext === "tsv") {
    const sep = ext === "tsv" ? /\t/ : /,/;
    return content
      .split(/\r?\n/)
      .map((row) => row.split(sep).map((cell) => cell.replace(/^"|"$/g, "").trim()).join("\n"))
      .join("\n");
  }
  if (ext === "html" || ext === "htm" || ext === "xml") {
    return htmlToText(content);
  }
  return content;
}

async function ingestZip(file: File): Promise<ArchiveResult> {
  const zip = await JSZip.loadAsync(file);
  const entries: { path: string; entry: any }[] = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    if (!TEXT_EXTENSIONS.includes(extension(relativePath))) return;
    entries.push({ path: relativePath, entry });
  });
  // Advertising-relevant paths first, then everything else.
  entries.sort((a, b) => priorityScore(b.path) - priorityScore(a.path));

  const parts: string[] = [];
  let total = 0;
  let scanned = 0;
  for (const { path, entry } of entries.slice(0, MAX_ENTRIES)) {
    if (total >= MAX_EXTRACTED_CHARS) break;
    const declared = Number(entry?._data?.uncompressedSize);
    if (Number.isFinite(declared) && declared > PER_ENTRY_UNCOMPRESSED_CAP) continue;
    let content: string;
    try {
      content = await entry.async("string");
    } catch {
      continue;
    }
    scanned++;
    const text = contentToText(path, content).slice(0, MAX_EXTRACTED_CHARS - total);
    if (text) {
      parts.push(text);
      total += text.length;
    }
  }
  return { text: parts.join("\n"), filesScanned: scanned };
}

// Ingests one uploaded file: a ZIP archive or a single text/data file.
export async function ingestArchive(file: File): Promise<ArchiveResult> {
  if (file.size > MAX_ARCHIVE_BYTES) {
    throw new Error("archive_too_large");
  }
  const isZip =
    extension(file.name) === "zip" ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed";
  if (isZip) {
    try {
      return await ingestZip(file);
    } catch (err) {
      if (err instanceof Error && err.message === "archive_too_large") throw err;
      throw new Error("archive_unreadable");
    }
  }
  // A single text/data file.
  let content: string;
  try {
    content = await file.text();
  } catch {
    throw new Error("archive_unreadable");
  }
  return {
    text: contentToText(file.name, content).slice(0, MAX_EXTRACTED_CHARS),
    filesScanned: 1,
  };
}
