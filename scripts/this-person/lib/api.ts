// this person — API client for the consented industry-signals append flow.
// We do not OAuth, we do not upload archives. The page reads what the browser
// hands to ad tech and asks the worker to turn that into a public wall entry.

import type {
  ExtractedFragment,
  ExtractedPerson,
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

function readAdNetwork(value: any): AdNetworkConfig {
  if (!value || typeof value !== "object") return { enabled: false, id: null, label: null };
  const id = typeof value.id === "string" && value.id ? value.id : null;
  return {
    enabled: !!value.enabled && !!id,
    id,
    label: typeof value.label === "string" && value.label ? value.label : null,
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
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export interface WebSignalsAppendInput {
  source: "ad_preferences_surface";
  platformHints: string[];
  fragments: ExtractedFragment[];
  seed: number;
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
