// this person — API client. All calls go to the seb-feed worker. The only data
// sent is the participant-approved set of fragments (or the final append).
// Raw screenshots, raw archives, and raw OCR text never leave the browser.

import type {
  ExtractedClaim,
  ExtractedFragment,
  ExtractedPerson,
  ExtractionSource,
} from "../../../worker/src/this-person/types";

const DEFAULT_API = "https://seb-feed.cbassuarez.workers.dev";

export function apiBase(): string {
  const fromQuery = new URLSearchParams(location.search).get("api");
  if (fromQuery) return fromQuery.replace(/\/+$/, "");
  const meta = document.querySelector('meta[name="this-person-api"]');
  const fromMeta = meta?.getAttribute("content")?.trim();
  if (fromMeta) return fromMeta.replace(/\/+$/, "");
  return DEFAULT_API;
}

export interface AdtechConfig {
  enabled: boolean;
  googleAds: { enabled: boolean; id: string | null; label: string | null };
  metaPixel: { enabled: boolean; id: string | null };
}

export interface Config {
  adminEnabled: boolean;
  persistence: string;
  adtech: AdtechConfig;
}

const DEFAULT_CONFIG: Config = {
  adminEnabled: false,
  persistence: "unknown",
  adtech: {
    enabled: false,
    googleAds: { enabled: false, id: null, label: null },
    metaPixel: { enabled: false, id: null },
  },
};

export async function fetchConfig(): Promise<Config> {
  try {
    const r = await fetch(apiBase() + "/api/this-person/config");
    if (!r.ok) return DEFAULT_CONFIG;
    const j: any = await r.json();
    return {
      adminEnabled: !!j.adminEnabled,
      persistence: String(j.persistence || "unknown"),
      adtech: {
        enabled: !!j?.adtech?.enabled,
        googleAds: {
          enabled: !!j?.adtech?.googleAds?.enabled,
          id: j?.adtech?.googleAds?.id ?? null,
          label: j?.adtech?.googleAds?.label ?? null,
        },
        metaPixel: {
          enabled: !!j?.adtech?.metaPixel?.enabled,
          id: j?.adtech?.metaPixel?.id ?? null,
        },
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export interface PreviewResult {
  source: ExtractionSource;
  platformHints: string[];
  fragments: ExtractedFragment[];
  claims: ExtractedClaim[];
  generatedText: string;
  extractionSummary: string;
  seed: number;
}

export async function requestPreview(
  source: ExtractionSource,
  platformHints: string[],
  fragments: ExtractedFragment[]
): Promise<PreviewResult> {
  const r = await fetch(apiBase() + "/api/this-person/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, platformHints, fragments }),
  });
  if (!r.ok) throw new Error("preview_failed");
  const j: any = await r.json();
  return {
    source: j.source,
    platformHints: Array.isArray(j.platformHints) ? j.platformHints : [],
    fragments: Array.isArray(j.fragments) ? j.fragments : [],
    claims: Array.isArray(j.claims) ? j.claims : [],
    generatedText: String(j.generatedText || ""),
    extractionSummary: String(j.extractionSummary || ""),
    seed: Number(j.seed) || 0,
  };
}

export async function appendPerson(
  source: ExtractionSource,
  platformHints: string[],
  fragments: ExtractedFragment[],
  seed: number,
  keptClaimIndices: number[] | null
): Promise<ExtractedPerson> {
  const r = await fetch(apiBase() + "/api/this-person/append", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, platformHints, fragments, seed, keptClaimIndices }),
  });
  if (!r.ok) throw new Error("append_failed");
  const j: any = await r.json();
  return j.person as ExtractedPerson;
}

export async function enrollPerson(publicNumber: number): Promise<ExtractedPerson> {
  const r = await fetch(apiBase() + "/api/this-person/enroll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: publicNumber }),
  });
  if (!r.ok) throw new Error("enroll_failed");
  const j: any = await r.json();
  return j.person as ExtractedPerson;
}

export async function fetchState(): Promise<ExtractedPerson[]> {
  try {
    const r = await fetch(apiBase() + "/api/this-person/state");
    if (!r.ok) return [];
    const j: any = await r.json();
    return Array.isArray(j.persons) ? (j.persons as ExtractedPerson[]) : [];
  } catch {
    return [];
  }
}
