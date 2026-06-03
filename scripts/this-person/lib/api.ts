// this person — API client for the consented industry-signals append flow.
// The default path reads what the browser hands to ad tech and asks the worker
// to turn that into a public wall entry. A second, opt-in path (Google Data
// Portability, below) lets the visitor instead sign into Google and export the
// ad-interest profile Google itself holds.

import type {
  ExtractedFragment,
  ExtractedPerson,
} from "../../../workers/seb-feed/src/this-person/types";

const DEFAULT_API = "https://seb-feed.cbassuarez.workers.dev";

export function apiBase(): string {
  const fromQuery = new URLSearchParams(location.search).get("api");
  if (fromQuery) return fromQuery.replace(/\/+$/, "");
  const meta = document.querySelector('meta[name="this-person-api"]');
  const fromMeta = meta?.getAttribute("content")?.trim();
  if (fromMeta) return fromMeta.replace(/\/+$/, "");
  return DEFAULT_API;
}

export interface AdNetworkConfig {
  enabled: boolean;
  id: string | null;
  label: string | null;
}

export interface AdtechConfig {
  enabled: boolean;
  googleAds: AdNetworkConfig;
  metaPixel: AdNetworkConfig;
}

export interface GamConfig {
  enabled: boolean;
  networkCode: string | null;
  adUnitPath: string | null;
  sizes: [number, number][];
}

export interface GoogleDpConfig {
  enabled: boolean;
}

export interface Config {
  adminEnabled: boolean;
  persistence: string;
  adtech: AdtechConfig;
  gam: GamConfig;
  googleDp: GoogleDpConfig;
}

const DEFAULT_GAM: GamConfig = {
  enabled: false,
  networkCode: null,
  adUnitPath: null,
  sizes: [[300, 250]],
};

const DEFAULT_CONFIG: Config = {
  adminEnabled: false,
  persistence: "unknown",
  adtech: {
    enabled: false,
    googleAds: { enabled: false, id: null, label: null },
    metaPixel: { enabled: false, id: null },
  },
  gam: DEFAULT_GAM,
  googleDp: { enabled: false },
};

function readAdNetwork(value: any): AdNetworkConfig {
  if (!value || typeof value !== "object") return { enabled: false, id: null, label: null };
  const id = typeof value.id === "string" && value.id ? value.id : null;
  return {
    enabled: !!value.enabled && !!id,
    id,
    label: typeof value.label === "string" && value.label ? value.label : null,
  };
}

function readGam(value: any): GamConfig {
  if (!value || typeof value !== "object") return DEFAULT_GAM;
  const networkCode = typeof value.networkCode === "string" && value.networkCode ? value.networkCode : null;
  const adUnitPath = typeof value.adUnitPath === "string" && value.adUnitPath ? value.adUnitPath : null;
  let sizes: [number, number][] = [];
  if (Array.isArray(value.sizes)) {
    for (const pair of value.sizes) {
      if (Array.isArray(pair) && pair.length === 2) {
        const w = Number(pair[0]);
        const h = Number(pair[1]);
        if (Number.isFinite(w) && Number.isFinite(h)) sizes.push([w, h]);
      }
    }
  }
  if (sizes.length === 0) sizes = [[300, 250]];
  return {
    enabled: !!value.enabled && !!networkCode && !!adUnitPath,
    networkCode,
    adUnitPath,
    sizes,
  };
}

export async function fetchConfig(): Promise<Config> {
  try {
    const r = await fetch(apiBase() + "/api/this-person/config");
    if (!r.ok) return DEFAULT_CONFIG;
    const j: any = await r.json();
    const googleAds = readAdNetwork(j?.adtech?.googleAds);
    const metaPixel = readAdNetwork(j?.adtech?.metaPixel);
    return {
      adminEnabled: !!j.adminEnabled,
      persistence: String(j.persistence || "unknown"),
      adtech: {
        enabled: !!j?.adtech?.enabled || googleAds.enabled || metaPixel.enabled,
        googleAds,
        metaPixel,
      },
      gam: readGam(j?.googleAdManager),
      googleDp: { enabled: !!j?.googleDataPortability?.enabled },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// ── Google account read (YouTube + People, popup OAuth) ─────────────────────
// The opt-in enrichment folded into the one flow: the visitor signs into Google
// in a popup window so the main page never navigates away. The worker runs the
// OAuth + the synchronous YouTube/People read and stores the sanitized
// candidates as a ready job; the popup posts the job id back to the opener,
// which polls until ready and includes the selected candidates in the single
// merged append.

export interface GoogleAdInterestCandidate {
  id: string;
  label: string;
  relation: string;
  kind: string;
  confidence: number;
  claimSentence: string;
  sourceNote: string;
  evidenceTitle: string;
  evidenceTime?: string;
}

export type GoogleDpJobState = "in_progress" | "complete" | "empty" | "failed";

export interface GoogleDpJobResult {
  state: GoogleDpJobState;
  candidates: GoogleAdInterestCandidate[];
  error?: string;
}

// Builds the URL that begins the popup OAuth flow. returnTo must be a
// this-person page on an allowed host — the worker validates it and uses its
// origin as the postMessage target, falling back to the canonical URL.
export function googleDpPopupStartUrl(returnTo: string): string {
  return (
    apiBase() +
    "/api/this-person/google/start?mode=popup&returnTo=" +
    encodeURIComponent(returnTo)
  );
}

export async function pollGoogleDpJob(id: string): Promise<GoogleDpJobResult> {
  const r = await fetch(apiBase() + "/api/this-person/google/job?id=" + encodeURIComponent(id));
  if (!r.ok) {
    return { state: "failed", candidates: [], error: "job_http_" + r.status };
  }
  const j: any = await r.json();
  const state = String(j?.state || "") as GoogleDpJobState;
  const candidates = Array.isArray(j?.candidates) ? (j.candidates as GoogleAdInterestCandidate[]) : [];
  if (state === "complete" || state === "empty" || state === "failed") {
    return { state, candidates, error: j?.error ? String(j.error) : undefined };
  }
  return { state: "in_progress", candidates: [] };
}

export interface AdRenderRecord {
  advertiserId: string | null;
  campaignId: string | null;
  creativeId: string | null;
  lineItemId: string | null;
  orderId: string | null;
  yieldGroupIds: string[];
  companyIds: string[];
  size: [number, number] | null;
  iframeUrl: string | null;
  thirdPartyHosts: string[];
  isEmpty: boolean;
  serviceName: string | null;
}

export interface ResolvedAdNames {
  advertisers: Record<string, string>;
  lineItems: Record<string, string>;
  orders: Record<string, string>;
  creatives: Record<string, string>;
}

export interface WebSignalsAppendInput {
  source: "ad_preferences_surface";
  platformHints: string[];
  fragments: ExtractedFragment[];
  seed: number;
  adRender?: AdRenderRecord;
  // Optional consented-Google fold-in: a ready job id from the popup OAuth read
  // plus the candidate ids the visitor chose to publish. The worker merges them
  // into the same entry.
  googleJobId?: string;
  candidateIds?: string[];
}

export async function appendWebSignals(payload: WebSignalsAppendInput): Promise<ExtractedPerson> {
  const r = await fetch(apiBase() + "/api/this-person/web-signals/append", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    let detail = "";
    try {
      const j: any = await r.json();
      detail = String(j?.error || "");
    } catch {
      // ignore
    }
    throw new Error("append_failed" + (detail ? ":" + detail : ""));
  }
  const j: any = await r.json();
  return j.person as ExtractedPerson;
}

// Resolves GAM advertiser/order/lineItem/creative IDs to display names.
// Used so the review screen can preview "this person was just shown an ad
// from Patagonia" before the visitor presses append.
export async function resolveAdRender(record: AdRenderRecord): Promise<ResolvedAdNames> {
  const empty: ResolvedAdNames = { advertisers: {}, lineItems: {}, orders: {}, creatives: {} };
  try {
    const r = await fetch(apiBase() + "/api/this-person/gam/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adRender: record }),
    });
    if (!r.ok) return empty;
    const j: any = await r.json();
    const resolved = j?.resolved;
    if (!resolved || typeof resolved !== "object") return empty;
    return {
      advertisers: resolved.advertisers && typeof resolved.advertisers === "object" ? resolved.advertisers : {},
      lineItems: resolved.lineItems && typeof resolved.lineItems === "object" ? resolved.lineItems : {},
      orders: resolved.orders && typeof resolved.orders === "object" ? resolved.orders : {},
      creatives: resolved.creatives && typeof resolved.creatives === "object" ? resolved.creatives : {},
    };
  } catch {
    return empty;
  }
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
