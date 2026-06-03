// this person — consented Google account read via the YouTube Data API and the
// People API. After OAuth, the worker calls these synchronously and maps the
// response into the same GoogleAdInterestCandidate shape the append path
// already consumes (so /google/append and the wall render are unchanged).
//
// Unlike the Data Portability path (EEA-only), these APIs work for US accounts.
// We deliberately read interest signals (YouTube subscriptions + likes) and
// coarse demographics (gender, employer, age from birthday year), and skip
// directly identifying fields (name, photo, email, addresses).

import {
  LIMITS,
  type ClaimIntensity,
  type ExtractedClaim,
  type ExtractedFragment,
} from "./types";
import { classifyFragment } from "./extraction/classifyFragment";
import { isRedactedEmpty, redactText } from "./extraction/redactIdentifiers";
import type { GoogleAdInterestCandidate, GoogleAdInterestRelation } from "./googleDataPortability";

export const GOOGLE_PROFILE_SCOPE = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/user.birthday.read",
  "https://www.googleapis.com/auth/user.gender.read",
  "https://www.googleapis.com/auth/user.organization.read",
].join(" ");

const YT_API = "https://www.googleapis.com/youtube/v3";
const PEOPLE_API =
  "https://people.googleapis.com/v1/people/me?personFields=genders,birthdays,organizations";

const MAX_SUBSCRIPTIONS = 16;
const MAX_LIKES = 12;

function oneLine(value: unknown, maxLen = 160): string {
  const raw = String(value ?? "");
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

// Short, URL-safe id matching the append validation regex /^[A-Za-z0-9_-]{4,32}$/.
function hashId(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "g" + (h >>> 0).toString(36) + seed.length.toString(36);
}

function intensityForRelation(relation: GoogleAdInterestRelation): ClaimIntensity {
  return relation === "associated" ? "institutional" : "banal";
}

function makeCandidate(opts: {
  rawLabel: string;
  relation: GoogleAdInterestRelation;
  confidence: number;
  claimSentence: string;
  sourceNote: string;
  evidenceTitle: string;
}): GoogleAdInterestCandidate | null {
  const { text } = redactText(oneLine(opts.rawLabel, 120));
  if (!text || isRedactedEmpty(text)) return null;
  return {
    id: hashId(opts.relation + "|" + text.toLowerCase() + "|" + opts.sourceNote),
    label: text,
    relation: opts.relation,
    kind: classifyFragment(text),
    confidence: opts.confidence,
    claimSentence: opts.claimSentence.replace(opts.rawLabel, text),
    sourceNote: opts.sourceNote,
    evidenceTitle: oneLine(opts.evidenceTitle, 200) || text,
  };
}

async function googleGetJson(url: string, accessToken: string): Promise<any | null> {
  try {
    const resp = await fetch(url, { headers: { authorization: "Bearer " + accessToken } });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function ageFromBirthdays(birthdays: any[]): number | null {
  for (const entry of birthdays || []) {
    const year = Number(entry?.date?.year);
    if (Number.isFinite(year) && year > 1900 && year <= new Date().getUTCFullYear()) {
      const age = new Date().getUTCFullYear() - year;
      if (age >= 0 && age < 120) return age;
    }
  }
  return null;
}

// Fetches the consented account signals and maps them into candidates. Returns
// whatever it can; a failure on one API does not abort the others.
export async function fetchGoogleProfileCandidates(
  accessToken: string
): Promise<GoogleAdInterestCandidate[]> {
  // Subscriptions are ordered by relevance (YouTube's own engagement ranking),
  // not alphabetically — so the channels this person actually watches surface
  // first instead of whatever starts with "A".
  const [subs, likes, person] = await Promise.all([
    googleGetJson(
      YT_API + "/subscriptions?part=snippet&mine=true&order=relevance&maxResults=" + MAX_SUBSCRIPTIONS,
      accessToken
    ),
    googleGetJson(YT_API + "/videos?part=snippet&myRating=like&maxResults=" + MAX_LIKES, accessToken),
    googleGetJson(PEOPLE_API, accessToken),
  ]);

  // Demographics are few and the most defining, so they are always surfaced
  // first; subscriptions and liked videos are then interleaved so a long
  // subscription list cannot crowd the likes out of the MAX_FRAGMENTS budget.
  const demographics: GoogleAdInterestCandidate[] = [];
  const subscriptions: GoogleAdInterestCandidate[] = [];
  const likedVideos: GoogleAdInterestCandidate[] = [];

  if (person) {
    const gender = oneLine(person?.genders?.[0]?.formattedValue || person?.genders?.[0]?.value, 40);
    if (gender) {
      const c = makeCandidate({
        rawLabel: gender,
        relation: "associated",
        confidence: 0.9,
        claimSentence: "this person's Google profile lists their gender as " + gender,
        sourceNote: "Google People API: gender",
        evidenceTitle: gender,
      });
      if (c) demographics.push(c);
    }

    const age = ageFromBirthdays(person?.birthdays);
    if (age != null) {
      const ageLabel = String(age);
      const c = makeCandidate({
        rawLabel: ageLabel,
        relation: "associated",
        confidence: 0.9,
        claimSentence: "this person is " + age + ", by the birthday on their Google account",
        sourceNote: "Google People API: birthday",
        evidenceTitle: ageLabel,
      });
      if (c) demographics.push(c);
    }

    const org = (person?.organizations as any[])?.[0];
    const orgName = oneLine(org?.name, 80);
    const orgTitle = oneLine(org?.title, 80);
    if (orgName || orgTitle) {
      const phrase = orgTitle && orgName ? orgTitle + " at " + orgName : orgTitle || orgName;
      const c = makeCandidate({
        rawLabel: phrase,
        relation: "associated",
        confidence: 0.85,
        claimSentence: "this person's Google profile says they are " + phrase,
        sourceNote: "Google People API: organization",
        evidenceTitle: phrase,
      });
      if (c) demographics.push(c);
    }
  }

  for (const item of (subs?.items as any[]) || []) {
    const channel = oneLine(item?.snippet?.title, 120);
    if (!channel) continue;
    const c = makeCandidate({
      rawLabel: channel,
      relation: "likes",
      confidence: 0.82,
      claimSentence: "this person subscribes to " + channel + " on YouTube",
      sourceNote: "YouTube: channel subscription",
      evidenceTitle: channel,
    });
    if (c) subscriptions.push(c);
  }

  for (const item of (likes?.items as any[]) || []) {
    const title = oneLine(item?.snippet?.title, 120);
    if (!title) continue;
    const c = makeCandidate({
      rawLabel: title,
      relation: "likes",
      confidence: 0.7,
      claimSentence: "this person liked the video “" + title + "” on YouTube",
      sourceNote: "YouTube: liked video",
      evidenceTitle: title,
    });
    if (c) likedVideos.push(c);
  }

  const byId = new Map<string, GoogleAdInterestCandidate>();
  const add = (candidate: GoogleAdInterestCandidate | undefined): void => {
    if (!candidate) return;
    if (!byId.has(candidate.id) && byId.size < LIMITS.MAX_FRAGMENTS) {
      byId.set(candidate.id, candidate);
    }
  };

  demographics.forEach(add);
  const rounds = Math.max(subscriptions.length, likedVideos.length);
  for (let i = 0; i < rounds && byId.size < LIMITS.MAX_FRAGMENTS; i++) {
    add(subscriptions[i]);
    add(likedVideos[i]);
  }

  return [...byId.values()];
}

export function buildGoogleProfileEntry(candidates: GoogleAdInterestCandidate[]): {
  fragments: ExtractedFragment[];
  claims: ExtractedClaim[];
  generatedText: string;
  extractionSummary: string;
} {
  const selected = candidates.slice(0, LIMITS.MAX_FRAGMENTS);
  const fragments: ExtractedFragment[] = selected.map((candidate) => ({
    value: candidate.label,
    kind: candidate.kind,
    platformHint:
      candidate.sourceNote.indexOf("YouTube") === 0 ? "YouTube" : "Google account",
    confidence: candidate.confidence,
    includeInWall: true,
  }));
  const claims: ExtractedClaim[] = selected.slice(0, LIMITS.MAX_CLAIMS).map((candidate) => ({
    sentence: candidate.claimSentence,
    sourceNote: candidate.sourceNote,
    fragments: [candidate.label],
    intensity: intensityForRelation(candidate.relation),
  }));
  const generatedText = claims
    .map((claim) => claim.sentence + "\nsource: " + claim.sourceNote)
    .join("\n\n");
  const extractionSummary =
    "A consented Google account read returned " +
    selected.length +
    " interest and profile " +
    (selected.length === 1 ? "signal" : "signals") +
    " from YouTube and the People API; " +
    claims.length +
    " became public claims.";
  return { fragments, claims, generatedText, extractionSummary };
}
