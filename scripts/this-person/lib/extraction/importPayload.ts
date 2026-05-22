// this person — extension / bookmarklet import payload.
// The /import route receives extracted visible text in the URL fragment (never
// the query string, so it is not sent to a server). The payload is decoded and
// parsed entirely client-side; nothing reaches the worker until the
// participant previews and confirms.

export interface ExtensionPayload {
  source: "active_tab_extension";
  platformHint?: string;
  pageTitle?: string;
  extractedText: string;
  extractedAtLocal?: string;
}

const MAX_PAYLOAD_TEXT = 200 * 1024;

// base64url (UTF-8) — the encoding produced by the extension / bookmarklet.
function fromBase64Url(input: string): string {
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePayload(encoded: string): ExtensionPayload | null {
  let json: string;
  try {
    json = fromBase64Url(encoded);
  } catch {
    return null;
  }
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const extractedText = String(parsed.extractedText || "").slice(0, MAX_PAYLOAD_TEXT);
  if (!extractedText.trim()) return null;
  return {
    source: "active_tab_extension",
    platformHint: parsed.platformHint ? String(parsed.platformHint).slice(0, 80) : undefined,
    pageTitle: parsed.pageTitle ? String(parsed.pageTitle).slice(0, 200) : undefined,
    extractedText,
    extractedAtLocal: parsed.extractedAtLocal ? String(parsed.extractedAtLocal).slice(0, 40) : undefined,
  };
}

// Reads payload= from the URL fragment of the current page.
export function readImportPayloadFromHash(): ExtensionPayload | null {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const encoded = params.get("payload");
  if (!encoded) return null;
  return decodePayload(encoded);
}
