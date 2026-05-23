// this person — API client for the Google Data Portability flow.

import type { ExtractedPerson } from "../../../worker/src/this-person/types";

const DEFAULT_API = "https://seb-feed.cbassuarez.workers.dev";

export function apiBase(): string {
  const fromQuery = new URLSearchParams(location.search).get("api");
  if (fromQuery) return fromQuery.replace(/\/+$/, "");
  const meta = document.querySelector('meta[name="this-person-api"]');
  const fromMeta = meta?.getAttribute("content")?.trim();
  if (fromMeta) return fromMeta.replace(/\/+$/, "");
  return DEFAULT_API;
}

export interface GoogleDataPortabilityConfig {
  enabled: boolean;
  scope: string;
  resource: string;
  startUrl: string;
}

export interface Config {
  adminEnabled: boolean;
  persistence: string;
  googleDataPortability: GoogleDataPortabilityConfig;
}

export interface GoogleAdCandidate {
  id: string;
  label: string;
  relation: "likes" | "less" | "blocked" | "seen" | "visited" | "associated";
  kind: string;
  confidence: number;
  claimSentence: string;
  sourceNote: string;
  evidenceTitle: string;
  evidenceTime?: string;
}

export type GoogleJobResult =
  | { state: "in_progress"; candidates?: undefined; error?: undefined }
  | { state: "complete"; candidates: GoogleAdCandidate[]; error?: undefined }
  | { state: "empty"; candidates: GoogleAdCandidate[]; error?: undefined }
  | { state: "failed"; candidates?: undefined; error: string };

const DEFAULT_CONFIG: Config = {
  adminEnabled: false,
  persistence: "unknown",
  googleDataPortability: {
    enabled: false,
    scope: "https://www.googleapis.com/auth/dataportability.myactivity.myadcenter",
    resource: "myactivity.myadcenter",
    startUrl: "/api/this-person/google/start",
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
      googleDataPortability: {
        enabled: !!j?.googleDataPortability?.enabled,
        scope: String(j?.googleDataPortability?.scope || DEFAULT_CONFIG.googleDataPortability.scope),
        resource: String(j?.googleDataPortability?.resource || DEFAULT_CONFIG.googleDataPortability.resource),
        startUrl: String(j?.googleDataPortability?.startUrl || DEFAULT_CONFIG.googleDataPortability.startUrl),
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function googleStartUrl(): string {
  const u = new URL(apiBase() + "/api/this-person/google/start");
  u.searchParams.set("returnTo", location.href.replace(/#.*$/, ""));
  return u.toString();
}

export async function fetchGoogleJob(id: string): Promise<GoogleJobResult> {
  const u = new URL(apiBase() + "/api/this-person/google/job");
  u.searchParams.set("id", id);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error("job_failed");
  return (await r.json()) as GoogleJobResult;
}

export async function appendGoogleCandidates(id: string, candidateIds: string[]): Promise<ExtractedPerson> {
  const r = await fetch(apiBase() + "/api/this-person/google/append", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, candidateIds }),
  });
  if (!r.ok) throw new Error("append_failed");
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
