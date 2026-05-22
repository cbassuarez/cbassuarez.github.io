// this person — browser Topics API, demoted to a minor extraction source.
// This is not the centre of the work. It is called only on explicit request,
// always with { skipObservation: true }, and if it returns nothing no entry is
// produced — a Topics failure never appends and never dominates the experience.

import type { ExtractedFragment } from "../../../worker/src/this-person/types";

const TOPICS_TIMEOUT_MS = 2500;

declare global {
  interface Document {
    browsingTopics?: (options?: { skipObservation?: boolean }) => Promise<unknown[]>;
  }
}

function topicValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return "advertising topic / id " + value;
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const id = Number(obj.topic ?? obj.id);
    if (Number.isFinite(id)) return "advertising topic / id " + id;
  }
  return "";
}

export interface BrowserTopicsResult {
  fragments: ExtractedFragment[];
  platformHints: string[];
}

// Resolves to extracted fragments only when the browser actually returns
// topics. Returns null for every failure mode (unsupported, empty, error) —
// the caller treats null as a private non-event, never a wall entry.
export async function requestBrowserTopics(): Promise<BrowserTopicsResult | null> {
  if (typeof document.browsingTopics !== "function") return null;
  try {
    const call = document.browsingTopics({ skipObservation: true });
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), TOPICS_TIMEOUT_MS);
    });
    const raw = await Promise.race([call, timeout]);
    const list = Array.isArray(raw) ? raw : [];
    const values = list.map(topicValue).filter((v) => v.length > 0);
    if (values.length === 0) return null;
    const fragments: ExtractedFragment[] = values.map((value) => ({
      value,
      kind: "unknown",
      platformHint: "browser topics",
      confidence: 0.5,
      includeInWall: true,
    }));
    return { fragments, platformHints: ["browser topics"] };
  } catch {
    return null;
  }
}
