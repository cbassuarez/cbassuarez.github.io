import { BUCKETS as BFV_BUCKETS } from "./body-for-visits/lexicon.js";
import {
  decideQualify as bfvDecide,
  SESSION_QUOTA_LIMIT_DEFAULT as BFV_SESSION_QUOTA_LIMIT,
  SESSION_QUOTA_WINDOW_MS_DEFAULT as BFV_SESSION_QUOTA_WINDOW_MS,
} from "./body-for-visits/decide.js";
import {
  inferModel as bfvInferModel,
  tokenizeSpeech as bfvTokenize,
  mulberry32 as bfvRng,
} from "./body-for-visits/grammar.js";
import { foldBody as bfvFold } from "./body-for-visits/fold.js";
import { renderSnapshotHTML as bfvSnapshot } from "./body-for-visits/snapshot.js";
import {
  createNet as bfvCreateNet,
  loadWeights as bfvLoadWeights,
  serializeNet as bfvSerializeNet,
  snapshotWeights as bfvSnapshotWeights,
  hasNaN as bfvHasNaN,
  blendToward as bfvBlendToward,
  buildVocabContext as bfvBuildVocabContext,
  createSelector as bfvCreateSelector,
  trainStep as bfvTrainStep,
  base64ToFloats as bfvBase64ToFloats,
} from "./body-for-visits/net.js";
import { NET_MODEL as BFV_NET_MODEL } from "./body-for-visits/net-weights.generated.js";
import { createBufferedSelector as bfvCreateBufferedSelector } from "./body-for-visits/voice.js";
import {
  duplicateQualifyResponse as bfvDuplicateQualifyResponse,
  normalizeVisitId as bfvNormalizeVisitId,
  SerialQueue as BfvSerialQueue,
} from "./body-for-visits/idempotency.js";
import { ThisPersonRoom } from "./this-person/room";
import {
  LIMITS as TP_LIMITS,
  parseAppendRequest as parseTpAppendRequest,
  type ExtractedFragment as TpFragment,
  type ExtractedPerson as TpPerson,
} from "./this-person/types";
import { generateClaims as generateTpClaims } from "./this-person/extraction/generateClaims";
import {
  GOOGLE_DP_RESOURCE,
  GOOGLE_DP_SCOPE,
  buildGoogleDataPortabilityEntry,
  extractGoogleAdInterestCandidatesFromArchiveBytes,
  type GoogleAdInterestCandidate,
} from "./this-person/googleDataPortability";
import {
  buildGamFragments,
  gamConfigured,
  readGamServiceAccount,
  resolveAdvertiserName,
  resolveCreativeName,
  resolveLineItemName,
  resolveOrderName,
  type GamRenderRecord,
  type GamResolution,
  type GamServiceAccount,
} from "./this-person/gamApi";

// Re-exported so the Cloudflare runtime registers the Durable Object class.
export { ThisPersonRoom };

type FeedItem = {
  source: string;
  text: string;
  at: string;
  url?: string;
  media?: string;
  progressMs?: number;
  durationMs?: number;
  isPlaying?: boolean;
};

type CurrentActivity = {
  source: string;
  text: string;
  at: string;
  url?: string;
  isLive: boolean;
  ageLabel: string;
};

type SourceStatus = {
  status: "ok" | "missing_config" | "error";
  count: number;
  message?: string;
};

type GuestbookEntry = {
  name: string;
  message: string;
  at: string;
};

type SpotifyPlaybackState = {
  trackKey: string;
  trackName: string;
  trackUrl?: string;
  trackUri?: string;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  sessionStartedAt?: string;
  observedAt: string;
};

type RateLimitBinding = {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

type Env = {
  FEED_ALLOW_ORIGIN?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_ALLOWED_HOSTNAMES?: string;
  CONTACT_FORMSPREE_ENDPOINT?: string;
  HITS_KV?: KVNamespace;
  HITS_BASELINE?: string;
  GITHUB_USERNAME?: string;
  GITHUB_TOKEN?: string;
  BANDCAMP_DOMAIN?: string;
  IG_USER_ID?: string;
  IG_ACCESS_TOKEN?: string;
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  SPOTIFY_REFRESH_TOKEN?: string;
  X_USERNAME?: string;
  X_BEARER_TOKEN?: string;
  YT_CHANNEL_ID?: string;
  YT_API_KEY?: string;
  CF_ZONE_ID?: string;
  CF_API_TOKEN?: string;
  CF_ANALYTICS_SINCE?: string;
  SITE_VERSION_URL?: string;
  SITE_REPO_URL?: string;
  RATE_LIMIT_FEED?: RateLimitBinding;
  RATE_LIMIT_HIT?: RateLimitBinding;
  RATE_LIMIT_GUESTBOOK_POST?: RateLimitBinding;
  RATE_LIMIT_CONTACT_POST?: RateLimitBinding;
  RATE_LIMIT_STRING_SOCKET?: RateLimitBinding;
  RATE_LIMIT_COROOM_SOCKET?: RateLimitBinding;
  RATE_LIMIT_BFV_QUALIFY?: RateLimitBinding;
  RATE_LIMIT_BFV_SOCKET?: RateLimitBinding;
  STRING_ROOM: DurableObjectNamespace;
  CO_ROOM: DurableObjectNamespace;
  BFV_ROOM: DurableObjectNamespace;
  BFV_HASH_SALT?: string;
  BFV_ADMIN_TOKEN?: string;
  AI?: { run: (model: string, input: unknown) => Promise<unknown> };
  THIS_PERSON_ROOM?: DurableObjectNamespace;
  RATE_LIMIT_THIS_PERSON?: RateLimitBinding;
  THIS_PERSON_ADMIN_TOKEN?: string;
  THIS_PERSON_SHOW_TIME?: string;
  GOOGLE_DP_CLIENT_ID?: string;
  GOOGLE_DP_CLIENT_SECRET?: string;
  GOOGLE_DP_REDIRECT_URI?: string;
  GOOGLE_DP_STATE_SECRET?: string;
  GOOGLE_DP_TOKEN_ENCRYPTION_KEY?: string;
  // The "this person" lab fires real ad-tech tags against the consenting
  // browser. These IDs are the same kind a normal commercial site sets.
  THIS_PERSON_GA4_MEASUREMENT_ID?: string;   // e.g. "G-XXXXXXXXXX"
  THIS_PERSON_GOOGLE_ADS_ID?: string;        // e.g. "AW-XXXXXXXXXX"
  THIS_PERSON_META_PIXEL_ID?: string;        // numeric pixel id
  // Google Ad Manager — the lab serves one GPT slot inside the extraction
  // review and resolves the bid into the advertiser's display name. The
  // service-account credentials read companies/orders/lineItems/creatives.
  GAM_NETWORK_CODE?: string;                 // numeric GAM network code
  GAM_AD_UNIT_PATH?: string;                 // e.g. "/22222222/this_person/extraction"
  GAM_SERVICE_ACCOUNT_EMAIL?: string;        // "name@project.iam.gserviceaccount.com"
  GAM_SERVICE_ACCOUNT_PRIVATE_KEY?: string;  // full PEM, including BEGIN/END lines
  GAM_SLOT_SIZES?: string;                   // e.g. "300x250,728x90" (optional)
};

type FeedSnapshot = {
  items: FeedItem[];
  sources: Record<string, SourceStatus>;
  generatedAt: string;
};

const FEED_SNAPSHOT_KEY = "feed:snapshot-v1";
const FEED_MAX_ITEMS = 500;
const FEED_EDGE_CACHE_SECONDS = 60;

// this person — the wall lives in a single Durable Object instance.
const THIS_PERSON_ROOM_NAME = "this-person:wall-v1";

// Surfaces the same site is reachable from. Emitted as a Link header on every
// worker response so anyone watching the network tab (or running `curl -i`)
// discovers them. Browsers silently ignore the non-HTTP rel/scheme values.
const DISCOVERY_LINK_HEADER = [
  '<https://cbassuarez.com/.well-known/cli-letter.txt>; rel="alternate"; type="text/plain"',
  '<ssh://ssh.cbassuarez.com>; rel="alternate"',
  '<gemini://gemini.cbassuarez.com>; rel="alternate"',
  '<https://cbassuarez.com/humans.txt>; rel="author"',
].join(", ");

const jsonHeaders = (origin: string) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  link: DISCOVERY_LINK_HEADER,
});

const clean = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

const stripTags = (value: string) => value.replace(/<[^>]+>/g, "");
const toNonNegativeInt = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.floor(parsed);
  return rounded >= 0 ? rounded : null;
};

const short = (value: unknown, max = 120) => {
  const text = clean(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const sourceBase = (source: unknown) => clean(source).toLowerCase().split(":")[0] || "feed";
const parseFeedTimeMs = (value: unknown) => {
  const ms = new Date(clean(value)).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const normalizeIsoAt = (value: unknown): string | null => {
  const ms = parseFeedTimeMs(value);
  return ms > 0 ? new Date(ms).toISOString() : null;
};

const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";
const CONTACT_TURNSTILE_ACTION = "contact_form_v1";
const CONTACT_EMAIL_REGEX = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;
const CONTACT_ALLOWED_TOPICS = new Set(["commission", "performance", "collab", "press", "other"]);
const CONTACT_BLOCKED_LOCAL_PARTS = new Set([
  "a",
  "aa",
  "test",
  "testing",
  "asdf",
  "qwerty",
  "user",
  "admin",
  "none",
  "na",
  "n/a",
]);
const CONTACT_BLOCKED_DOMAINS = new Set([
  "example.com",
  "test.com",
  "localhost",
  "mailinator.com",
  "tempmail.com",
  "fake.com",
]);

type ContactSubmission = {
  name: string;
  email: string;
  subject: string;
  topic: string;
  timeSensitive: boolean;
  message: string;
  turnstileToken: string;
};

function parseSpotifyEvent(text: string): { action: string; label: string } {
  const cleaned = clean(text);
  const match = cleaned.match(/^(now playing|played|last played|resumed|paused):\s*(.+)$/i);
  if (!match) {
    return { action: "other", label: cleaned.toLowerCase() };
  }
  return { action: clean(match[1]).toLowerCase(), label: clean(match[2]).toLowerCase() };
}

function spotifyLabelRaw(text: string): string {
  const cleaned = clean(text);
  const match = cleaned.match(/^(?:now playing|played|last played|resumed|paused):\s*(.+)$/i);
  return clean(match?.[1] || cleaned);
}

function withSpotifyAction(item: FeedItem, action: "now playing" | "paused" | "played"): FeedItem {
  const label = spotifyLabelRaw(item.text);
  return {
    ...item,
    text: `${action}: ${label}`,
    isPlaying: action === "now playing",
  };
}

function sanitizeSpotifyTimeline(items: FeedItem[]): FeedItem[] {
  const newestFirst = [...items].sort((a, b) => parseFeedTimeMs(b.at) - parseFeedTimeMs(a.at));
  const kept: FeedItem[] = [];

  const seenSessionKeys = new Set<string>();
  const seenBurstKeys = new Set<string>();
  let seenNewestSpotifyState = false;

  for (const item of newestFirst) {
    if (sourceBase(item.source) !== "spotify") {
      kept.push(item);
      continue;
    }

    const atMs = parseFeedTimeMs(item.at);
    const { action, label } = parseSpotifyEvent(item.text);
    const trackKey = clean(item.media || item.url || label);

    if (!trackKey) {
      kept.push(item);
      continue;
    }

    if (action === "last played" || action === "played") {
      continue;
    }

    if (action === "now playing" || action === "resumed" || action === "paused") {
      if (action === "now playing" && item.isPlaying === false) continue;
      const progressBucket = Math.round((toNonNegativeInt(item.progressMs) || 0) / 3000);
      const timeBucket = Math.round(atMs / 90000);
      const burstKey = `burst:${trackKey}:${action}:${progressBucket}:${timeBucket}`;
      if (seenBurstKeys.has(burstKey)) continue;
      seenBurstKeys.add(burstKey);

      const sessionKey = `play:${trackKey}:${clean(item.at)}`;
      if (seenSessionKeys.has(sessionKey)) continue;
      seenSessionKeys.add(sessionKey);

      if (action === "paused") {
        seenNewestSpotifyState = true;
        kept.push(withSpotifyAction(item, "paused"));
        continue;
      }

      if (!seenNewestSpotifyState && item.isPlaying !== false) {
        kept.push(withSpotifyAction(item, "now playing"));
        seenNewestSpotifyState = true;
      } else {
        seenNewestSpotifyState = true;
        kept.push(withSpotifyAction(item, "played"));
      }
      continue;
    }

    kept.push(item);
  }

  return kept.sort((a, b) => parseFeedTimeMs(b.at) - parseFeedTimeMs(a.at));
}

function timelineIdentity(item: FeedItem): string {
  if (sourceBase(item.source) !== "spotify") {
    return `${item.source}|${item.at}|${item.url || ""}|${item.text}`;
  }

  const { label } = parseSpotifyEvent(item.text);
  const trackKey = clean(item.media || item.url || label);
  const atKey = clean(item.at);
  return `spotify|${trackKey}|${atKey}`;
}

function formatAgeLabel(msAgo: number): string {
  if (!Number.isFinite(msAgo) || msAgo < 0) return "just now";
  const minutes = Math.floor(msAgo / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function selectCurrentActivity(items: FeedItem[], nowMs = Date.now()): CurrentActivity | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const ordered = items
    .filter((item) => clean(item?.text).length > 0)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (ordered.length === 0) return null;

  const isRecent = (item: FeedItem, windowMs = 10 * 60 * 1000) => {
    const atMs = new Date(item.at).getTime();
    return Number.isFinite(atMs) && nowMs - atMs <= windowMs;
  };

  const build = (item: FeedItem, isLive: boolean): CurrentActivity => {
    const atMs = new Date(item.at).getTime();
    const ageLabel = isLive ? "live now" : formatAgeLabel(nowMs - atMs);
    return {
      source: clean(item.source || "feed"),
      text: clean(item.text),
      at: clean(item.at || new Date(nowMs).toISOString()),
      url: clean(item.url || "") || undefined,
      isLive,
      ageLabel,
    };
  };

  const latestSpotify = ordered.find((item) => sourceBase(item.source) === "spotify");
  if (latestSpotify && Boolean(latestSpotify.isPlaying)) return build(latestSpotify, true);

  const instagramLive = ordered.find((item) => sourceBase(item.source) === "instagram" && isRecent(item));
  if (instagramLive) return build(instagramLive, true);

  const githubLive = ordered.find((item) => sourceBase(item.source) === "github" && isRecent(item));
  if (githubLive) return build(githubLive, true);

  const bandcampLive = ordered.find((item) => sourceBase(item.source) === "bandcamp" && isRecent(item));
  if (bandcampLive) return build(bandcampLive, true);

  return build(ordered[0], false);
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText} :: ${body.slice(0, 240)}`);
  }
  return response.json();
}

async function fetchGitHub(env: Env, limit: number): Promise<FeedItem[]> {
  const username = clean(env.GITHUB_USERNAME || "cbassuarez");
  if (!username) return [];

  const response = await fetch(`https://github.com/${encodeURIComponent(username)}.atom`);
  if (!response.ok) {
    throw new Error(`github atom ${response.status}`);
  }
  const xml = await response.text();
  const items: FeedItem[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xml)) && items.length < limit) {
    const block = match[1];
    const title = short(decodeHtml(clean((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "")), 108);
    const link = clean((block.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "");
    const updated = clean((block.match(/<updated>([\s\S]*?)<\/updated>/i) || [])[1] || "");
    if (!title) continue;
    items.push({
      source: `github:${username}`,
      text: title,
      at: updated || new Date().toISOString(),
      url: link || `https://github.com/${username}`,
    });
  }
  return items;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchBandcamp(env: Env, limit: number): Promise<FeedItem[]> {
  const domain = clean(env.BANDCAMP_DOMAIN || "cbassuarez.bandcamp.com");
  if (!domain) return [];

  const response = await fetch(`https://${domain}/music`, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`bandcamp ${response.status}`);
  }

  const html = await response.text();
  const items: FeedItem[] = [];

  const itemRegex =
    /<li[^>]*class="[^"]*music-grid-item[^"]*"[\s\S]*?<a href="([^"]+)"[\s\S]*?<p class="title">\s*([\s\S]*?)\s*<\/p>/gi;

  let match: RegExpExecArray | null;
  const releases: Array<{ title: string; url: string }> = [];
  while ((match = itemRegex.exec(html)) && releases.length < limit) {
    const href = clean(match[1]);
    const title = short(stripTags(decodeHtml(clean(match[2]))), 96);
    if (!href || !title) continue;
    releases.push({
      title,
      url: href.startsWith("http") ? href : `https://${domain}${href}`,
    });
  }

  async function fetchBandcampPublishedAt(url: string): Promise<string | null> {
    const parseDateFromHtml = (releaseHtml: string): string | null => {
      const datePublishedRaw = clean((releaseHtml.match(/"datePublished"\s*:\s*"([^"]+)"/i) || [])[1] || "");
      if (datePublishedRaw) {
        const ts = Date.parse(datePublishedRaw);
        if (Number.isFinite(ts)) return new Date(ts).toISOString();
      }

      const pubDateMeta = clean(
        (releaseHtml.match(/<meta[^>]+property="og:pubdate"[^>]+content="([^"]+)"/i) || [])[1] || ""
      );
      if (pubDateMeta) {
        const ts = Date.parse(pubDateMeta);
        if (Number.isFinite(ts)) return new Date(ts).toISOString();
      }

      const descriptionMeta = clean((releaseHtml.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) || [])[1] || "");
      const releasedInDescription = clean((descriptionMeta.match(/\breleased\s+(\d{1,2}\s+\w+\s+\d{4})/i) || [])[1] || "");
      if (releasedInDescription) {
        const ts = Date.parse(releasedInDescription);
        if (Number.isFinite(ts)) return new Date(ts).toISOString();
      }

      return null;
    };

    const candidates = [`${url}?output=1`, url];
    for (const target of candidates) {
      const releaseResponse = await fetch(target, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!releaseResponse.ok) continue;
      const parsed = parseDateFromHtml(await releaseResponse.text());
      if (parsed) return parsed;
    }

    return null;
  }

  const detailed = await Promise.all(
    releases.map(async (release) => {
      const at = await fetchBandcampPublishedAt(release.url);
      if (!at) return null;
      return {
        source: "bandcamp",
        text: `release: ${release.title}`,
        at,
        url: release.url,
      } as FeedItem;
    })
  );

  for (const row of detailed) {
    if (row) items.push(row);
  }

  return items;
}

async function fetchInstagram(env: Env, limit: number): Promise<FeedItem[]> {
  const userId = clean(env.IG_USER_ID);
  const token = clean(env.IG_ACCESS_TOKEN);
  if (!userId || !token) return [];

  const query = `fields=id,caption,media_type,permalink,timestamp,media_url&limit=${Math.min(limit, 100)}&access_token=${encodeURIComponent(
    token
  )}`;

  let data: any;
  try {
    data = await fetchJson(`https://graph.facebook.com/v23.0/${encodeURIComponent(userId)}/media?${query}`);
  } catch {
    data = await fetchJson(`https://graph.instagram.com/${encodeURIComponent(userId)}/media?${query}`);
  }

  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows.slice(0, limit).map((post: any) => ({
    source: "instagram",
    text: short(post?.caption || `new ${clean(post?.media_type || "post").toLowerCase()}`, 110),
    at: post?.timestamp || new Date().toISOString(),
    url: clean(post?.permalink),
    media: clean(post?.media_url),
  }));
}

async function readSpotifyPlaybackState(env: Env): Promise<SpotifyPlaybackState | null> {
  const kv = env.HITS_KV;
  if (!kv) return null;

  const raw = await kv.get("feed:spotify-state-v1");
  if (!raw) return null;

  try {
    const parsed: any = JSON.parse(raw);
    const observedAt = clean(parsed?.observedAt);
    const trackKey = clean(parsed?.trackKey);
    if (!observedAt && !trackKey) return null;

    return {
      trackKey,
      trackName: clean(parsed?.trackName),
      trackUrl: clean(parsed?.trackUrl) || undefined,
      trackUri: clean(parsed?.trackUri) || undefined,
      isPlaying: Boolean(parsed?.isPlaying),
      progressMs: Number.isFinite(parsed?.progressMs) ? parsed.progressMs : 0,
      durationMs: Number.isFinite(parsed?.durationMs) ? parsed.durationMs : 0,
      sessionStartedAt: clean(parsed?.sessionStartedAt) || undefined,
      observedAt: observedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function writeSpotifyPlaybackState(env: Env, state: SpotifyPlaybackState): Promise<void> {
  const kv = env.HITS_KV;
  if (!kv) return;
  await kv.put("feed:spotify-state-v1", JSON.stringify(state));
}

async function fetchSpotify(env: Env): Promise<FeedItem[]> {
  const clientId = clean(env.SPOTIFY_CLIENT_ID);
  const clientSecret = clean(env.SPOTIFY_CLIENT_SECRET);
  const refreshToken = clean(env.SPOTIFY_REFRESH_TOKEN);
  if (!clientId || !clientSecret || !refreshToken) return [];

  const auth = btoa(`${clientId}:${clientSecret}`);
  const tokenBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: tokenBody.toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(`spotify token ${tokenResponse.status}`);
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  const accessToken = clean(tokenData.access_token);
  if (!accessToken) return [];

  const headers = { authorization: `Bearer ${accessToken}` };
  const current = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers });
  const previousState = await readSpotifyPlaybackState(env);

  const items: FeedItem[] = [];
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  if (current.status === 200) {
    const payload: any = await current.json();
    const track = payload?.item;
    if (track) {
      const artists = Array.isArray(track?.artists)
        ? track.artists.map((artist: any) => clean(artist?.name)).filter(Boolean).join(", ")
        : "";
      const name = clean(track?.name);
      const url = clean(track?.external_urls?.spotify || "");
      const uri = clean(track?.uri || "");
      const trackLabel = `${artists}${artists && name ? " — " : ""}${name}`;
      const trackKey = clean(uri || url || trackLabel);
      const isPlaying = Boolean(payload?.is_playing);
      const progressMs = Number.isFinite(payload?.progress_ms) ? payload.progress_ms : 0;
      const durationMs = Number.isFinite(track?.duration_ms) ? track.duration_ms : 0;
      const startedAtMs = Math.max(0, nowMs - Math.max(0, progressMs));
      const startedAtIso = new Date(startedAtMs).toISOString();
      const sameTrack = previousState?.trackKey === trackKey && trackKey.length > 0;
      const sessionStartedAt = sameTrack
        ? clean(previousState?.sessionStartedAt) || startedAtIso
        : startedAtIso;
      const statusPrefix = isPlaying ? "now playing" : "paused";

      items.push({
        source: "spotify",
        text: `${statusPrefix}: ${trackLabel}`,
        at: sessionStartedAt,
        url: url || undefined,
        media: uri || undefined,
        progressMs,
        durationMs,
        isPlaying,
      });

      await writeSpotifyPlaybackState(env, {
        trackKey,
        trackName: trackLabel,
        trackUrl: url || undefined,
        trackUri: uri || undefined,
        isPlaying,
        progressMs,
        durationMs,
        sessionStartedAt,
        observedAt: nowIso,
      });
    }
  } else if (current.status === 204) {
    if (previousState?.trackName && previousState?.sessionStartedAt) {
      items.push({
        source: "spotify",
        text: `paused: ${previousState.trackName}`,
        at: previousState.sessionStartedAt,
        url: previousState.trackUrl,
        media: previousState.trackUri,
        progressMs: previousState.progressMs || 0,
        durationMs: previousState.durationMs || 0,
        isPlaying: false,
      });
      await writeSpotifyPlaybackState(env, {
        ...previousState,
        isPlaying: false,
        observedAt: nowIso,
      });
    }
  }

  return items;
}

async function fetchX(env: Env, limit: number): Promise<FeedItem[]> {
  const username = clean(env.X_USERNAME);
  const bearer = clean(env.X_BEARER_TOKEN);
  if (!username || !bearer) return [];

  const headers = { authorization: `Bearer ${bearer}` };
  const userData: any = await fetchJson(
    `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=id`,
    { headers }
  );

  const userId = clean(userData?.data?.id);
  if (!userId) return [];

  const tweetsData: any = await fetchJson(
    `https://api.twitter.com/2/users/${encodeURIComponent(
      userId
    )}/tweets?exclude=retweets,replies&max_results=${Math.min(limit, 100)}&tweet.fields=created_at`,
    { headers }
  );

  const rows = Array.isArray(tweetsData?.data) ? tweetsData.data : [];
  return rows.slice(0, limit).map((tweet: any) => ({
    source: `x:${username}`,
    text: short(tweet?.text, 120),
    at: tweet?.created_at || new Date().toISOString(),
    url: `https://x.com/${username}/status/${clean(tweet?.id)}`,
  }));
}

async function fetchYouTube(env: Env, limit: number): Promise<FeedItem[]> {
  const apiKey = clean(env.YT_API_KEY);
  const channelId = clean(env.YT_CHANNEL_ID);
  if (!apiKey || !channelId) return [];

  const data: any = await fetchJson(
    `https://www.googleapis.com/youtube/v3/search?key=${encodeURIComponent(apiKey)}&channelId=${encodeURIComponent(
      channelId
    )}&part=snippet,id&order=date&maxResults=${Math.min(limit, 50)}`
  );

  const rows = Array.isArray(data?.items) ? data.items : [];
  return rows
    .filter((row: any) => row?.id?.videoId)
    .slice(0, limit)
    .map((video: any) => ({
      source: "youtube",
      text: short(video?.snippet?.title || "new upload", 120),
      at: video?.snippet?.publishedAt || new Date().toISOString(),
      url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
    }));
}

async function incrementHitCount(env: Env): Promise<number> {
  const kv = env.HITS_KV;
  if (!kv) {
    throw new Error("hits kv missing");
  }

  const deltaKey = "hits:delta-v2";

  const resolveCloudflareBaseline = async () => {
    const zoneId = clean(env.CF_ZONE_ID);
    const token = clean(env.CF_API_TOKEN);
    if (!zoneId || !token) return null;

    const sinceDay = clean(env.CF_ANALYTICS_SINCE || "");
    const defaultSince = "2020-01-01";
    const startDay = /^\d{4}-\d{2}-\d{2}$/.test(sinceDay) ? sinceDay : defaultSince;
    const toIsoDay = (date: Date) => date.toISOString().slice(0, 10);
    const addDaysUtc = (date: Date, days: number) => {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + days);
      return next;
    };

    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const earliestAvailable = addDaysUtc(todayUtc, -364);
    let cursor = new Date(`${startDay}T00:00:00Z`);
    if (Number.isNaN(cursor.getTime())) {
      cursor = new Date(`${defaultSince}T00:00:00Z`);
    }
    if (cursor.getTime() < earliestAvailable.getTime()) {
      cursor = earliestAvailable;
    }

    const query =
      "query($zoneTag: string, $since: Date, $until: Date){ viewer { zones(filter: { zoneTag: $zoneTag }) { httpRequests1dGroups(filter: { date_geq: $since, date_leq: $until }, limit: 400) { sum { pageViews } } } } }";

    let totalPageViews = 0;
    while (cursor.getTime() <= todayUtc.getTime()) {
      const chunkEnd = addDaysUtc(cursor, 363);
      const until = chunkEnd.getTime() > todayUtc.getTime() ? todayUtc : chunkEnd;
      const body = JSON.stringify({
        query,
        variables: {
          zoneTag: zoneId,
          since: toIsoDay(cursor),
          until: toIsoDay(until),
        },
      });

      const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          "content-type": "application/json",
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`cloudflare graphql ${response.status}`);
      }

      const payload: any = await response.json();
      if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
        const firstError = clean(payload.errors[0]?.message || "cloudflare graphql error");
        throw new Error(firstError);
      }

      const groups = payload?.data?.viewer?.zones?.[0]?.httpRequests1dGroups;
      if (Array.isArray(groups)) {
        for (const group of groups) {
          const pageViews = toNonNegativeInt(group?.sum?.pageViews) ?? 0;
          totalPageViews += pageViews;
        }
      }

      cursor = addDaysUtc(until, 1);
    }

    return totalPageViews;
  };

  let baseline = toNonNegativeInt(env.HITS_BASELINE);
  if (baseline === null) {
    try {
      baseline = await resolveCloudflareBaseline();
    } catch {
      baseline = 0;
    }
  }

  const deltaRaw = await kv.get(deltaKey);
  const delta = toNonNegativeInt(deltaRaw) ?? 0;
  const nextDelta = delta + 1;
  await kv.put(deltaKey, String(nextDelta));
  return baseline + nextDelta;
}

async function readGuestbookEntries(env: Env): Promise<GuestbookEntry[]> {
  const kv = env.HITS_KV;
  if (!kv) {
    throw new Error("guestbook kv missing");
  }

  const raw = await kv.get("guestbook:entries-v1");
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];
  const rows = parsed
    .map((item: any) => ({
      name: clean(item?.name).slice(0, 48),
      message: clean(item?.message).slice(0, 280),
      at: clean(item?.at) || new Date().toISOString(),
    }))
    .filter((item: GuestbookEntry) => item.message.length > 0);

  return rows;
}

async function writeGuestbookEntries(env: Env, entries: GuestbookEntry[]): Promise<void> {
  const kv = env.HITS_KV;
  if (!kv) {
    throw new Error("guestbook kv missing");
  }
  await kv.put("guestbook:entries-v1", JSON.stringify(entries));
}

async function hashGuestbookSigner(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`gb-signer-v1:${ip}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hasGuestbookSignature(env: Env, ip: string): Promise<boolean> {
  const kv = env.HITS_KV;
  if (!kv) return false;
  const hash = await hashGuestbookSigner(ip);
  return (await kv.get(`guestbook:signer:${hash}`)) !== null;
}

async function recordGuestbookSignature(env: Env, ip: string): Promise<void> {
  const kv = env.HITS_KV;
  if (!kv) return;
  const hash = await hashGuestbookSigner(ip);
  await kv.put(`guestbook:signer:${hash}`, new Date().toISOString());
}

type StringPluck = {
  x: number;
  y: number;
  t: number;
  who: string;
  force: number;
  pull: number;
  speed: number;
  width: number;
  sign: 1 | -1;
};
type StringCursor = { x: number; t: number; who: string };

const STRING_PLUCK_WINDOW_MS = 90_000;
const STRING_CURSOR_WINDOW_MS = 5_000;
const STRING_PLUCK_MAX = 200;
const STRING_CURSOR_MAX = 64;
const STRING_INCOMING_MAX_BYTES = 1024;
const STRING_PLUCK_RATE_CAPACITY = 6;
const STRING_PLUCK_RATE_REFILL_PER_SEC = 4;
const STRING_CURSOR_RATE_CAPACITY = 30;
const STRING_CURSOR_RATE_REFILL_PER_SEC = 30;
const STRING_PERSIST_DEBOUNCE_MS = 5_000;
const STRING_ALARM_INTERVAL_MS = 30_000;
const STRING_ROOM_NAME = "string:room-v1";
const STRING_PERSISTED_PLUCKS_KEY = "plucks-v1";

const clamp01 = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
};

async function hashStringWho(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`string-who-v1:${ip}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .slice(0, 6)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

interface SocketAttachment {
  who: string;
  joinedAt: number;
  lastSeenAt: number;
  pluckTokens: number;
  pluckLast: number;
  cursorTokens: number;
  cursorLast: number;
}

function consumeToken(
  attachment: SocketAttachment,
  kind: "pluck" | "cursor",
  now: number,
  capacity: number,
  refillPerSec: number
): boolean {
  const tokensField = kind === "pluck" ? "pluckTokens" : "cursorTokens";
  const lastField = kind === "pluck" ? "pluckLast" : "cursorLast";
  const elapsedSec = Math.max(0, (now - attachment[lastField]) / 1000);
  const refilled = Math.min(capacity, attachment[tokensField] + elapsedSec * refillPerSec);
  attachment[lastField] = now;
  if (refilled < 1) {
    attachment[tokensField] = refilled;
    return false;
  }
  attachment[tokensField] = refilled - 1;
  return true;
}

function readAttachment(ws: WebSocket): SocketAttachment | null {
  try {
    const value = ws.deserializeAttachment();
    if (!value || typeof value !== "object") return null;
    const att = value as SocketAttachment;
    if (typeof att.who !== "string" || att.who.length === 0) return null;
    return att;
  } catch {
    return null;
  }
}

export class StringRoom {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private plucks: StringPluck[] = [];
  private cursors: Map<string, StringCursor> = new Map();
  private persistDirty = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    void this.state.blockConcurrencyWhile(async () => {
      try {
        const persisted = await this.state.storage.get<StringPluck[]>(STRING_PERSISTED_PLUCKS_KEY);
        if (Array.isArray(persisted)) {
          const cutoff = Date.now() - STRING_PLUCK_WINDOW_MS;
          this.plucks = persisted
            .filter((p) => p && Number.isFinite(p.t) && p.t >= cutoff)
            .slice(-STRING_PLUCK_MAX);
        }
      } catch {
        this.plucks = [];
      }
      // Reattach to any sockets that survived hibernation by topping up their
      // token buckets so reactivated clients aren't immediately throttled.
      const now = Date.now();
      for (const ws of this.state.getWebSockets()) {
        const att = readAttachment(ws);
        if (!att) continue;
        att.pluckTokens = STRING_PLUCK_RATE_CAPACITY;
        att.pluckLast = now;
        att.cursorTokens = STRING_CURSOR_RATE_CAPACITY;
        att.cursorLast = now;
        try {
          ws.serializeAttachment(att);
        } catch {
          // ignore: closed sockets get cleaned up by the runtime
        }
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/presence")) {
      return new Response(
        JSON.stringify({ count: this.state.getWebSockets().length }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        }
      );
    }
    if (!url.pathname.endsWith("/socket")) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    const upgrade = request.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }

    const claimed = clean(url.searchParams.get("who")).toLowerCase();
    const seed =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "anon";
    const who = /^[0-9a-f]{6,16}$/i.test(claimed) ? claimed : await hashStringWho(seed);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const now = Date.now();
    const attachment: SocketAttachment = {
      who,
      joinedAt: now,
      lastSeenAt: now,
      pluckTokens: STRING_PLUCK_RATE_CAPACITY,
      pluckLast: now,
      cursorTokens: STRING_CURSOR_RATE_CAPACITY,
      cursorLast: now,
    };
    server.serializeAttachment(attachment);
    this.state.acceptWebSocket(server);

    this.pruneExpired(now);
    const recentCursors = [...this.cursors.values()].filter((c) => c.t >= now - STRING_CURSOR_WINDOW_MS);
    try {
      server.send(
        JSON.stringify({
          type: "hello",
          who,
          serverNow: now,
          plucks: this.plucks,
          cursors: recentCursors,
        })
      );
    } catch {
      // already disconnected; runtime cleans up
    }

    this.broadcast(JSON.stringify({ type: "join", who, t: now }), server);
    void this.scheduleMaintenanceAlarm();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    if (raw.length === 0 || raw.length > STRING_INCOMING_MAX_BYTES) return;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const att = readAttachment(ws);
    if (!att) return;

    const now = Date.now();
    att.lastSeenAt = now;
    const type = String(parsed.type || "");

    if (type === "pluck") {
      if (!consumeToken(att, "pluck", now, STRING_PLUCK_RATE_CAPACITY, STRING_PLUCK_RATE_REFILL_PER_SEC)) {
        ws.serializeAttachment(att);
        return;
      }
      const pluck: StringPluck = {
        who: att.who,
        t: now,
        x: clamp01(parsed.x),
        y: clamp01(parsed.y),
        force: clamp01(parsed.force),
        pull: clamp01(parsed.pull),
        speed: clamp01(parsed.speed),
        width: clamp01(parsed.width),
        sign: Number(parsed.sign) < 0 ? -1 : 1,
      };
      this.plucks.push(pluck);
      const cutoff = now - STRING_PLUCK_WINDOW_MS;
      if (this.plucks.length > STRING_PLUCK_MAX || (this.plucks[0] && this.plucks[0].t < cutoff)) {
        this.plucks = this.plucks.filter((p) => p.t >= cutoff).slice(-STRING_PLUCK_MAX);
      }
      this.persistDirty = true;
      void this.scheduleMaintenanceAlarm();
      this.broadcast(JSON.stringify({ type: "pluck", ...pluck }), ws);
      ws.serializeAttachment(att);
      return;
    }

    if (type === "cursor") {
      if (!consumeToken(att, "cursor", now, STRING_CURSOR_RATE_CAPACITY, STRING_CURSOR_RATE_REFILL_PER_SEC)) {
        ws.serializeAttachment(att);
        return;
      }
      const cursor: StringCursor = {
        who: att.who,
        t: now,
        x: clamp01(parsed.x),
      };
      this.cursors.set(att.who, cursor);
      if (this.cursors.size > STRING_CURSOR_MAX) {
        // drop the oldest tracked cursor to bound memory
        let oldestWho: string | null = null;
        let oldestT = Infinity;
        for (const [w, c] of this.cursors) {
          if (c.t < oldestT) {
            oldestT = c.t;
            oldestWho = w;
          }
        }
        if (oldestWho && oldestWho !== att.who) this.cursors.delete(oldestWho);
      }
      this.broadcast(JSON.stringify({ type: "cursor", ...cursor }), ws);
      ws.serializeAttachment(att);
      return;
    }

    if (type === "ping") {
      try {
        ws.send(JSON.stringify({ type: "pong", t: now }));
      } catch {
        // ignore
      }
      ws.serializeAttachment(att);
      return;
    }
  }

  webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    this.handleDeparture(ws);
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    this.handleDeparture(ws);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.pruneExpired(now);
    if (this.persistDirty) {
      try {
        await this.state.storage.put(STRING_PERSISTED_PLUCKS_KEY, this.plucks);
        this.persistDirty = false;
      } catch {
        // observability surfaces the failure; retry on next alarm
      }
    } else if (this.plucks.length === 0) {
      try {
        await this.state.storage.delete(STRING_PERSISTED_PLUCKS_KEY);
      } catch {
        // ignore
      }
    }
    if (this.state.getWebSockets().length > 0 || this.persistDirty || this.cursors.size > 0) {
      try {
        await this.state.storage.setAlarm(Date.now() + STRING_ALARM_INTERVAL_MS);
      } catch {
        // ignore alarm scheduling failure
      }
    }
  }

  private handleDeparture(ws: WebSocket): void {
    const att = readAttachment(ws);
    if (!att) return;
    const stillPresent = this.state.getWebSockets().some((other) => {
      if (other === ws) return false;
      const otherAtt = readAttachment(other);
      return Boolean(otherAtt && otherAtt.who === att.who);
    });
    if (stillPresent) return;
    this.cursors.delete(att.who);
    this.broadcast(JSON.stringify({ type: "leave", who: att.who, t: Date.now() }), ws);
  }

  private broadcast(message: string, exclude?: WebSocket): void {
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(message);
      } catch {
        // socket dead; runtime will reap
      }
    }
  }

  private pruneExpired(now: number): void {
    const pluckCutoff = now - STRING_PLUCK_WINDOW_MS;
    if (this.plucks.length > 0 && this.plucks[0].t < pluckCutoff) {
      const before = this.plucks.length;
      this.plucks = this.plucks.filter((p) => p.t >= pluckCutoff).slice(-STRING_PLUCK_MAX);
      if (this.plucks.length !== before) this.persistDirty = true;
    }
    const cursorCutoff = now - STRING_CURSOR_WINDOW_MS;
    for (const [who, cursor] of this.cursors) {
      if (cursor.t < cursorCutoff) this.cursors.delete(who);
    }
  }

  private async scheduleMaintenanceAlarm(): Promise<void> {
    try {
      const existing = await this.state.storage.getAlarm();
      if (existing != null) return;
      const target = Date.now() + STRING_PERSIST_DEBOUNCE_MS;
      await this.state.storage.setAlarm(target);
    } catch {
      // ignore: best-effort scheduling
    }
  }
}

// ---------- co-presence room (the back of /404) ----------

type CoRoomMember = { id: string; who: string; joinedAt: number; location: string };
type CoRoomLogEntry = {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  peak: number;
  // Presence sessions that passed through this instance, with last-known location.
  members: Array<{ who: string; location: string }>;
};

const COROOM_NAME = "coroom:room-v1";
const COROOM_LOG_KEY = "log-v1";
const COROOM_LOG_MAX = 200;
const COROOM_LEAVE_GRACE_MS = 4_000;
const COROOM_INCOMING_MAX_BYTES = 256;
// Accept legacy 12-hex IDs *and* UUID v4 with or without dashes.
const COROOM_WHO_REGEX = /^[0-9a-f]{8,12}$|^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CoRoomAttachment {
  who: string;
  sessionId?: string;
  joinedAt: number;
  lastSeenAt: number;
  location: string;
}

function createCoRoomSessionId(): string {
  try {
    return crypto.randomUUID().toLowerCase();
  } catch {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}

function coRoomSessionId(att: CoRoomAttachment): string {
  return att.sessionId || `${att.who}:${att.joinedAt}`;
}

function deriveCfLocation(request: Request): string {
  const cf = (request as any).cf || {};
  const city = clean(cf.city || "");
  const region = clean(cf.region || cf.regionCode || "");
  const country = clean(cf.country || "");
  const head = city || region || "";
  if (head && country) return `${head}, ${country}`;
  return head || country || "";
}

function readCoRoomAttachment(ws: WebSocket): CoRoomAttachment | null {
  try {
    const value = ws.deserializeAttachment();
    if (!value || typeof value !== "object") return null;
    const att = value as CoRoomAttachment;
    if (typeof att.who !== "string" || att.who.length === 0) return null;
    return att;
  } catch {
    return null;
  }
}

export class CoRoom {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private log: CoRoomLogEntry[] = [];
  // seenSessions maps each socket/session in this instance to its last-known identity and location.
  private currentInstance: { startedAt: number; peak: number; seenSessions: Map<string, { who: string; location: string }> } | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    void this.state.blockConcurrencyWhile(async () => {
      try {
        const persisted = await this.state.storage.get<CoRoomLogEntry[]>(COROOM_LOG_KEY);
        if (Array.isArray(persisted)) {
          this.log = persisted
            .filter(
              (e): e is CoRoomLogEntry =>
                !!e &&
                Number.isFinite(e.startedAt) &&
                Number.isFinite(e.endedAt) &&
                Number.isFinite(e.peak)
            )
            .slice(0, COROOM_LOG_MAX);
        }
      } catch {
        this.log = [];
      }
      // After hibernation wake, reconstruct in-memory instance from any sockets
      // that survived. If no sockets remain, the instance state is correctly null.
      const count = this.activeCount();
      if (count >= 2) {
        // We don't know the original startedAt; best-effort: use the earliest
        // joinedAt across surviving sockets.
        let startedAt = Date.now();
        const seen = new Map<string, { who: string; location: string }>();
        for (const ws of this.state.getWebSockets()) {
          const att = readCoRoomAttachment(ws);
          if (!att) continue;
          if (att.joinedAt < startedAt) startedAt = att.joinedAt;
          seen.set(coRoomSessionId(att), { who: att.who, location: att.location || "" });
        }
        this.currentInstance = { startedAt, peak: count, seenSessions: seen };
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/snapshot")) {
      const now = Date.now();
      const count = this.activeCount();
      const members = this.membersList();
      return new Response(
        JSON.stringify({
          count,
          currentInstance: this.currentInstance
            ? {
                startedAt: this.currentInstance.startedAt,
                peak: this.currentInstance.peak,
                members,
              }
            : null,
          log: this.log,
          serverNow: now,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        }
      );
    }
    if (!url.pathname.endsWith("/socket")) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    const upgrade = request.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }

    const claimed = clean(url.searchParams.get("who")).toLowerCase();
    const seed =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "anon";
    const who = COROOM_WHO_REGEX.test(claimed) ? claimed : await hashStringWho(seed);
    const location = deriveCfLocation(request);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    const now = Date.now();
    const att: CoRoomAttachment = { who, sessionId: createCoRoomSessionId(), joinedAt: now, lastSeenAt: now, location };
    server.serializeAttachment(att);
    this.state.acceptWebSocket(server);

    // Determine instance lifecycle effects of this connection.
    const count = this.activeCount();
    const wasOpen = this.currentInstance !== null;
    let openedNow = false;
    if (count >= 2 && !this.currentInstance) {
      const seen = new Map<string, { who: string; location: string }>();
      for (const m of this.membersList()) seen.set(m.id, { who: m.who, location: m.location });
      this.currentInstance = { startedAt: now, peak: count, seenSessions: seen };
      openedNow = true;
    } else if (this.currentInstance) {
      for (const m of this.membersList()) {
        this.currentInstance.seenSessions.set(m.id, { who: m.who, location: m.location });
      }
      if (count > this.currentInstance.peak) this.currentInstance.peak = count;
    }

    // Send hello to the new socket with full state.
    const helloPayload = {
      type: "hello",
      who,
      count,
      currentInstance: this.currentInstance
        ? {
            startedAt: this.currentInstance.startedAt,
            peak: this.currentInstance.peak,
            members: this.membersList(),
          }
        : null,
      log: this.log,
      serverNow: now,
    };
    try {
      server.send(JSON.stringify(helloPayload));
    } catch {
      // ignore: socket may have closed pre-send
    }

    // Broadcast lifecycle to other sockets.
    if (openedNow) {
      this.broadcast(
        JSON.stringify({
          type: "open",
          startedAt: this.currentInstance!.startedAt,
          peak: this.currentInstance!.peak,
          members: this.membersList(),
          serverNow: now,
        }),
        server
      );
    } else if (wasOpen) {
      this.broadcast(
        JSON.stringify({
          type: "presence",
          count,
          peak: this.currentInstance!.peak,
          members: this.membersList(),
          serverNow: now,
        }),
        server
      );
    }
    // If !wasOpen && !openedNow: count stayed at 1, no broadcast needed (no listeners).

    // Cancel any pending grace alarm once the room is open again.
    if (count >= 2) {
      try {
        await this.state.storage.deleteAlarm();
      } catch {
        // ignore
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    if (raw.length === 0 || raw.length > COROOM_INCOMING_MAX_BYTES) return;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const att = readCoRoomAttachment(ws);
    if (!att) return;
    att.lastSeenAt = Date.now();
    if (String(parsed.type) === "ping") {
      try {
        ws.send(JSON.stringify({ type: "pong", t: att.lastSeenAt }));
      } catch {
        // ignore
      }
      ws.serializeAttachment(att);
    }
    // No other client messages accepted; door is opened by being there.
  }

  webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    void this.handleDisconnect(ws);
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    void this.handleDisconnect(ws);
  }

  async alarm(): Promise<void> {
    const count = this.activeCount();
    if (this.currentInstance && count < 2) {
      const now = Date.now();
      const entry: CoRoomLogEntry = {
        startedAt: this.currentInstance.startedAt,
        endedAt: now,
        durationMs: Math.max(0, now - this.currentInstance.startedAt),
        peak: this.currentInstance.peak,
        members: [...this.currentInstance.seenSessions.values()]
          .map(({ who, location }) => ({ who, location }))
          .sort((a, b) => a.who.localeCompare(b.who)),
      };
      this.log.unshift(entry);
      this.log = this.log.slice(0, COROOM_LOG_MAX);
      try {
        await this.state.storage.put(COROOM_LOG_KEY, this.log);
      } catch {
        // best-effort persist; will retry on next close
      }
      this.currentInstance = null;
      this.broadcast(
        JSON.stringify({ type: "close", entry, serverNow: now })
      );
    }
    // If count >= 2, instance still alive; nothing to do.
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const att = readCoRoomAttachment(ws);
    if (!att) return;
    // Cloudflare leaves the closing socket in state.getWebSockets() until this
    // handler returns. Compute counts/members excluding it so the presence
    // event we broadcast reflects post-disconnect state, not the transient
    // pre-close state. Otherwise remaining clients keep seeing count=2 until
    // the grace alarm fires (and the user perceives "stuck").
    const count = this.activeCount(ws);
    const members = this.membersList(ws);
    const now = Date.now();
    if (this.currentInstance) {
      this.broadcast(
        JSON.stringify({
          type: "presence",
          count,
          peak: this.currentInstance.peak,
          members,
          serverNow: now,
        }),
        ws
      );
      if (count < 2) {
        try {
          const existing = await this.state.storage.getAlarm();
          if (existing == null) {
            await this.state.storage.setAlarm(now + COROOM_LEAVE_GRACE_MS);
          }
        } catch {
          // ignore alarm scheduling failure
        }
      }
    }
  }

  private activeCount(exclude?: WebSocket): number {
    let count = 0;
    for (const ws of this.state.getWebSockets()) {
      if (exclude && ws === exclude) continue;
      const att = readCoRoomAttachment(ws);
      if (att) count += 1;
    }
    return count;
  }

  private membersList(exclude?: WebSocket): CoRoomMember[] {
    const members: CoRoomMember[] = [];
    for (const ws of this.state.getWebSockets()) {
      if (exclude && ws === exclude) continue;
      const att = readCoRoomAttachment(ws);
      if (!att) continue;
      members.push({
        id: coRoomSessionId(att),
        who: att.who,
        joinedAt: att.joinedAt,
        location: att.location || "",
      });
    }
    return members.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  }

  private broadcast(message: string, exclude?: WebSocket): void {
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(message);
      } catch {
        // socket dead; runtime will reap
      }
    }
  }
}

// ─── body-for-visits ──────────────────────────────────────────────────────────
// A single shared linguistic body, mutated only by qualifying human visits.
// The event journal is the work's substrate; this DO is the substrate's home.
const BFV_ROOM_NAME = "body-for-visits:room-v1";
const BFV_FRINGE_KEEP = 12;

// Online neural model tuning. The model trains on a recency-weighted replay of
// the body and checkpoints its weights to SQLite so learning survives restarts.
const BFV_NET_CHECKPOINT_MS = 5 * 60 * 1000;
const BFV_NET_CHECKPOINT_EVERY = 50;
const BFV_NET_BATCH = 24;
const BFV_NET_REPLAY = 96;
const BFV_NET_LR = 0.02;
const BFV_NET_L2 = 1e-4;
const BFV_NET_DECAY_HALFLIFE = 64;
const BFV_NET_MAX_DWELL_MS = 600000;
const BFV_NET_COLLAPSE_RATIO = 0.34;

type BfvSpan = { text: string; italic: boolean };
type BfvPendingToken = string | { text: string; italic?: boolean };

type BfvToken = {
  token: string;
  role: string;
  event_id: number | null;
  ts: number;
  spans?: BfvSpan[];
};

type BfvStateRow = {
  body_json: string;
  body_version: number;
  fold_count: number;
  fold_generations: number;
  corruption_count: number;
  fringe_json: string;
  pending_json: string;
};

type BfvQuota = {
  limit: number;
  remaining: number;
  window_ms: number;
  reset_at: number | null;
};

async function bfvHashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`bfv-ip-v1:${salt}:${ip}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function bfvHashSession(sessionId: string): Promise<string> {
  const data = new TextEncoder().encode(`bfv-session-v1:${sessionId}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bfvNormalizeSpans(value: unknown, token: string): BfvSpan[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const spans = value
    .map((span: any) => ({
      text: String(span?.text || ""),
      italic: span?.italic === true,
    }))
    .filter((span) => span.text.length > 0);
  if (!spans.some((span) => span.italic)) return undefined;
  if (spans.map((span) => span.text).join("") !== token) return undefined;
  return spans;
}

export class BodyForVisitsRoom {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private ready = false;

  // Online neural model — lazily loaded on first qualify, trained in place.
  private net: any = null;
  private vctx: any = null;
  private netSelector: ((...args: any[]) => any) | null = null;
  private netLoaded = false;
  private netSteps = 0;
  private netDirty = false;
  private lastGoodWeights: Float32Array | null = null;
  private pretrainedWeights: Float32Array | null = null;
  private qualifyQueue = new BfvSerialQueue();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    // Idle keepalive pings are answered by the runtime without waking the DO.
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
    void this.state.blockConcurrencyWhile(async () => {
      this.ensureSchema();
      this.ready = true;
    });
  }

  private ensureSchema(): void {
    const sql = this.state.storage.sql;
    sql.exec(
      `CREATE TABLE IF NOT EXISTS events (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         ts INTEGER NOT NULL,
         kind TEXT NOT NULL,
         ip_hash TEXT NOT NULL,
         session_hash TEXT NOT NULL,
         ua_class TEXT NOT NULL,
         token TEXT NOT NULL,
         role TEXT NOT NULL
       )`
    );
    sql.exec(`CREATE INDEX IF NOT EXISTS events_session_ts ON events(session_hash, ts)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS events_ts ON events(ts)`);
    sql.exec(
      `CREATE TABLE IF NOT EXISTS body_state (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         body_json TEXT NOT NULL,
         body_version INTEGER NOT NULL,
         fold_count INTEGER NOT NULL,
         fold_generations INTEGER NOT NULL,
         corruption_count INTEGER NOT NULL,
         fringe_json TEXT NOT NULL,
         updated_at INTEGER NOT NULL
       )`
    );
    const existing = sql.exec(`SELECT id FROM body_state WHERE id = 1`).toArray();
    if (existing.length === 0) {
      sql.exec(
        `INSERT INTO body_state (id, body_json, body_version, fold_count, fold_generations, corruption_count, fringe_json, updated_at)
         VALUES (1, ?, 0, 0, 0, 0, ?, ?)`,
        "[]",
        "[]",
        Date.now()
      );
    }

    // Each accepted visit carries the visitor's dwell time; the neural model
    // weights its training by that attention. SQLite has no ADD COLUMN IF NOT
    // EXISTS, and ensureSchema re-runs on every DO wake — guard with PRAGMA.
    const eventCols = sql.exec(`PRAGMA table_info(events)`).toArray();
    if (!eventCols.some((col: any) => col.name === "dwell_ms")) {
      sql.exec(`ALTER TABLE events ADD COLUMN dwell_ms INTEGER NOT NULL DEFAULT 0`);
    }
    if (!eventCols.some((col: any) => col.name === "style_json")) {
      sql.exec(`ALTER TABLE events ADD COLUMN style_json TEXT NOT NULL DEFAULT ''`);
    }
    if (!eventCols.some((col: any) => col.name === "visit_id")) {
      sql.exec(`ALTER TABLE events ADD COLUMN visit_id TEXT NOT NULL DEFAULT ''`);
    }

    // The body buffers a generated span; each visit reveals 1-3 tokens of it.
    const bodyCols = sql.exec(`PRAGMA table_info(body_state)`).toArray();
    if (!bodyCols.some((col: any) => col.name === "pending_json")) {
      sql.exec(`ALTER TABLE body_state ADD COLUMN pending_json TEXT NOT NULL DEFAULT '[]'`);
    }

    // Persisted online-model weights — one row, overwritten on checkpoint.
    sql.exec(
      `CREATE TABLE IF NOT EXISTS net_state (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         version INTEGER NOT NULL,
         vocab_hash TEXT NOT NULL,
         weights BLOB NOT NULL,
         step_count INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`
    );
  }

  private readState(): BfvStateRow {
    const rows = this.state.storage.sql
      .exec<BfvStateRow>(`SELECT body_json, body_version, fold_count, fold_generations, corruption_count, fringe_json, pending_json FROM body_state WHERE id = 1`)
      .toArray();
    return (
      rows[0] || {
        body_json: "[]",
        body_version: 0,
        fold_count: 0,
        fold_generations: 0,
        corruption_count: 0,
        fringe_json: "[]",
        pending_json: "[]",
      }
    );
  }

  private parseBody(row: BfvStateRow): BfvToken[] {
    try {
      const parsed = JSON.parse(row.body_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parseFringe(row: BfvStateRow): string[] {
    try {
      const parsed = JSON.parse(row.fringe_json);
      return Array.isArray(parsed) ? parsed.map(String).slice(-BFV_FRINGE_KEEP) : [];
    } catch {
      return [];
    }
  }

  private buildResponseBody(row: BfvStateRow, newTokenIndex: number | null) {
    const body = this.parseBody(row);
    const fringe = this.parseFringe(row);
    return {
      body,
      new_token_index: newTokenIndex,
      body_version: row.body_version,
      accepted_count: this.acceptedCountSinceReset(),
      fold_count: row.fold_count,
      fold_generations: row.fold_generations,
      corruption_count: row.corruption_count,
      fringe: fringe.join(" "),
    };
  }

  private acceptedCountSinceReset(): number {
    const resetId = this.lastAdminResetEventId();
    const rows = this.state.storage.sql
      .exec<{ n: number }>(
        `SELECT COUNT(*) AS n FROM events WHERE kind = 'human' AND id > ?`,
        resetId
      )
      .toArray();
    return Number(rows[0]?.n || 0);
  }

  private hasAcceptedVisit(sessionHash: string, visitId: string): boolean {
    if (!visitId) return false;
    const resetId = this.lastAdminResetEventId();
    const rows = this.state.storage.sql
      .exec<{ id: number }>(
        `SELECT id FROM events
          WHERE kind = 'human'
            AND session_hash = ?
            AND visit_id = ?
            AND id > ?
          LIMIT 1`,
        sessionHash,
        visitId,
        resetId
      )
      .toArray();
    return rows.length > 0;
  }

  private lastAdminResetEventId(): number {
    const rows = this.state.storage.sql
      .exec<{ id: number | null }>(`SELECT MAX(id) AS id FROM events WHERE kind = 'admin_reset'`)
      .toArray();
    return Number(rows[0]?.id || 0);
  }

  private humanJournalSinceReset(): Array<{ token: string; role: string; dwell_ms: number }> {
    const resetId = this.lastAdminResetEventId();
    return this.state.storage.sql
      .exec<{ token: string; role: string; dwell_ms: number }>(
        `SELECT token, role, dwell_ms FROM events WHERE kind = 'human' AND id > ? ORDER BY id`,
        resetId
      )
      .toArray();
  }

  // Lazily build the online model: restore checkpointed weights from SQLite if
  // the vocab still matches, otherwise fall back to the bundled warm-start.
  private ensureNet(): void {
    if (this.netLoaded) return;
    const cfg = BFV_NET_MODEL.config;
    const net = bfvCreateNet(cfg, 1);
    this.pretrainedWeights = bfvBase64ToFloats(BFV_NET_MODEL.weightsB64);

    let restored = false;
    try {
      const rows = this.state.storage.sql
        .exec<{ vocab_hash: string; weights: ArrayBuffer; step_count: number }>(
          `SELECT vocab_hash, weights, step_count FROM net_state WHERE id = 1`
        )
        .toArray();
      const row = rows[0];
      if (row && row.vocab_hash === BFV_NET_MODEL.vocabHash) {
        bfvLoadWeights(net, row.weights);
        if (!bfvHasNaN(net)) {
          this.netSteps = Number(row.step_count) || 0;
          restored = true;
        }
      }
    } catch {
      restored = false;
    }
    if (!restored) {
      bfvLoadWeights(net, this.pretrainedWeights);
      this.netSteps = 0;
    }

    this.net = net;
    this.vctx = bfvBuildVocabContext(BFV_NET_MODEL.vocab);
    this.netSelector = bfvCreateSelector(net, this.vctx);
    this.lastGoodWeights = bfvSnapshotWeights(net);
    this.netLoaded = true;
    if (!restored) this.checkpointNet();
  }

  private checkpointNet(): void {
    if (!this.netLoaded || !this.net) return;
    try {
      const bytes = bfvSerializeNet(this.net);
      this.state.storage.sql.exec(
        `INSERT OR REPLACE INTO net_state (id, version, vocab_hash, weights, step_count, updated_at)
         VALUES (1, ?, ?, ?, ?, ?)`,
        BFV_NET_MODEL.version,
        BFV_NET_MODEL.vocabHash,
        bytes.buffer,
        this.netSteps,
        Date.now()
      );
      this.netDirty = false;
    } catch {
      // a failed checkpoint just leaves netDirty set — the alarm retries
    }
  }

  private async ensureCheckpointAlarm(): Promise<void> {
    try {
      const existing = await this.state.storage.getAlarm();
      if (existing == null) {
        await this.state.storage.setAlarm(Date.now() + BFV_NET_CHECKPOINT_MS);
      }
    } catch {
      // alarm scheduling is best-effort
    }
  }

  // Fired ~5 min after activity — persists weights, then lapses when idle.
  async alarm(): Promise<void> {
    try {
      if (this.netDirty && this.netLoaded) this.checkpointNet();
    } catch {
      // observability surfaces the failure
    }
    if (this.netDirty) {
      try {
        await this.state.storage.setAlarm(Date.now() + BFV_NET_CHECKPOINT_MS);
      } catch {
        // ignore alarm scheduling failure
      }
    }
  }

  // One reward-weighted SGD step over a recency-decayed replay of the body.
  private trainFromJournal(
    journal: Array<{ token: string; role: string; dwell_ms: number }>,
    now: number
  ): void {
    if (!this.netLoaded || !this.net) return;
    const batch = this.buildReplayBatch(journal, now);
    if (batch.length === 0) return;
    bfvTrainStep(this.net, batch, { lr: BFV_NET_LR, clip: 1.0, decay: BFV_NET_L2 });
    if (bfvHasNaN(this.net)) {
      if (this.lastGoodWeights) bfvLoadWeights(this.net, this.lastGoodWeights);
      return;
    }
    this.lastGoodWeights = bfvSnapshotWeights(this.net);
    this.netSteps += 1;
    this.netDirty = true;
    if (this.netSteps % BFV_NET_CHECKPOINT_EVERY === 0) {
      this.runCollapseWatchdog(journal);
      this.checkpointNet();
    }
  }

  // Word-level (context -> next) pairs from the recent body, each weighted by
  // attention (dwell) and decay (event age). When more pairs exist than fit a
  // batch, a recency-biased weighted reservoir picks the subsample.
  private buildReplayBatch(
    journal: Array<{ token: string; role: string; dwell_ms: number }>,
    now: number
  ): any[] {
    if (!this.net || !this.vctx) return [];
    const K = this.net.config.K;
    const vctx = this.vctx;
    const flat: Array<{ id: number; eventIndex: number; dwell: number }> = [];
    for (let e = 0; e < journal.length; e++) {
      const ev = journal[e];
      if (!ev || ev.role === "fold_marker" || ev.role === "corruption") continue;
      for (const word of bfvTokenize(ev.token)) {
        const id = vctx.word2id.get(word);
        flat.push({
          id: id == null ? vctx.UNK : id,
          eventIndex: e,
          dwell: Number(ev.dwell_ms) || 0,
        });
      }
    }
    const recent = flat.slice(-BFV_NET_REPLAY);
    if (recent.length <= K) return [];
    const latest = journal.length - 1;
    const candidates: any[] = [];
    for (let t = K; t < recent.length; t++) {
      const target = recent[t].id;
      if (target === vctx.UNK || target === vctx.BOS) continue;
      const ctx: number[] = [];
      for (let k = t - K; k < t; k++) ctx.push(recent[k].id);
      const attention = Math.min(2.0, Math.max(0.25, recent[t].dwell / 2000));
      const age = latest - recent[t].eventIndex;
      const decay = Math.pow(0.5, age / BFV_NET_DECAY_HALFLIFE);
      candidates.push({ ctx, target, weight: attention * decay });
    }
    if (candidates.length <= BFV_NET_BATCH) return candidates;
    const rng = bfvRng((now ^ Math.imul(this.netSteps + 1, 0x9e3779b1)) >>> 0);
    for (const c of candidates) {
      c.key = Math.pow(rng() || 1e-9, 1 / Math.max(c.weight, 1e-6));
    }
    candidates.sort((a, b) => b.key - a.key);
    return candidates.slice(0, BFV_NET_BATCH);
  }

  // If recent output diversity collapses, lean a little back on the bundled
  // warm-start weights — a last-resort guard against a self-training loop.
  private runCollapseWatchdog(
    journal: Array<{ token: string; role: string }>
  ): void {
    if (!this.net || !this.pretrainedWeights) return;
    const words: string[] = [];
    for (let e = Math.max(0, journal.length - 40); e < journal.length; e++) {
      const ev = journal[e];
      if (!ev || ev.role !== "speech_unit") continue;
      for (const word of bfvTokenize(ev.token)) words.push(word);
    }
    if (words.length < 60) return;
    const distinct = new Set(words).size / words.length;
    if (distinct < BFV_NET_COLLAPSE_RATIO) {
      bfvBlendToward(this.net, this.pretrainedWeights, 0.1);
      this.lastGoodWeights = bfvSnapshotWeights(this.net);
    }
  }

  private sessionQuota(sessionHash: string, now: number): BfvQuota & { used: number } {
    const resetId = this.lastAdminResetEventId();
    const windowStart = now - BFV_SESSION_QUOTA_WINDOW_MS;
    const rows = this.state.storage.sql
      .exec<{ n: number; oldest_ts: number | null }>(
        `SELECT COUNT(*) AS n, MIN(ts) AS oldest_ts
           FROM events
          WHERE kind = 'human'
            AND session_hash = ?
            AND id > ?
            AND ts >= ?`,
        sessionHash,
        resetId,
        windowStart
      )
      .toArray();
    const used = Number(rows[0]?.n || 0);
    const oldest = rows[0]?.oldest_ts ?? null;
    return {
      limit: BFV_SESSION_QUOTA_LIMIT,
      remaining: Math.max(0, BFV_SESSION_QUOTA_LIMIT - used),
      window_ms: BFV_SESSION_QUOTA_WINDOW_MS,
      reset_at: oldest ? oldest + BFV_SESSION_QUOTA_WINDOW_MS : null,
      used,
    };
  }

  private isAdminRequest(request: Request): boolean {
    const expected = clean(this.env.BFV_ADMIN_TOKEN);
    const raw = clean(request.headers.get("authorization") || "");
    const match = raw.match(/^Bearer\s+(.+)$/i);
    const token = clean(match?.[1] || "");
    return constantTimeEqual(token, expected);
  }

  // Presence = the number of open corpus pages (live WebSockets). Counted per
  // socket, so it stays simple, visible, and survives DO hibernation.
  private presenceCount(exclude?: WebSocket): number {
    let n = 0;
    for (const ws of this.state.getWebSockets()) {
      if (exclude && ws === exclude) continue;
      n++;
    }
    return n;
  }

  private broadcast(message: string, exclude?: WebSocket): void {
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(message);
      } catch {
        // socket is dead; the runtime will reap it
      }
    }
  }

  // One unified message shape: a full authoritative snapshot plus the live
  // presence count. Clients gate on body_version / corruption_count, so a
  // dropped, duplicated, or out-of-order message can never accumulate drift.
  private snapshotMessage(
    row: BfvStateRow,
    newTokenIndex: number | null,
    excludePresence?: WebSocket
  ): string {
    return JSON.stringify({
      type: "sync",
      ...this.buildResponseBody(row, newTokenIndex),
      presence: this.presenceCount(excludePresence),
    });
  }

  private handleSocket(request: Request): Response {
    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);

    // The new socket gets the current body immediately; everyone else just
    // sees the presence count tick up (their body_version is unchanged).
    const message = this.snapshotMessage(this.readState(), null);
    try {
      server.send(message);
    } catch {
      // socket may have closed before the first send
    }
    this.broadcast(message, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(_ws: WebSocket, _raw: string | ArrayBuffer): void {
    // Keepalive "ping" is answered by setWebSocketAutoResponse. The socket is
    // otherwise receive-only — visits mutate through POST /qualify.
  }

  webSocketClose(ws: WebSocket): void {
    this.announcePresence(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.announcePresence(ws);
  }

  // Cloudflare keeps the closing socket in getWebSockets() until the close
  // handler returns; exclude it so the broadcast reflects the post-close count.
  private announcePresence(closing: WebSocket): void {
    this.broadcast(this.snapshotMessage(this.readState(), null, closing), closing);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.endsWith("/socket")) {
      return this.handleSocket(request);
    }
    if ((request.method === "GET" || request.method === "POST") && path === "/state") {
      return this.stateResponse(request);
    }
    if (request.method === "POST" && path === "/qualify") {
      return this.enqueueQualify(request);
    }
    if (request.method === "GET" && path === "/export") {
      return this.export();
    }
    if (request.method === "GET" && path === "/snapshot") {
      const state = this.buildResponseBody(this.readState(), null);
      const html = bfvSnapshot(state, new Date().toISOString());
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
      });
    }
    if (request.method === "POST" && path === "/admin/reset") {
      return this.adminReset(request);
    }
    if (request.method === "GET" && path === "/presence") {
      return this.responseJson({ count: this.presenceCount() });
    }
    return this.responseJson({ error: "not_found" }, 404);
  }

  private enqueueQualify(request: Request): Promise<Response> {
    return this.qualifyQueue.run(() => this.qualify(request));
  }

  private async stateResponse(request: Request): Promise<Response> {
    const data: any = {
      ...this.buildResponseBody(this.readState(), null),
    };

    if (request.method === "POST") {
      let payload: any = {};
      try {
        payload = await request.json();
      } catch {
        payload = {};
      }
      const sessionId = clean(payload?.session_id);
      if (/^[0-9a-f-]{8,64}$/i.test(sessionId)) {
        const sessionHash = await bfvHashSession(sessionId);
        data.quota = this.sessionQuota(sessionHash, Date.now());
      }
    }

    return this.responseJson(data);
  }

  private async adminReset(request: Request): Promise<Response> {
    if (!this.isAdminRequest(request)) {
      return this.responseJson({ error: "unauthorized" }, 401);
    }

    const now = Date.now();
    const sql = this.state.storage.sql;
    sql.exec(
      `INSERT INTO events (ts, kind, ip_hash, session_hash, ua_class, token, role)
       VALUES (?, 'admin_reset', 'admin', 'admin', 'admin', 'reset', 'reset')`,
      now
    );
    const eventIdRow = sql.exec<{ id: number }>(`SELECT last_insert_rowid() AS id`).toArray();
    const eventId = eventIdRow[0]?.id ?? null;

    sql.exec(
      `UPDATE body_state
         SET body_json = '[]',
             body_version = body_version + 1,
             fold_count = 0,
             fold_generations = 0,
             corruption_count = 0,
             fringe_json = '[]',
             pending_json = '[]',
             updated_at = ?
       WHERE id = 1`,
      now
    );

    const updated = this.readState();
    this.broadcast(this.snapshotMessage(updated, null));
    return this.responseJson({
      ok: true,
      reset_event_id: eventId,
      ...this.buildResponseBody(updated, null),
    });
  }

  private async qualify(request: Request): Promise<Response> {
    let payload: any = {};
    try {
      payload = await request.json();
    } catch {
      return this.responseJson({ error: "bad_json" }, 400);
    }
    const sessionId = clean(payload?.session_id);
    if (!/^[0-9a-f-]{8,64}$/i.test(sessionId)) {
      return this.responseJson({ error: "bad_session" }, 400);
    }
    const visitId = bfvNormalizeVisitId(payload?.visit_id);
    if (visitId === null) {
      return this.responseJson({ error: "bad_visit_id" }, 400);
    }
    // Visitor dwell time — the attention signal that weights model training.
    const visibleMs = Math.max(
      0,
      Math.min(BFV_NET_MAX_DWELL_MS, Math.round(Number(payload?.visible_ms) || 0))
    );
    const ua = request.headers.get("user-agent") || "";
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "anon";
    const salt = this.env.BFV_HASH_SALT || "bfv-default-salt";
    const ipHash = await bfvHashIp(ip, salt);
    const sessionHash = await bfvHashSession(sessionId);
    const now = Date.now();

    const sql = this.state.storage.sql;
    const quota = this.sessionQuota(sessionHash, now);
    if (visitId && this.hasAcceptedVisit(sessionHash, visitId)) {
      const data = this.buildResponseBody(this.readState(), null);
      return this.responseJson(bfvDuplicateQualifyResponse(data, quota));
    }

    const stateRow = this.readState();
    const body = this.parseBody(stateRow);
    // For grammar, ignore the fold marker if it's at index 0.
    const realBody = body[0]?.role === "fold_marker" ? body.slice(1) : body;
    const prev = realBody.length > 0 ? realBody[realBody.length - 1] : null;
    let pending: BfvPendingToken[];
    try {
      const parsedPending = JSON.parse(stateRow.pending_json || "[]");
      pending = Array.isArray(parsedPending) ? parsedPending : [];
    } catch {
      pending = [];
    }
    // The model is shown the body so far; it continues from there.
    const contextText = body
      .filter((t) => t.role !== "fold_marker")
      .map((t) => t.token)
      .join(" ");
    const humanCountRows = sql
      .exec<{ n: number }>(`SELECT COUNT(*) AS n FROM events WHERE kind = 'human'`)
      .toArray();
    const humanEventIndex = (humanCountRows[0]?.n || 0) + 1;
    const seed = parseInt(ipHash.slice(0, 8), 16) || 1;
    // The model learns as it goes: before generating, it takes one online
    // training step over a recency- and attention-weighted replay of the body.
    const journal = this.humanJournalSinceReset();
    this.ensureNet();
    this.trainFromJournal(journal, now);
    await this.ensureCheckpointAlarm();
    const model = bfvInferModel(journal);

    // Reveal-gradual: the selector reveals 1-3 tokens of a buffered span,
    // generating the next span (Workers AI) when the buffer runs dry.
    const selector = bfvCreateBufferedSelector({
      ai: this.env.AI,
      netSelector: this.netSelector,
      getPending: () => pending,
      setPending: (next: BfvPendingToken[]) => {
        pending = next;
      },
      getContext: () => contextText,
    });
    const decision = await bfvDecide({
      ua,
      sessionWindowCount: quota.used,
      prevRole: prev?.role ?? null,
      prevToken: prev?.token ?? null,
      humanEventIndex,
      seed,
      now,
      model,
      selector,
    });

    if (decision.action === "cooldown") {
      const data = this.buildResponseBody(stateRow, null);
      return this.responseJson({ ...data, skipped: "cooldown", quota });
    }

    if (decision.action === "bot") {
      const glyphs = BFV_BUCKETS.corruption_glyphs;
      const glyph = glyphs[Math.abs(seed) % glyphs.length];
      sql.exec(
        `INSERT INTO events (ts, kind, ip_hash, session_hash, ua_class, token, role)
         VALUES (?, 'bot', ?, ?, ?, ?, 'corruption')`,
        now,
        ipHash,
        sessionHash,
        `bot:${decision.bucket}`,
        glyph
      );
      const fringe = this.parseFringe(stateRow);
      fringe.push(glyph);
      const fringeKept = fringe.slice(-BFV_FRINGE_KEEP);
      const nextCorruption = stateRow.corruption_count + 1;
      sql.exec(
        `UPDATE body_state SET corruption_count = ?, fringe_json = ?, updated_at = ? WHERE id = 1`,
        nextCorruption,
        JSON.stringify(fringeKept),
        now
      );
      const next = { ...stateRow, corruption_count: nextCorruption, fringe_json: JSON.stringify(fringeKept) };
      this.broadcast(this.snapshotMessage(next, null));
      const data = this.buildResponseBody(next, null);
      return this.responseJson({ ...data, skipped: "bot" });
    }

    if (decision.action === "withhold") {
      const data = this.buildResponseBody(stateRow, null);
      return this.responseJson({
        ...data,
        skipped: "generator",
        error: "generator_unavailable",
        quota,
      }, 503);
    }

    // The work never ends with a terminal period. If the new token is "." and
    // would land at the body's tail, swap to a comma so the sentence stays open.
    let nextToken = decision.token;
    if (nextToken === "." ) nextToken = ",";
    const nextSpans = bfvNormalizeSpans((decision as any).spans, nextToken);
    const styleJson = nextSpans ? JSON.stringify(nextSpans) : "";

    // append
    sql.exec(
      `INSERT INTO events (ts, kind, ip_hash, session_hash, ua_class, token, role, dwell_ms, style_json, visit_id)
       VALUES (?, 'human', ?, ?, 'browser', ?, ?, ?, ?, ?)`,
      now,
      ipHash,
      sessionHash,
      nextToken,
      decision.role,
      visibleMs,
      styleJson,
      visitId || ""
    );
    const eventIdRow = sql.exec<{ id: number }>(`SELECT last_insert_rowid() AS id`).toArray();
    const eventId = eventIdRow[0]?.id ?? null;

    const nextEntry: BfvToken = {
      token: nextToken,
      role: decision.role,
      event_id: eventId,
      ts: now,
      ...(nextSpans ? { spans: nextSpans } : {}),
    };
    const nextBody: BfvToken[] = [...body, nextEntry];
    const folded = bfvFold(nextBody, stateRow.fold_count, stateRow.fold_generations, now);
    const newTokenIndex = folded.body.length - 1;
    const nextVersion = stateRow.body_version + 1;

    sql.exec(
      `UPDATE body_state
         SET body_json = ?, body_version = ?, fold_count = ?, fold_generations = ?, pending_json = ?, updated_at = ?
       WHERE id = 1`,
      JSON.stringify(folded.body),
      nextVersion,
      folded.fold_count,
      folded.fold_generations,
      JSON.stringify(pending),
      now
    );

    const updated: BfvStateRow = {
      body_json: JSON.stringify(folded.body),
      body_version: nextVersion,
      fold_count: folded.fold_count,
      fold_generations: folded.fold_generations,
      corruption_count: stateRow.corruption_count,
      fringe_json: stateRow.fringe_json,
      pending_json: JSON.stringify(pending),
    };
    this.broadcast(this.snapshotMessage(updated, newTokenIndex));
    const data = this.buildResponseBody(updated, newTokenIndex);
    return this.responseJson({
      ...data,
      skipped: null,
      quota: {
        ...quota,
        used: quota.used + 1,
        remaining: Math.max(0, quota.remaining - 1),
        reset_at: quota.reset_at ?? now + BFV_SESSION_QUOTA_WINDOW_MS,
      },
    });
  }

  private export(): Response {
    const rows = this.state.storage.sql
      .exec<{
        id: number;
        ts: number;
        kind: string;
        session_hash: string;
        ua_class: string;
        token: string;
        role: string;
        dwell_ms: number;
        style_json: string;
      }>(`SELECT id, ts, kind, session_hash, ua_class, token, role, dwell_ms, style_json FROM events ORDER BY id ASC`)
      .toArray();
    const events = rows.map((r) => {
      const out: any = {
        id: r.id,
        ts: r.ts,
        kind: r.kind,
        session_hash: r.session_hash,
        ua_class: r.ua_class,
        token: r.token,
        role: r.role,
        dwell_ms: r.dwell_ms,
      };
      if (r.style_json) out.style_json = r.style_json;
      return out;
    });
    const stateRow = this.readState();
    // The model the corpus has inferred about its own syntax and word habits.
    const resetId = this.lastAdminResetEventId();
    const humanSeq = rows
      .filter((r) => r.kind === "human" && r.id > resetId)
      .map((r) => ({ token: r.token, role: r.role }));
    const body = {
      exported_at: new Date().toISOString(),
      body_version: stateRow.body_version,
      fold_count: stateRow.fold_count,
      fold_generations: stateRow.fold_generations,
      corruption_count: stateRow.corruption_count,
      model: bfvInferModel(humanSeq),
      events,
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }

  private responseJson(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
}
// ─── /body-for-visits ─────────────────────────────────────────────────────────

type SiteDeployRecord = {
  sha: string;
  shortSha: string;
  at: string;
  text: string;
  url?: string;
};

const SITE_DEPLOYS_KEY = "feed:site-deploys-v1";
const SITE_DEPLOYS_MAX = 30;
const SITE_DEPLOY_TEXT_MAX = 240;
const SITE_DEPLOY_SUBJECTS_MAX = 220;

async function fetchSite(env: Env): Promise<FeedItem[]> {
  const url = clean(env.SITE_VERSION_URL);
  const kv = env.HITS_KV;
  if (!url || !kv) return [];

  let stored: SiteDeployRecord[] = [];
  try {
    const raw = await kv.get(SITE_DEPLOYS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        stored = parsed
          .filter((d): d is SiteDeployRecord => !!d && typeof d.sha === "string" && typeof d.at === "string")
          .slice(0, SITE_DEPLOYS_MAX);
      }
    }
  } catch {
    stored = [];
  }

  let manifest: any = null;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 30, cacheEverything: false },
    } as RequestInit);
    if (response.ok) {
      manifest = await response.json().catch(() => null);
    }
  } catch {
    manifest = null;
  }

  const sha = clean(manifest?.sha);
  if (sha && sha !== "dev" && !stored.some((d) => d.sha === sha)) {
    const shortSha = clean(manifest?.shortSha) || sha.slice(0, 7);
    const at = normalizeIsoAt(manifest?.at) || new Date().toISOString();
    const subjects = Array.isArray(manifest?.subjects)
      ? manifest.subjects.map((s: unknown) => clean(s)).filter((s: string) => s.length > 0)
      : [];
    const subjectsBody = subjects.length > 0 ? short(subjects.join("; "), SITE_DEPLOY_SUBJECTS_MAX) : "";
    const text = subjectsBody
      ? short(`site deployed · ${shortSha} · ${subjectsBody}`, SITE_DEPLOY_TEXT_MAX)
      : `site deployed · ${shortSha}`;
    const repoUrl = clean(env.SITE_REPO_URL).replace(/\/+$/, "");
    const commitUrl = repoUrl ? `${repoUrl}/commit/${sha}` : undefined;
    const record: SiteDeployRecord = {
      sha,
      shortSha,
      at,
      text,
      ...(commitUrl ? { url: commitUrl } : {}),
    };
    stored = [record, ...stored].slice(0, SITE_DEPLOYS_MAX);
    try {
      await kv.put(SITE_DEPLOYS_KEY, JSON.stringify(stored));
    } catch {
      // best-effort persist; observability surfaces failure
    }
  }

  return stored.map((d) => ({
    source: "site",
    text: d.text,
    at: d.at,
    ...(d.url ? { url: d.url } : {}),
  }));
}

async function buildFeedSnapshot(env: Env): Promise<FeedSnapshot> {
  const tasks: Array<[string, () => Promise<FeedItem[]>]> = [
    ["github", () => fetchGitHub(env, FEED_MAX_ITEMS)],
    ["bandcamp", () => fetchBandcamp(env, FEED_MAX_ITEMS)],
    ["instagram", () => fetchInstagram(env, FEED_MAX_ITEMS)],
    ["spotify", () => fetchSpotify(env)],
    ["x", () => fetchX(env, FEED_MAX_ITEMS)],
    ["youtube", () => fetchYouTube(env, FEED_MAX_ITEMS)],
    ["site", () => fetchSite(env)],
  ];

  const results = await Promise.allSettled(tasks.map((task) => task[1]()));
  const items: FeedItem[] = [];
  const sources: Record<string, SourceStatus> = {};
  const configured = (name: string) => {
    switch (name) {
      case "github":
        return !!clean(env.GITHUB_USERNAME || "cbassuarez");
      case "bandcamp":
        return !!clean(env.BANDCAMP_DOMAIN || "cbassuarez.bandcamp.com");
      case "instagram":
        return !!clean(env.IG_USER_ID) && !!clean(env.IG_ACCESS_TOKEN);
      case "spotify":
        return (
          !!clean(env.SPOTIFY_CLIENT_ID) &&
          !!clean(env.SPOTIFY_CLIENT_SECRET) &&
          !!clean(env.SPOTIFY_REFRESH_TOKEN)
        );
      case "x":
        return !!clean(env.X_USERNAME) && !!clean(env.X_BEARER_TOKEN);
      case "youtube":
        return !!clean(env.YT_CHANNEL_ID) && !!clean(env.YT_API_KEY);
      case "site":
        return !!clean(env.SITE_VERSION_URL);
      default:
        return false;
    }
  };

  results.forEach((result, index) => {
    const name = tasks[index][0];
    if (result.status === "fulfilled") {
      const value = result.value || [];
      items.push(...value);
      sources[name] = {
        status: value.length > 0 || configured(name) ? "ok" : "missing_config",
        count: value.length,
        message: value.length > 0 ? undefined : configured(name) ? "No recent activity." : "No data returned.",
      };
      return;
    }

    const message = clean(result.reason?.message || result.reason || "unknown error");
    sources[name] = {
      status: message.toLowerCase().includes("missing") ? "missing_config" : "error",
      count: 0,
      message,
    };
  });

  const previous = await readFeedSnapshot(env);
  const historical = previous?.items || [];
  const merged = [...items, ...historical]
    .map((item) => {
      const at = normalizeIsoAt(item?.at);
      return at ? { ...item, at } : null;
    })
    .filter((item): item is FeedItem => !!item && item.text.length > 0)
    .sort((a, b) => parseFeedTimeMs(b.at) - parseFeedTimeMs(a.at))
    .filter((item, index, array) => {
      const key = timelineIdentity(item);
      return array.findIndex((candidate) => timelineIdentity(candidate) === key) === index;
    });

  const persisted = sanitizeSpotifyTimeline(merged).slice(0, FEED_MAX_ITEMS);
  return {
    items: persisted,
    sources,
    generatedAt: new Date().toISOString(),
  };
}

async function persistFeedSnapshot(env: Env, snapshot: FeedSnapshot): Promise<void> {
  const kv = env.HITS_KV;
  if (!kv) return;
  await kv.put(FEED_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

async function readFeedSnapshot(env: Env): Promise<FeedSnapshot | null> {
  const kv = env.HITS_KV;
  if (!kv) return null;

  const raw = await kv.get(FEED_SNAPSHOT_KEY);
  if (!raw) return null;

  try {
    const parsed: any = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items)) {
      return {
        items: parsed.items as FeedItem[],
        sources: (parsed.sources || {}) as Record<string, SourceStatus>,
        generatedAt: clean(parsed.generatedAt) || new Date().toISOString(),
      };
    }
  } catch {
    // ignore parse failure, treat as missing
  }
  return null;
}

async function checkRateLimit(binding: RateLimitBinding | undefined, key: string): Promise<boolean> {
  if (!binding) return true;
  try {
    const result = await binding.limit({ key });
    return result.success;
  } catch {
    return true;
  }
}

function tooManyRequests(allowOrigin: string): Response {
  return new Response(
    JSON.stringify({ error: "rate_limited", at: new Date().toISOString() }),
    { status: 429, headers: { ...jsonHeaders(allowOrigin), "retry-after": "60" } }
  );
}

type GoogleDpJobState = {
  stage: "pending" | "ready" | "failed";
  archiveJobId: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  candidates?: GoogleAdInterestCandidate[];
  returnTo: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

const GOOGLE_DP_OAUTH_COOKIE = "tp_google_oauth";
const GOOGLE_DP_PENDING_TTL_SECONDS = 7 * 24 * 60 * 60;
const GOOGLE_DP_READY_TTL_SECONDS = 60 * 60;
const GOOGLE_DP_COOKIE_TTL_SECONDS = 15 * 60;
const GOOGLE_DP_MAX_ARCHIVE_BYTES = 12 * 1024 * 1024;
const GOOGLE_DP_MAX_ARCHIVE_URLS = 5;
const GOOGLE_DP_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_DP_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DP_API = "https://dataportability.googleapis.com/v1";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToBase64Url(buf);
}

async function sha256Bytes(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

async function hmacBase64Url(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(sig));
}

async function signedToken(payload: unknown, secret: string): Promise<string> {
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return encoded + "." + (await hmacBase64Url(encoded, secret));
}

async function verifySignedToken<T>(token: string, secret: string): Promise<T | null> {
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const expected = await hmacBase64Url(encoded, secret);
  if (!constantTimeEqual(sig, expected)) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as T;
  } catch {
    return null;
  }
}

async function aesKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    await sha256Bytes(secret),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptJson(value: unknown, secret: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(secret),
    new TextEncoder().encode(JSON.stringify(value))
  );
  return bytesToBase64Url(iv) + "." + bytesToBase64Url(new Uint8Array(encrypted));
}

async function decryptJson<T>(value: string, secret: string): Promise<T | null> {
  const [ivRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !encryptedRaw) return null;
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(ivRaw) },
      await aesKey(secret),
      base64UrlToBytes(encryptedRaw)
    );
    return JSON.parse(new TextDecoder().decode(decrypted)) as T;
  } catch {
    return null;
  }
}

function parseCookie(header: string, name: string): string {
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return rest.join("=");
  }
  return "";
}

function clearGoogleDpCookie(): string {
  return `${GOOGLE_DP_OAUTH_COOKIE}=; Max-Age=0; Path=/api/this-person/google/; HttpOnly; SameSite=Lax`;
}

function setGoogleDpCookie(value: string, secure: boolean): string {
  return [
    `${GOOGLE_DP_OAUTH_COOKIE}=${value}`,
    `Max-Age=${GOOGLE_DP_COOKIE_TTL_SECONDS}`,
    "Path=/api/this-person/google/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function googleDpConfigured(env: Env): boolean {
  return !!(
    clean(env.GOOGLE_DP_CLIENT_ID) &&
    clean(env.GOOGLE_DP_CLIENT_SECRET) &&
    clean(env.GOOGLE_DP_REDIRECT_URI) &&
    clean(env.GOOGLE_DP_STATE_SECRET) &&
    clean(env.GOOGLE_DP_TOKEN_ENCRYPTION_KEY) &&
    env.HITS_KV
  );
}

function safeGoogleDpReturnTo(value: string, requestUrl: URL): string {
  const fallback = "https://cbassuarez.com/labs/this-person/";
  try {
    const u = new URL(value || fallback);
    const host = u.hostname.toLowerCase();
    const allowedHost =
      host === "cbassuarez.com" ||
      host === "www.cbassuarez.com" ||
      host === "localhost" ||
      host === "127.0.0.1";
    if (allowedHost && u.pathname.startsWith("/labs/this-person/")) return u.toString();
  } catch {
    // fall through
  }
  if (requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1") {
    return `http://localhost:5173/labs/this-person/?api=${encodeURIComponent(requestUrl.origin)}`;
  }
  return fallback;
}

function locationWithHash(returnTo: string, key: string, value: string): string {
  const u = new URL(returnTo);
  const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
  hash.set(key, value);
  u.hash = hash.toString();
  return u.toString();
}

function redirectWithHash(returnTo: string, key: string, value: string, headers?: HeadersInit): Response {
  return new Response(null, {
    status: 302,
    headers: { ...(headers || {}), location: locationWithHash(returnTo, key, value) },
  });
}

function googleJobKey(id: string): string {
  return "this-person:google-dp-job:" + id;
}

function validGoogleJobId(value: unknown): string {
  const id = clean(value);
  return /^[A-Za-z0-9_-]{16,96}$/.test(id) ? id : "";
}

async function putGoogleJob(env: Env, id: string, job: GoogleDpJobState, ttl: number): Promise<void> {
  if (!env.HITS_KV) throw new Error("kv_unconfigured");
  const encrypted = await encryptJson(job, clean(env.GOOGLE_DP_TOKEN_ENCRYPTION_KEY));
  await env.HITS_KV.put(googleJobKey(id), encrypted, { expirationTtl: ttl });
}

async function getGoogleJob(env: Env, id: string): Promise<GoogleDpJobState | null> {
  if (!env.HITS_KV) return null;
  const encrypted = await env.HITS_KV.get(googleJobKey(id));
  if (!encrypted) return null;
  return decryptJson<GoogleDpJobState>(encrypted, clean(env.GOOGLE_DP_TOKEN_ENCRYPTION_KEY));
}

async function deleteGoogleJob(env: Env, id: string): Promise<void> {
  if (env.HITS_KV) await env.HITS_KV.delete(googleJobKey(id));
}

async function googleCodeChallenge(verifier: string): Promise<string> {
  return bytesToBase64Url(new Uint8Array(await sha256Bytes(verifier)));
}

async function exchangeGoogleCode(env: Env, code: string, verifier: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> {
  const body = new URLSearchParams({
    code,
    client_id: clean(env.GOOGLE_DP_CLIENT_ID),
    client_secret: clean(env.GOOGLE_DP_CLIENT_SECRET),
    redirect_uri: clean(env.GOOGLE_DP_REDIRECT_URI),
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  const resp = await fetch(GOOGLE_DP_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) throw new Error(clean(data.error) || "token_exchange_failed");
  return {
    accessToken: clean(data.access_token),
    refreshToken: clean(data.refresh_token),
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
  };
}

async function refreshGoogleToken(env: Env, refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: number;
} | null> {
  if (!refreshToken) return null;
  const body = new URLSearchParams({
    client_id: clean(env.GOOGLE_DP_CLIENT_ID),
    client_secret: clean(env.GOOGLE_DP_CLIENT_SECRET),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch(GOOGLE_DP_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) return null;
  return {
    accessToken: clean(data.access_token),
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
  };
}

async function initiateGoogleArchive(accessToken: string): Promise<string> {
  const resp = await fetch(GOOGLE_DP_API + "/portabilityArchive:initiate", {
    method: "POST",
    headers: {
      authorization: "Bearer " + accessToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({ resources: [GOOGLE_DP_RESOURCE] }),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.archiveJobId) throw new Error(clean(data.error?.status || data.error) || "archive_initiate_failed");
  return clean(data.archiveJobId);
}

function archiveStatePath(archiveJobId: string): string {
  const cleanId = clean(archiveJobId).replace(/^archiveJobs\//, "").replace(/\/portabilityArchiveState$/, "");
  return GOOGLE_DP_API + "/archiveJobs/" + encodeURIComponent(cleanId) + "/portabilityArchiveState";
}

async function fetchGoogleArchiveState(accessToken: string, archiveJobId: string): Promise<Response> {
  return fetch(archiveStatePath(archiveJobId), {
    headers: { authorization: "Bearer " + accessToken },
  });
}

async function resetGoogleAuthorization(accessToken: string): Promise<void> {
  try {
    await fetch(GOOGLE_DP_API + "/authorization:reset", {
      method: "POST",
      headers: { authorization: "Bearer " + accessToken },
    });
  } catch {
    // Best-effort cleanup; local encrypted token deletion still happens.
  }
}

async function downloadGoogleArchiveCandidates(urls: string[]): Promise<GoogleAdInterestCandidate[]> {
  const byId = new Map<string, GoogleAdInterestCandidate>();
  for (const url of urls.slice(0, GOOGLE_DP_MAX_ARCHIVE_URLS)) {
    const resp = await fetch(url);
    if (!resp.ok) continue;
    const len = Number(resp.headers.get("content-length") || "0");
    if (len > GOOGLE_DP_MAX_ARCHIVE_BYTES) continue;
    const bytes = await resp.arrayBuffer();
    if (bytes.byteLength > GOOGLE_DP_MAX_ARCHIVE_BYTES) continue;
    const contentType = resp.headers.get("content-type") || "";
    const candidates = await extractGoogleAdInterestCandidatesFromArchiveBytes(bytes, url, contentType);
    for (const candidate of candidates) {
      if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
      if (byId.size >= TP_LIMITS.MAX_FRAGMENTS) break;
    }
    if (byId.size >= TP_LIMITS.MAX_FRAGMENTS) break;
  }
  return [...byId.values()];
}

async function handleGoogleDpStart(request: Request, env: Env, allowOrigin: string): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = safeGoogleDpReturnTo(url.searchParams.get("returnTo") || "", url);
  if (!googleDpConfigured(env)) {
    return redirectWithHash(returnTo, "google_error", "unconfigured");
  }
  if (!(await checkRateLimit(env.RATE_LIMIT_THIS_PERSON, "this-person:google-start"))) {
    return redirectWithHash(returnTo, "google_error", "rate_limited");
  }

  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const issuedAt = Date.now();
  const secret = clean(env.GOOGLE_DP_STATE_SECRET);
  const cookie = await signedToken({ nonce, verifier, issuedAt }, secret);
  const state = await signedToken({ nonce, returnTo, issuedAt }, secret);
  const authUrl = new URL(GOOGLE_DP_AUTH_URL);
  authUrl.searchParams.set("client_id", clean(env.GOOGLE_DP_CLIENT_ID));
  authUrl.searchParams.set("redirect_uri", clean(env.GOOGLE_DP_REDIRECT_URI));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_DP_SCOPE);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", await googleCodeChallenge(verifier));
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "false");

  return new Response(null, {
    status: 302,
    headers: {
      location: authUrl.toString(),
      "set-cookie": setGoogleDpCookie(cookie, url.protocol === "https:"),
      ...jsonHeaders(allowOrigin),
    },
  });
}

async function handleGoogleDpCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let returnTo = safeGoogleDpReturnTo("", url);
  const fail = (error: string) =>
    redirectWithHash(returnTo, "google_error", error, { "set-cookie": clearGoogleDpCookie() });

  if (!googleDpConfigured(env)) return fail("unconfigured");
  const secret = clean(env.GOOGLE_DP_STATE_SECRET);
  const rawState = clean(url.searchParams.get("state"));
  const state = rawState
    ? await verifySignedToken<{ nonce: string; returnTo: string; issuedAt: number }>(rawState, secret)
    : null;
  if (state?.returnTo) returnTo = safeGoogleDpReturnTo(state.returnTo, url);

  const oauthError = clean(url.searchParams.get("error"));
  if (oauthError) return fail(oauthError);
  if (!state || Date.now() - Number(state.issuedAt) > GOOGLE_DP_COOKIE_TTL_SECONDS * 1000) {
    return fail("bad_state");
  }

  const rawCookie = parseCookie(request.headers.get("cookie") || "", GOOGLE_DP_OAUTH_COOKIE);
  const cookie = rawCookie
    ? await verifySignedToken<{ nonce: string; verifier: string; issuedAt: number }>(rawCookie, secret)
    : null;
  if (!cookie || cookie.nonce !== state.nonce || Date.now() - Number(cookie.issuedAt) > GOOGLE_DP_COOKIE_TTL_SECONDS * 1000) {
    return fail("bad_cookie");
  }

  const code = clean(url.searchParams.get("code"));
  if (!code) return fail("missing_code");

  try {
    const token = await exchangeGoogleCode(env, code, cookie.verifier);
    const archiveJobId = await initiateGoogleArchive(token.accessToken);
    const id = randomToken(24);
    const now = new Date().toISOString();
    await putGoogleJob(env, id, {
      stage: "pending",
      archiveJobId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken || undefined,
      accessTokenExpiresAt: token.expiresAt,
      returnTo,
      createdAt: now,
      updatedAt: now,
    }, GOOGLE_DP_PENDING_TTL_SECONDS);
    return redirectWithHash(returnTo, "google_job", id, { "set-cookie": clearGoogleDpCookie() });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "google_callback_failed");
  }
}

async function handleGoogleDpJob(request: Request, env: Env, allowOrigin: string): Promise<Response> {
  if (!googleDpConfigured(env)) {
    return new Response(JSON.stringify({ error: "unconfigured" }), {
      status: 503,
      headers: jsonHeaders(allowOrigin),
    });
  }
  const url = new URL(request.url);
  const id = validGoogleJobId(url.searchParams.get("id"));
  if (!id) {
    return new Response(JSON.stringify({ error: "bad_id" }), {
      status: 400,
      headers: jsonHeaders(allowOrigin),
    });
  }
  const job = await getGoogleJob(env, id);
  if (!job) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: jsonHeaders(allowOrigin),
    });
  }
  if (job.stage === "ready") {
    return new Response(JSON.stringify({
      state: job.candidates?.length ? "complete" : "empty",
      candidates: job.candidates || [],
    }), { status: 200, headers: jsonHeaders(allowOrigin) });
  }
  if (job.stage === "failed") {
    return new Response(JSON.stringify({ state: "failed", error: job.error || "failed" }), {
      status: 200,
      headers: jsonHeaders(allowOrigin),
    });
  }

  let accessToken = clean(job.accessToken);
  let accessTokenExpiresAt = Number(job.accessTokenExpiresAt) || 0;
  if (job.refreshToken && accessTokenExpiresAt > 0 && Date.now() > accessTokenExpiresAt - 60_000) {
    const refreshed = await refreshGoogleToken(env, job.refreshToken);
    if (refreshed) {
      accessToken = refreshed.accessToken;
      accessTokenExpiresAt = refreshed.expiresAt;
      await putGoogleJob(env, id, { ...job, accessToken, accessTokenExpiresAt, updatedAt: new Date().toISOString() }, GOOGLE_DP_PENDING_TTL_SECONDS);
    }
  }
  if (!accessToken) {
    return new Response(JSON.stringify({ state: "failed", error: "missing_token" }), {
      status: 200,
      headers: jsonHeaders(allowOrigin),
    });
  }

  let resp = await fetchGoogleArchiveState(accessToken, job.archiveJobId);
  if (resp.status === 401 && job.refreshToken) {
    const refreshed = await refreshGoogleToken(env, job.refreshToken);
    if (refreshed) {
      accessToken = refreshed.accessToken;
      accessTokenExpiresAt = refreshed.expiresAt;
      resp = await fetchGoogleArchiveState(accessToken, job.archiveJobId);
      await putGoogleJob(env, id, { ...job, accessToken, accessTokenExpiresAt, updatedAt: new Date().toISOString() }, GOOGLE_DP_PENDING_TTL_SECONDS);
    }
  }
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const error = clean(data.error?.status || data.error) || "state_failed";
    await putGoogleJob(env, id, { ...job, stage: "failed", error, accessToken: undefined, refreshToken: undefined, updatedAt: new Date().toISOString() }, GOOGLE_DP_READY_TTL_SECONDS);
    return new Response(JSON.stringify({ state: "failed", error }), {
      status: 200,
      headers: jsonHeaders(allowOrigin),
    });
  }

  const state = clean(data.state).toUpperCase();
  if (state === "IN_PROGRESS" || state === "STATE_UNSPECIFIED" || !state) {
    return new Response(JSON.stringify({ state: "in_progress" }), {
      status: 200,
      headers: jsonHeaders(allowOrigin),
    });
  }
  if (state === "FAILED" || state === "CANCELLED") {
    await resetGoogleAuthorization(accessToken);
    await putGoogleJob(env, id, { ...job, stage: "failed", error: state.toLowerCase(), accessToken: undefined, refreshToken: undefined, updatedAt: new Date().toISOString() }, GOOGLE_DP_READY_TTL_SECONDS);
    return new Response(JSON.stringify({ state: "failed", error: state.toLowerCase() }), {
      status: 200,
      headers: jsonHeaders(allowOrigin),
    });
  }
  if (state !== "COMPLETE") {
    return new Response(JSON.stringify({ state: "in_progress" }), {
      status: 200,
      headers: jsonHeaders(allowOrigin),
    });
  }

  const urls = Array.isArray(data.urls) ? data.urls.map(clean).filter(Boolean) : [];
  const candidates = urls.length ? await downloadGoogleArchiveCandidates(urls) : [];
  await resetGoogleAuthorization(accessToken);
  await putGoogleJob(env, id, {
    ...job,
    stage: "ready",
    accessToken: undefined,
    refreshToken: undefined,
    accessTokenExpiresAt: undefined,
    candidates,
    updatedAt: new Date().toISOString(),
  }, GOOGLE_DP_READY_TTL_SECONDS);
  return new Response(JSON.stringify({
    state: candidates.length ? "complete" : "empty",
    candidates,
  }), { status: 200, headers: jsonHeaders(allowOrigin) });
}

async function handleGoogleDpAppend(
  request: Request,
  env: Env,
  allowOrigin: string,
  tpStub: DurableObjectStub
): Promise<Response> {
  if (!(await checkRateLimit(env.RATE_LIMIT_THIS_PERSON, "this-person:google-append"))) {
    return tooManyRequests(allowOrigin);
  }
  const text = await request.text();
  if (text.length > TP_LIMITS.MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "payload_too_large" }), {
      status: 413,
      headers: jsonHeaders(allowOrigin),
    });
  }
  let body: any = null;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    body = null;
  }
  const id = validGoogleJobId(body?.id);
  const selectedIds = Array.isArray(body?.candidateIds)
    ? body.candidateIds.map(clean).filter((x: string) => /^[A-Za-z0-9_-]{4,32}$/.test(x))
    : [];
  if (!id || selectedIds.length === 0) {
    return new Response(JSON.stringify({ error: "bad_body" }), {
      status: 400,
      headers: jsonHeaders(allowOrigin),
    });
  }
  const job = await getGoogleJob(env, id);
  if (!job || job.stage !== "ready" || !Array.isArray(job.candidates)) {
    return new Response(JSON.stringify({ error: "not_ready" }), {
      status: 409,
      headers: jsonHeaders(allowOrigin),
    });
  }
  const wanted = new Set(selectedIds);
  const selected = job.candidates.filter((candidate) => wanted.has(candidate.id));
  if (selected.length === 0) {
    return new Response(JSON.stringify({ error: "no_candidates" }), {
      status: 400,
      headers: jsonHeaders(allowOrigin),
    });
  }
  const built = buildGoogleDataPortabilityEntry(selected);
  if (built.claims.length === 0) {
    return new Response(JSON.stringify({ error: "no_claims" }), {
      status: 400,
      headers: jsonHeaders(allowOrigin),
    });
  }
  const person: TpPerson = {
    id: "0000",
    publicNumber: 0,
    source: "google_data_portability",
    status: "extracted_and_appended",
    platformHints: ["Google My Ad Center", "Google Data Portability"],
    fragments: built.fragments,
    claims: built.claims,
    generatedText: built.generatedText,
    extractionSummary: built.extractionSummary,
    appendedAtOrder: 0,
  };
  const inner = new URL(request.url);
  inner.pathname = "/append";
  const resp = await tpStub.fetch(
    new Request(inner.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ person }),
    })
  );
  const responseText = await resp.text();
  if (resp.ok) await deleteGoogleJob(env, id);
  return new Response(responseText, {
    status: resp.status,
    headers: jsonHeaders(allowOrigin),
  });
}

function parseGamSlotSizes(raw: string | undefined): [number, number][] {
  const text = (raw || "").trim();
  if (!text) return [[300, 250]];
  const out: [number, number][] = [];
  for (const part of text.split(",")) {
    const m = part.trim().match(/^(\d{2,4})x(\d{2,4})$/);
    if (!m) continue;
    out.push([Number(m[1]), Number(m[2])]);
    if (out.length >= 6) break;
  }
  return out.length ? out : [[300, 250]];
}

// ── GAM resolution helpers ──────────────────────────────────────────────────
// The client hands us a render record from slotRenderEnded with opaque
// numeric IDs. We resolve them to display names: cache-first via the Durable
// Object's gam_cache table, then fill the misses from the GAM REST API and
// write them back. Caller passes a single record per request; the wall draws
// stats from the same cache table.

interface GamCacheKey {
  kind: "advertiser" | "lineItem" | "order" | "creative";
  id: string;
}

function dedupeKeys(keys: GamCacheKey[]): GamCacheKey[] {
  const seen = new Set<string>();
  const out: GamCacheKey[] = [];
  for (const k of keys) {
    if (!k.id) continue;
    const key = k.kind + ":" + k.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

function gamKeysFromRecord(record: GamRenderRecord): GamCacheKey[] {
  const keys: GamCacheKey[] = [];
  if (record.advertiserId) keys.push({ kind: "advertiser", id: record.advertiserId });
  if (record.lineItemId) keys.push({ kind: "lineItem", id: record.lineItemId });
  if (record.orderId) keys.push({ kind: "order", id: record.orderId });
  if (record.creativeId) keys.push({ kind: "creative", id: record.creativeId });
  for (const id of record.companyIds || []) {
    if (id) keys.push({ kind: "advertiser", id: String(id) });
  }
  return dedupeKeys(keys);
}

async function gamCacheRead(
  tpStub: DurableObjectStub,
  requestUrl: string,
  keys: GamCacheKey[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (keys.length === 0) return result;
  const inner = new URL(requestUrl);
  inner.pathname = "/gam-cache-read";
  const resp = await tpStub.fetch(
    new Request(inner.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keys }),
    })
  );
  if (!resp.ok) return result;
  const data: any = await resp.json().catch(() => ({}));
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  for (const entry of entries) {
    const kind = String(entry?.kind || "");
    const id = String(entry?.id || "");
    const name = String(entry?.name || "");
    if (kind && id && name) result.set(kind + ":" + id, name);
  }
  return result;
}

async function gamCacheWrite(
  tpStub: DurableObjectStub,
  requestUrl: string,
  entries: { kind: string; id: string; name: string }[]
): Promise<void> {
  if (entries.length === 0) return;
  const inner = new URL(requestUrl);
  inner.pathname = "/gam-cache-write";
  await tpStub.fetch(
    new Request(inner.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries }),
    })
  );
}

async function resolveOneGamKey(
  account: GamServiceAccount,
  key: GamCacheKey
): Promise<{ name: string; extraOrderId?: string }> {
  switch (key.kind) {
    case "advertiser":
      return { name: await resolveAdvertiserName(account, key.id) };
    case "lineItem": {
      const li = await resolveLineItemName(account, key.id);
      return { name: li.name, extraOrderId: li.orderId };
    }
    case "order":
      return { name: await resolveOrderName(account, key.id) };
    case "creative":
      return { name: await resolveCreativeName(account, key.id) };
  }
}

// Resolves a set of IDs to display names. Cache-first; on miss, queries GAM
// and writes results back. Returns the resolved map shaped for the fragment
// builder. Swallows API errors per-key so one bad ID does not poison the
// whole record.
async function resolveGamRecord(
  env: Env,
  tpStub: DurableObjectStub,
  requestUrl: string,
  record: GamRenderRecord
): Promise<GamResolution> {
  const resolved: GamResolution = {
    advertisers: {},
    lineItems: {},
    orders: {},
    creatives: {},
  };
  if (!gamConfigured(env)) return resolved;
  const account = readGamServiceAccount(env);
  if (!account) return resolved;

  const keys = gamKeysFromRecord(record);
  if (keys.length === 0) return resolved;
  const cached = await gamCacheRead(tpStub, requestUrl, keys);
  const toWrite: { kind: string; id: string; name: string }[] = [];
  const extraOrderKeys: GamCacheKey[] = [];

  for (const key of keys) {
    const cacheKey = key.kind + ":" + key.id;
    let name = cached.get(cacheKey) || "";
    if (!name) {
      try {
        const resolvedKey = await resolveOneGamKey(account, key);
        name = resolvedKey.name;
        if (name) toWrite.push({ kind: key.kind, id: key.id, name });
        if (resolvedKey.extraOrderId && !record.orderId) {
          // Line items reference an order; pull that too so the order name
          // shows up even when the slot did not surface orderId directly.
          extraOrderKeys.push({ kind: "order", id: resolvedKey.extraOrderId });
        }
      } catch {
        name = "";
      }
    }
    if (!name) continue;
    if (key.kind === "advertiser") resolved.advertisers[key.id] = name;
    else if (key.kind === "lineItem") resolved.lineItems[key.id] = name;
    else if (key.kind === "order") resolved.orders[key.id] = name;
    else if (key.kind === "creative") resolved.creatives[key.id] = name;
  }

  if (extraOrderKeys.length > 0) {
    const cachedExtra = await gamCacheRead(tpStub, requestUrl, extraOrderKeys);
    for (const key of extraOrderKeys) {
      let name = cachedExtra.get(key.kind + ":" + key.id) || "";
      if (!name) {
        try {
          name = await resolveOrderName(account, key.id);
          if (name) toWrite.push({ kind: key.kind, id: key.id, name });
        } catch {
          name = "";
        }
      }
      if (name) resolved.orders[key.id] = name;
    }
  }

  if (toWrite.length > 0) await gamCacheWrite(tpStub, requestUrl, toWrite);
  return resolved;
}

function parseGamRenderRecord(value: unknown): GamRenderRecord | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const numericOrNull = (x: unknown): string | null => {
    if (x === null || x === undefined) return null;
    const s = String(x).trim();
    if (!s || !/^[0-9]{1,32}$/.test(s)) return null;
    return s;
  };
  const stringArray = (x: unknown, max: number): string[] => {
    if (!Array.isArray(x)) return [];
    const out: string[] = [];
    for (const item of x) {
      const s = String(item ?? "").trim().slice(0, 256);
      if (!s) continue;
      if (out.includes(s)) continue;
      out.push(s);
      if (out.length >= max) break;
    }
    return out;
  };
  const sizeRaw = v.size;
  let size: [number, number] | null = null;
  if (Array.isArray(sizeRaw) && sizeRaw.length === 2) {
    const w = Number(sizeRaw[0]);
    const h = Number(sizeRaw[1]);
    if (Number.isFinite(w) && Number.isFinite(h)) size = [w, h];
  }
  return {
    advertiserId: numericOrNull(v.advertiserId),
    campaignId: numericOrNull(v.campaignId),
    creativeId: numericOrNull(v.creativeId),
    lineItemId: numericOrNull(v.lineItemId),
    orderId: numericOrNull(v.orderId),
    yieldGroupIds: stringArray(v.yieldGroupIds, 6),
    companyIds: stringArray(v.companyIds, 8),
    size,
    iframeUrl: typeof v.iframeUrl === "string" ? v.iframeUrl.slice(0, 1024) : null,
    thirdPartyHosts: stringArray(v.thirdPartyHosts, 12),
    isEmpty: v.isEmpty === true,
    serviceName: typeof v.serviceName === "string" ? v.serviceName.slice(0, 60) : null,
  };
}

async function handleThisPersonGamResolve(
  request: Request,
  env: Env,
  allowOrigin: string,
  tpStub: DurableObjectStub
): Promise<Response> {
  if (!(await checkRateLimit(env.RATE_LIMIT_THIS_PERSON, "this-person:gam-resolve"))) {
    return tooManyRequests(allowOrigin);
  }
  if (!gamConfigured(env)) {
    return new Response(JSON.stringify({ error: "gam_unconfigured" }), {
      status: 503,
      headers: jsonHeaders(allowOrigin),
    });
  }
  const text = await request.text();
  if (text.length > 2048) {
    return new Response(JSON.stringify({ error: "payload_too_large" }), {
      status: 413,
      headers: jsonHeaders(allowOrigin),
    });
  }
  let body: any = null;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    body = null;
  }
  const record = parseGamRenderRecord(body?.adRender);
  if (!record) {
    return new Response(JSON.stringify({ error: "bad_record" }), {
      status: 400,
      headers: jsonHeaders(allowOrigin),
    });
  }
  let resolved: GamResolution;
  try {
    resolved = await resolveGamRecord(env, tpStub, request.url, record);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "gam_resolution_failed", detail: (err as Error)?.message || "" }),
      { status: 502, headers: jsonHeaders(allowOrigin) }
    );
  }
  return new Response(JSON.stringify({ resolved }), {
    status: 200,
    headers: jsonHeaders(allowOrigin),
  });
}

// "this person" web-signals append.
//
// The browser-side collector reads Topics + client hints + fingerprint + fires
// the ad-tech tags, then hands us the substrate as ExtractedFragments. We do
// not trust the client to write the claim sentences — generateClaims rebuilds
// them server-side from the validated fragment list.
async function handleThisPersonWebSignalsAppend(
  request: Request,
  env: Env,
  allowOrigin: string,
  tpStub: DurableObjectStub
): Promise<Response> {
  if (!(await checkRateLimit(env.RATE_LIMIT_THIS_PERSON, "this-person:web-signals-append"))) {
    return tooManyRequests(allowOrigin);
  }
  const text = await request.text();
  if (text.length > TP_LIMITS.MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "payload_too_large" }), {
      status: 413,
      headers: jsonHeaders(allowOrigin),
    });
  }
  let body: any = null;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    body = null;
  }
  // The web-signals surface is its own enumerated source. Lock it in: the
  // client cannot relabel itself as Google Data Portability.
  if (body && typeof body === "object") body.source = "ad_preferences_surface";

  // Pull the GAM ad-render record off the body before validation so the
  // generic append parser does not have to know about it.
  const adRenderRaw = body && typeof body === "object" ? (body as any).adRender : null;
  if (body && typeof body === "object") delete (body as any).adRender;

  const parsed = parseTpAppendRequest(body);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: jsonHeaders(allowOrigin),
    });
  }
  const { source, platformHints, fragments, seed } = parsed.data;

  // GAM enrichment: resolve advertiser/order/line item/creative names from
  // the slotRenderEnded record, then merge those into the validated fragments
  // so the claim generator can produce "this person likes Patagonia"-style
  // sentences alongside the device + topics fragments.
  let gamFragments: TpFragment[] = [];
  const adRender = parseGamRenderRecord(adRenderRaw);
  if (adRender) {
    try {
      const resolved = await resolveGamRecord(env, tpStub, request.url, adRender);
      gamFragments = buildGamFragments(adRender, resolved);
    } catch {
      gamFragments = [];
    }
  }
  const allFragments: TpFragment[] = [...fragments, ...gamFragments].slice(
    0,
    TP_LIMITS.MAX_FRAGMENTS
  );

  const generated = generateTpClaims({
    source,
    platformHints,
    fragments: allFragments,
    seed,
  });
  if (generated.claims.length === 0) {
    return new Response(JSON.stringify({ error: "no_claims" }), {
      status: 400,
      headers: jsonHeaders(allowOrigin),
    });
  }
  const person: TpPerson = {
    id: "0000",
    publicNumber: 0,
    source,
    status: "extracted_and_appended",
    platformHints,
    fragments: allFragments,
    claims: generated.claims,
    generatedText: generated.generatedText,
    extractionSummary: generated.extractionSummary,
    appendedAtOrder: 0,
  };
  const inner = new URL(request.url);
  inner.pathname = "/append";
  const resp = await tpStub.fetch(
    new Request(inner.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ person }),
    })
  );
  return new Response(await resp.text(), {
    status: resp.status,
    headers: jsonHeaders(allowOrigin),
  });
}

function clientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function isValidContactEmail(value: unknown): boolean {
  const email = clean(value);
  if (!CONTACT_EMAIL_REGEX.test(email)) return false;
  const lowered = email.toLowerCase();
  const local = lowered.split("@")[0] || "";
  const domain = lowered.split("@")[1] || "";
  if (CONTACT_BLOCKED_LOCAL_PARTS.has(local)) return false;
  if (CONTACT_BLOCKED_DOMAINS.has(domain)) return false;
  if (domain.startsWith("example.") || domain.startsWith("test.")) return false;
  return true;
}

function parseContactSubmission(body: any): { ok: true; data: ContactSubmission } | { ok: false; error: string } {
  const name = clean(body?.name).slice(0, 120);
  const email = clean(body?.email).slice(0, 254);
  const subject = clean(body?.subject).slice(0, 180);
  const message = clean(body?.message).slice(0, 4000);
  const requestedTopic = clean(body?.topic).toLowerCase();
  const topic = CONTACT_ALLOWED_TOPICS.has(requestedTopic) ? requestedTopic : "other";
  const timeSensitive = clean(body?.time_sensitive).toLowerCase() === "yes" || body?.time_sensitive === true;
  const token =
    clean(body?.turnstileToken || body?.["cf-turnstile-response"]).slice(0, 2048);

  if (!name || !email || !subject || !message) {
    return { ok: false, error: "missing_required_fields" };
  }

  if (!isValidContactEmail(email)) {
    return { ok: false, error: "invalid_email" };
  }

  if (!token) {
    return { ok: false, error: "missing_turnstile_token" };
  }

  return {
    ok: true,
    data: {
      name,
      email,
      subject,
      topic,
      timeSensitive,
      message,
      turnstileToken: token,
    },
  };
}

function resolveTurnstileSecret(env: Env, request: Request): string {
  const configured = clean(env.TURNSTILE_SECRET_KEY);
  if (configured) return configured;

  const host = clean(new URL(request.url).hostname).toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  return isLocalHost ? TURNSTILE_TEST_SECRET_KEY : "";
}

function allowedTurnstileHostnames(env: Env): Set<string> {
  const raw = clean(env.TURNSTILE_ALLOWED_HOSTNAMES || "cbassuarez.com,www.cbassuarez.com");
  const parts = raw
    .split(",")
    .map((host) => clean(host).toLowerCase())
    .filter(Boolean);
  return new Set(parts);
}

async function verifyTurnstileToken(
  token: string,
  secret: string,
  remoteIp: string
): Promise<{ success: boolean; errorCodes: string[]; hostname: string; action: string }> {
  const payload = new URLSearchParams();
  payload.set("secret", secret);
  payload.set("response", token);
  if (remoteIp && remoteIp !== "unknown") {
    payload.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: payload.toString(),
    });

    const parsed: any = await response.json().catch(() => ({}));
    const errorCodes = Array.isArray(parsed?.["error-codes"])
      ? parsed["error-codes"].map((code: unknown) => clean(code)).filter(Boolean)
      : [];
    const hostname = clean(parsed?.hostname || "").toLowerCase();
    const action = clean(parsed?.action || "");

    if (!response.ok) {
      return {
        success: false,
        errorCodes: errorCodes.length ? errorCodes : [`siteverify_http_${response.status}`],
        hostname,
        action,
      };
    }

    return { success: Boolean(parsed?.success), errorCodes, hostname, action };
  } catch {
    return { success: false, errorCodes: ["siteverify_network_error"], hostname: "", action: "" };
  }
}

const CONTACT_FORMSPREE_DEFAULT_ENDPOINT = "https://formspree.io/f/mjkepaeo";

async function deliverContactEmail(
  env: Env,
  payload: ContactSubmission,
  receivedAt: string
): Promise<{ ok: boolean; error: string | null; messageId: string | null }> {
  const endpoint = clean(env.CONTACT_FORMSPREE_ENDPOINT || CONTACT_FORMSPREE_DEFAULT_ENDPOINT);
  if (!endpoint) {
    return { ok: false, error: "formspree_endpoint_unconfigured", messageId: null };
  }

  const body = {
    name: payload.name,
    email: payload.email,
    _replyto: payload.email,
    _subject: `[contact] ${payload.subject}`,
    subject: payload.subject,
    topic: payload.topic,
    time_sensitive: payload.timeSensitive ? "yes" : "no",
    received_at: receivedAt,
    message: payload.message,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    let parsed: any = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    if (!response.ok || parsed?.ok === false) {
      const errors = Array.isArray(parsed?.errors)
        ? parsed.errors.map((e: any) => clean(e?.message || e?.code || "")).filter(Boolean).join("; ")
        : "";
      const detail = errors || clean(parsed?.error) || `formspree_status_${response.status}`;
      return { ok: false, error: short(detail, 220), messageId: null };
    }

    const id = clean(parsed?.id || parsed?.next || "");
    return { ok: true, error: null, messageId: id || null };
  } catch (error: any) {
    const message = clean(error?.message || "formspree_network_error");
    return { ok: false, error: short(message, 220), messageId: null };
  }
}

async function handleFeedRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  allowOrigin: string
): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(FEED_MAX_ITEMS, Number(url.searchParams.get("limit")) || 24));

  const cacheUrl = new URL(request.url);
  cacheUrl.search = `?limit=${limit}`;
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set("access-control-allow-origin", allowOrigin);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  let snapshot = await readFeedSnapshot(env);
  if (!snapshot) {
    snapshot = { items: [], sources: {}, generatedAt: new Date().toISOString() };
    ctx.waitUntil(
      (async () => {
        try {
          const built = await buildFeedSnapshot(env);
          await persistFeedSnapshot(env, built);
        } catch {
          // surfaces in observability logs
        }
      })()
    );
  }

  const body = JSON.stringify(
    {
      items: snapshot.items.slice(0, limit),
      sources: snapshot.sources,
      currentActivity: selectCurrentActivity(snapshot.items),
      generatedAt: snapshot.generatedAt,
    },
    null,
    2
  );

  if (snapshot.items.length > 0) {
    const cacheable = new Response(body, {
      status: 200,
      headers: {
        ...jsonHeaders(allowOrigin),
        "cache-control": `public, s-maxage=${FEED_EDGE_CACHE_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
  }

  return new Response(body, { status: 200, headers: jsonHeaders(allowOrigin) });
}

// ---------- CLI surface (curl, wget, httpie, ...) ----------

const CLI_USER_AGENT_REGEX = /^(curl|wget|HTTPie|httpie|aria2|powershell|fetch|node-fetch|go-http-client|libwww-perl|python-requests|python-urllib)\b/i;
const CLI_LETTER_FALLBACK = `hello.

this is cbassuarez.com from the command line.
i'm seb. i make cybernetic music systems.

the live surfaces:
  /labs/string    a shared string instrument
  /labs/repl      a live-coding repl in score-grid notation
  /labs/feed      everything i did online today
  /labs/guestbook a place to leave a small mark

the offline ones:
  let go / letting go · THE TUB · String · Praetorius

if you want to talk:  contact@cbassuarez.com
if you want to read:  this came from /humans.txt

curl /feed       see what's happening today
curl /string     /labs/string state
curl /room       /404 anteroom state
curl /works      list of works
curl /version    build label
curl /contact    how to reach me
curl /repl       what /labs/repl is + ssh-render usage

ssh ssh.cbassuarez.com repl < patch.txt | mpv -    actually plays the patch

— seb
`;

type CliPath =
  | "letter"
  | "feed"
  | "string"
  | "room"
  | "works"
  | "contact"
  | "version"
  | "humans"
  | "repl";

const CLI_PATH_MAP: Record<string, CliPath | undefined> = {
  "/": "letter",
  "/cli": "letter",
  "/cli/": "letter",
  "/cli/feed": "feed",
  "/cli/string": "string",
  "/cli/room": "room",
  "/cli/works": "works",
  "/cli/contact": "contact",
  "/cli/version": "version",
  "/cli/humans": "humans",
  "/cli/repl": "repl",
  "/feed": "feed",
  "/string": "string",
  "/room": "room",
  "/works": "works",
  "/contact": "contact",
  "/version": "version",
  "/repl": "repl",
};

function isCliClient(request: Request): boolean {
  const ua = clean(request.headers.get("user-agent") || "");
  if (CLI_USER_AGENT_REGEX.test(ua)) return true;
  const accept = clean(request.headers.get("accept") || "");
  if (accept && accept.includes("text/plain") && !accept.includes("text/html")) {
    return true;
  }
  return false;
}

function classifyCliPath(pathname: string): CliPath | null {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  return CLI_PATH_MAP[trimmed] ?? null;
}

function cliTextResponse(body: string, status = 200): Response {
  return new Response(body.endsWith("\n") ? body : body + "\n", {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      link: DISCOVERY_LINK_HEADER,
    },
  });
}

function buildCliFooter(): string {
  return [
    "",
    "—",
    "more at https://cbassuarez.com  ·  signed at /humans.txt",
    "",
  ].join("\n");
}

async function fetchCliLetter(request: Request): Promise<string> {
  // Try fetching the canonical letter from the deployed site, fall back to
  // the inline copy when the site is unreachable (e.g. local dev, transient
  // outage). The fetch is best-effort and never blocks the response.
  try {
    const origin = new URL(request.url);
    origin.pathname = "/.well-known/cli-letter.txt";
    origin.search = "";
    // Hit the canonical apex if available; fall back to the worker's own URL.
    const candidates = [
      `https://cbassuarez.com/.well-known/cli-letter.txt`,
      origin.toString(),
    ];
    for (const candidate of candidates) {
      try {
        const r = await fetch(candidate, {
          headers: { accept: "text/plain" },
          cf: { cacheTtl: 60, cacheEverything: true },
        } as RequestInit);
        if (r.ok) {
          const text = await r.text();
          const trimmed = text.trim();
          if (trimmed.length > 0) return text;
        }
      } catch {
        // try next
      }
    }
  } catch {
    // fall through to inline fallback
  }
  return CLI_LETTER_FALLBACK;
}

function formatCliRelative(at: string, nowMs: number): string {
  const t = parseFeedTimeMs(at);
  if (!t) return "";
  const diffMs = Math.max(0, nowMs - t);
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

async function renderCliFeed(env: Env, allowOrigin: string): Promise<string> {
  const snapshot = await readFeedSnapshot(env);
  const items = (snapshot?.items || []).slice(0, 6);
  const now = Date.now();
  const lines = ["the feed says, today:"];
  if (items.length === 0) {
    lines.push("");
    lines.push("  (the feed is quiet right now.)");
  } else {
    for (const item of items) {
      const src = sourceBase(item.source).padEnd(8, " ");
      const when = formatCliRelative(item.at, now).padEnd(8, " ");
      const text = short(item.text, 88);
      lines.push(`  · ${when} ${src} ${text}`);
    }
  }
  lines.push("");
  lines.push("more at https://cbassuarez.com/labs/feed");
  return lines.join("\n");
}

function formatCliDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h${String(rm).padStart(2, "0")}m`;
  }
  return `${String(m).padStart(2, "0")}m${String(r).padStart(2, "0")}s`;
}

async function renderCliRoom(env: Env): Promise<string> {
  if (!env.CO_ROOM) return "the /404 anteroom is not configured here.\n";
  try {
    const id = env.CO_ROOM.idFromName(COROOM_NAME);
    const stub = env.CO_ROOM.get(id);
    const r = await stub.fetch(new Request("https://internal/snapshot", { method: "GET" }));
    if (!r.ok) {
      return "the /404 anteroom is unreachable right now.\n";
    }
    const data: any = await r.json().catch(() => null);
    if (!data) return "the /404 anteroom returned no state.\n";
    const count = Number(data.count) || 0;
    const log = Array.isArray(data.log) ? data.log : [];
    if (data.currentInstance && count >= 2) {
      const startedAt = Number(data.currentInstance.startedAt) || 0;
      const dur = formatCliDuration(Math.max(0, Date.now() - startedAt));
      const peak = Number(data.currentInstance.peak) || count;
      const members = Array.isArray(data.currentInstance.members) ? data.currentInstance.members : [];
      const places = members
        .map((m: any) => clean(m?.location || ""))
        .filter((p: string) => p.length > 0);
      const placeLine = places.length > 0 ? `they are connecting from ${places.join(", ")}.` : "";
      return [
        `the /404 anteroom is open right now.`,
        `${count} people are present (peak ${peak}); the instance has been open ${dur}.`,
        placeLine,
        ``,
        `wander toward https://cbassuarez.com/this-does-not-exist if you want to join.`,
        ``,
      ].filter(Boolean).join("\n") + "\n";
    }
    const last = log[0];
    if (!last) {
      return [
        "the /404 anteroom has never opened. it opens when two strangers are",
        "simultaneously asking the site for a page that doesn't exist.",
        "",
        "wander toward https://cbassuarez.com/this-does-not-exist if you want to try.",
        "",
      ].join("\n");
    }
    const dur = formatCliDuration(Number(last.durationMs) || 0);
    const ago = formatCliRelative(new Date(last.endedAt || 0).toISOString(), Date.now());
    const peak = Number(last.peak) || 0;
    const places = Array.isArray(last.members)
      ? last.members.map((m: any) => clean(m?.location || "")).filter((p: string) => p.length > 0)
      : [];
    const placeLine = places.length > 0 ? `they were from ${places.join(", ")}.` : "";
    return [
      `the /404 anteroom is currently closed.`,
      `it last opened ${ago} for ${dur}, with ${peak} ${peak === 1 ? "person" : "people"}.`,
      placeLine,
      ``,
      `wander toward https://cbassuarez.com/this-does-not-exist if you want to try.`,
      ``,
    ].filter(Boolean).join("\n") + "\n";
  } catch {
    return "the /404 anteroom is unreachable right now.\n";
  }
}

async function renderCliString(env: Env): Promise<string> {
  // The string lab's state lives only inside the StringRoom DO; surface a
  // tiny prose summary by hitting it (or fall back to a static blurb).
  // We don't add a /snapshot path to StringRoom in this pass — keep the
  // CLI text purely descriptive.
  return [
    "the string lab is a shared instrument that lives in your browser.",
    "every visitor plays one string; every pluck travels outward and",
    "returns as sympathetic sound from other strings nearby.",
    "",
    "pluck it yourself at https://cbassuarez.com/labs/string.",
    "",
  ].join("\n");
}

function renderCliWorks(): string {
  return [
    "the offline works:",
    "",
    "  · let go / letting go    cybernetic performance, ongoing.",
    "  · THE TUB                installation + sonic sculpture.",
    "  · String                 cybernetic strings, multi-visitor.",
    "  · Praetorius             prepared instruments + live system.",
    "",
    "the online (live) ones:",
    "",
    "  · /labs/string           shared string instrument.",
    "  · /labs/repl             live-coding repl in score-grid notation.",
    "  · /labs/feed             a feed of what i did online today.",
    "  · /labs/guestbook        a place to leave a small mark.",
    "  · /404 (anteroom)        opens only when two strangers are",
    "                           simultaneously on a page that doesn't exist.",
    "",
    "more at https://cbassuarez.com/works",
    "",
  ].join("\n");
}

function renderCliRepl(): string {
  return [
    "/labs/repl — a live-coding piece in score-grid notation, powered by",
    "             the cbassuarez voices. it runs in two places:",
    "",
    "  in your browser, at https://cbassuarez.com/labs/repl",
    "    — the canonical surface. live transport viz, sample browser,",
    "      hot-reload on Cmd-Enter, share-by-URL.",
    "",
    "  from your shell, over ssh — same patches, same DSL, rendered to a",
    "  WAV stream you pipe into a local audio player:",
    "",
    "    ssh ssh.cbassuarez.com repl < patch.txt | mpv -",
    "    ssh ssh.cbassuarez.com repl < patch.txt | ffplay -nodisp -autoexit -",
    "    ssh ssh.cbassuarez.com repl < patch.txt | sox -t wav - -d",
    "    ssh ssh.cbassuarez.com repl v1.<hash>   | mpv -",
    "    ssh ssh.cbassuarez.com repl --help",
    "",
    "the language at a glance:",
    "",
    "  tempo 110",
    "  meter 4/4",
    "",
    "  string  A3  C4  E4  G4    | A3  C4  E4  ~",
    "  force   f   mf  p   f     | ff  mf  p   p",
    "  decay   4",
    "  crush   8",
    "",
    "  string  .   .   .   D3",
    "  every   4 bars",
    "  pan     left",
    "",
    "  sample  snm-*&30  .  .  .",
    "  every   2 bars",
    "",
    "slot tokens:  notes (A3, C#4, Bb2), '.' (rest), '~' (sustain), or a",
    "              sample id from the bank.",
    "groups:       (a b c) subdivides one slot's time.",
    "selectors:    bank-* (random per fire), bank-*! (frozen),",
    "              bank-*&N (gradient), a/b (union of pools).",
    "",
    "sample bank — 300 one-shots, mirrored from /labs/chunk-surfer:",
    "  main_b3        b3-01 .. b3-64       (64)",
    "  THE TUB        tub-xither-forge ..  (44)",
    "  amplifications amp-001 .. amp-064   (64)",
    "  soundnoisemusic snm-001 .. snm-064  (64)",
    "  lux_nova       lux-001 .. lux-064   (64)",
    "",
    "more at https://cbassuarez.com/labs/repl",
    "",
  ].join("\n");
}

function renderCliContact(): string {
  return [
    "to reach me:",
    "",
    "  email      contact@cbassuarez.com",
    "  form       https://cbassuarez.com/contact",
    "  github     https://github.com/cbassuarez",
    "  bandcamp   https://cbassuarez.bandcamp.com",
    "",
    "i read every email. i answer most of them.",
    "",
    "— seb",
    "",
  ].join("\n");
}

async function renderCliVersion(env: Env): Promise<string> {
  if (!env.HITS_KV) return "build label is not available right now.\n";
  let manifest: any = null;
  try {
    const r = await fetch("https://cbassuarez.com/version.json", {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 60 } as any,
    });
    if (r.ok) manifest = await r.json().catch(() => null);
  } catch {
    manifest = null;
  }
  if (!manifest || !manifest.sha) {
    return "the live build manifest is unreachable right now.\n";
  }
  const shortSha = clean(manifest.shortSha || String(manifest.sha).slice(0, 7));
  const at = clean(manifest.at).slice(0, 19).replace("T", " ");
  const subjects = Array.isArray(manifest.subjects) ? manifest.subjects : [];
  const lines = [
    `build · ${shortSha} · ${at} UTC`,
    "",
  ];
  if (subjects.length > 0) {
    lines.push("recent work:");
    for (const s of subjects.slice(0, 8)) {
      const trimmed = clean(s);
      if (trimmed) lines.push(`  · ${trimmed}`);
    }
    lines.push("");
  }
  lines.push("more at https://cbassuarez.com/colophon");
  lines.push("");
  return lines.join("\n");
}

async function renderCliHumans(request: Request): Promise<string> {
  try {
    const r = await fetch("https://cbassuarez.com/humans.txt", {
      headers: { accept: "text/plain" },
      cf: { cacheTtl: 60 } as any,
    });
    if (r.ok) return await r.text();
  } catch {
    // ignore
  }
  return "humans.txt is unavailable right now.\n";
}

async function handleCliRequest(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  const kind = classifyCliPath(url.pathname);
  if (!kind) {
    const lines = [
      `cbassuarez.com · cli`,
      ``,
      `no such path: ${url.pathname}`,
      ``,
      `try: /, /feed, /string, /room, /works, /contact, /version`,
      ``,
    ];
    return cliTextResponse(lines.join("\n"), 404);
  }
  switch (kind) {
    case "letter": {
      const letter = await fetchCliLetter(request);
      return cliTextResponse(letter);
    }
    case "feed": {
      const body = await renderCliFeed(env, "*");
      return cliTextResponse(body + buildCliFooter());
    }
    case "string": {
      const body = await renderCliString(env);
      return cliTextResponse(body + buildCliFooter());
    }
    case "room": {
      const body = await renderCliRoom(env);
      return cliTextResponse(body + buildCliFooter());
    }
    case "works": {
      return cliTextResponse(renderCliWorks() + buildCliFooter());
    }
    case "contact": {
      return cliTextResponse(renderCliContact() + buildCliFooter());
    }
    case "version": {
      const body = await renderCliVersion(env);
      return cliTextResponse(body + buildCliFooter());
    }
    case "humans": {
      const body = await renderCliHumans(request);
      return cliTextResponse(body);
    }
    case "repl": {
      return cliTextResponse(renderCliRepl() + buildCliFooter());
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const allowOrigin = env.FEED_ALLOW_ORIGIN || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: jsonHeaders(allowOrigin) });
    }

    // CLI surface: catch curl/wget/httpie at the top, before any API routes,
    // so `curl <worker>/feed` and `curl <worker>/cli/feed` both serve text.
    // Two ways to opt in:
    //   1. The path is under /cli (explicit namespace) — always serve text.
    //   2. The User-Agent looks CLI-shaped — serve text on the short paths.
    // /api/* paths are explicitly NOT considered CLI paths so existing JSON
    // contracts are preserved.
    if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
      const cliKind = classifyCliPath(url.pathname);
      const explicitCliPath = url.pathname === "/cli" || url.pathname.startsWith("/cli/");
      if (cliKind && (explicitCliPath || isCliClient(request))) {
        return handleCliRequest(request, env, url);
      }
    }

    if (url.pathname === "/api/feed") {
      if (!(await checkRateLimit(env.RATE_LIMIT_FEED, clientKey(request)))) {
        return tooManyRequests(allowOrigin);
      }
      return handleFeedRequest(request, env, ctx, allowOrigin);
    }

    if (url.pathname === "/api/hit") {
      if (!(await checkRateLimit(env.RATE_LIMIT_HIT, clientKey(request)))) {
        return tooManyRequests(allowOrigin);
      }
      try {
        const value = await incrementHitCount(env);
        return new Response(JSON.stringify({ value, at: new Date().toISOString() }), {
          status: 200,
          headers: jsonHeaders(allowOrigin),
        });
      } catch (error: any) {
        return new Response(
          JSON.stringify({ error: clean(error?.message || "hit_count_failed"), at: new Date().toISOString() }),
          {
            status: 502,
            headers: jsonHeaders(allowOrigin),
          }
        );
      }
    }

    if (url.pathname === "/api/guestbook") {
      if (request.method === "GET") {
        try {
          const rawLimit = Number(url.searchParams.get("limit"));
          const hasLimit = Number.isFinite(rawLimit) && rawLimit > 0;
          const limit = hasLimit ? Math.max(1, Math.min(5000, Math.floor(rawLimit))) : null;
          const entries = await readGuestbookEntries(env);
          const selected = limit ? entries.slice(0, limit) : entries;
          return new Response(JSON.stringify({ entries: selected, at: new Date().toISOString() }), {
            status: 200,
            headers: jsonHeaders(allowOrigin),
          });
        } catch (error: any) {
          return new Response(
            JSON.stringify({ error: clean(error?.message || "guestbook_read_failed"), at: new Date().toISOString() }),
            {
              status: 502,
              headers: jsonHeaders(allowOrigin),
            }
          );
        }
      }

      if (request.method === "POST") {
        if (!(await checkRateLimit(env.RATE_LIMIT_GUESTBOOK_POST, clientKey(request)))) {
          return tooManyRequests(allowOrigin);
        }
        try {
          const signerIp = clientKey(request);
          if (await hasGuestbookSignature(env, signerIp)) {
            return new Response(
              JSON.stringify({ error: "already_signed", at: new Date().toISOString() }),
              { status: 409, headers: jsonHeaders(allowOrigin) }
            );
          }

          const body: any = await request.json();
          const name = clean(body?.name || "anonymous").slice(0, 48) || "anonymous";
          const message = clean(body?.message || "").slice(0, 280);

          if (!message) {
            return new Response(JSON.stringify({ error: "message_required", at: new Date().toISOString() }), {
              status: 400,
              headers: jsonHeaders(allowOrigin),
            });
          }

          const entries = await readGuestbookEntries(env);
          const next: GuestbookEntry[] = [{ name, message, at: new Date().toISOString() }, ...entries];
          await writeGuestbookEntries(env, next);
          await recordGuestbookSignature(env, signerIp);

          return new Response(JSON.stringify({ ok: true, entries: next, at: new Date().toISOString() }), {
            status: 200,
            headers: jsonHeaders(allowOrigin),
          });
        } catch (error: any) {
          return new Response(
            JSON.stringify({ error: clean(error?.message || "guestbook_write_failed"), at: new Date().toISOString() }),
            {
              status: 502,
              headers: jsonHeaders(allowOrigin),
            }
          );
        }
      }

      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: jsonHeaders(allowOrigin),
      });
    }

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: jsonHeaders(allowOrigin),
        });
      }
      if (!(await checkRateLimit(env.RATE_LIMIT_CONTACT_POST, clientKey(request)))) {
        return tooManyRequests(allowOrigin);
      }

      try {
        const body: any = await request.json().catch(() => ({}));
        if (clean(body?._gotcha || body?.gotcha)) {
          return new Response(JSON.stringify({ ok: true, at: new Date().toISOString() }), {
            status: 200,
            headers: jsonHeaders(allowOrigin),
          });
        }

        const parsed = parseContactSubmission(body);
        if (!parsed.ok) {
          return new Response(JSON.stringify({ error: parsed.error, at: new Date().toISOString() }), {
            status: 400,
            headers: jsonHeaders(allowOrigin),
          });
        }

        const turnstileSecret = resolveTurnstileSecret(env, request);
        if (!turnstileSecret) {
          return new Response(JSON.stringify({ error: "turnstile_unconfigured", at: new Date().toISOString() }), {
            status: 503,
            headers: jsonHeaders(allowOrigin),
          });
        }

        const verification = await verifyTurnstileToken(
          parsed.data.turnstileToken,
          turnstileSecret,
          clientKey(request)
        );
        if (!verification.success) {
          return new Response(
            JSON.stringify({
              error: "turnstile_failed",
              details: verification.errorCodes,
              at: new Date().toISOString(),
            }),
            { status: 403, headers: jsonHeaders(allowOrigin) }
          );
        }

        const allowedHosts = allowedTurnstileHostnames(env);
        if (allowedHosts.size > 0 && !allowedHosts.has(verification.hostname)) {
          return new Response(
            JSON.stringify({
              error: "turnstile_bad_hostname",
              hostname: verification.hostname || null,
              at: new Date().toISOString(),
            }),
            { status: 403, headers: jsonHeaders(allowOrigin) }
          );
        }

        if (verification.action && verification.action !== CONTACT_TURNSTILE_ACTION) {
          return new Response(
            JSON.stringify({
              error: "turnstile_bad_action",
              action: verification.action,
              at: new Date().toISOString(),
            }),
            { status: 403, headers: jsonHeaders(allowOrigin) }
          );
        }

        const at = new Date().toISOString();
        const delivered = await deliverContactEmail(env, parsed.data, at);
        if (!delivered.ok) {
          return new Response(
            JSON.stringify({
              error: "contact_delivery_failed",
              detail: delivered.error,
              at,
            }),
            { status: 502, headers: jsonHeaders(allowOrigin) }
          );
        }

        return new Response(JSON.stringify({
          ok: true,
          relayed: true,
          messageId: delivered.messageId,
          at,
        }), {
          status: 200,
          headers: jsonHeaders(allowOrigin),
        });
      } catch (error: any) {
        return new Response(
          JSON.stringify({ error: clean(error?.message || "contact_submit_failed"), at: new Date().toISOString() }),
          { status: 502, headers: jsonHeaders(allowOrigin) }
        );
      }
    }

    if (url.pathname === "/api/contact-config") {
      if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: jsonHeaders(allowOrigin),
        });
      }

      const siteKey = clean(env.TURNSTILE_SITE_KEY || "");
      return new Response(
        JSON.stringify({
          turnstileSiteKey: siteKey || null,
          at: new Date().toISOString(),
        }),
        { status: 200, headers: jsonHeaders(allowOrigin) }
      );
    }

    if (url.pathname === "/api/string/socket") {
      const upgrade = request.headers.get("upgrade") || "";
      if (upgrade.toLowerCase() !== "websocket") {
        return new Response(JSON.stringify({ error: "expected_websocket_upgrade" }), {
          status: 426,
          headers: jsonHeaders(allowOrigin),
        });
      }
      if (!env.STRING_ROOM) {
        return new Response(JSON.stringify({ error: "string_room_unconfigured" }), {
          status: 503,
          headers: jsonHeaders(allowOrigin),
        });
      }
      if (!(await checkRateLimit(env.RATE_LIMIT_STRING_SOCKET, clientKey(request)))) {
        return tooManyRequests(allowOrigin);
      }
      const id = env.STRING_ROOM.idFromName(STRING_ROOM_NAME);
      const stub = env.STRING_ROOM.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === "/api/coroom/socket") {
      const upgrade = request.headers.get("upgrade") || "";
      if (upgrade.toLowerCase() !== "websocket") {
        return new Response(JSON.stringify({ error: "expected_websocket_upgrade" }), {
          status: 426,
          headers: jsonHeaders(allowOrigin),
        });
      }
      if (!env.CO_ROOM) {
        return new Response(JSON.stringify({ error: "coroom_unconfigured" }), {
          status: 503,
          headers: jsonHeaders(allowOrigin),
        });
      }
      if (!(await checkRateLimit(env.RATE_LIMIT_COROOM_SOCKET, clientKey(request)))) {
        return tooManyRequests(allowOrigin);
      }
      const id = env.CO_ROOM.idFromName(COROOM_NAME);
      const stub = env.CO_ROOM.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === "/api/coroom/snapshot") {
      if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: jsonHeaders(allowOrigin),
        });
      }
      if (!env.CO_ROOM) {
        return new Response(JSON.stringify({ error: "coroom_unconfigured" }), {
          status: 503,
          headers: jsonHeaders(allowOrigin),
        });
      }
      const id = env.CO_ROOM.idFromName(COROOM_NAME);
      const stub = env.CO_ROOM.get(id);
      const snapshotUrl = new URL(request.url);
      snapshotUrl.pathname = "/snapshot";
      const doRequest = new Request(snapshotUrl.toString(), { method: "GET" });
      const response = await stub.fetch(doRequest);
      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: jsonHeaders(allowOrigin),
      });
    }

    if (url.pathname === "/api/corpus/socket") {
      if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
        return new Response(JSON.stringify({ error: "expected_websocket_upgrade" }), {
          status: 426,
          headers: jsonHeaders(allowOrigin),
        });
      }
      if (!env.BFV_ROOM) {
        return new Response(JSON.stringify({ error: "bfv_unconfigured" }), {
          status: 503,
          headers: jsonHeaders(allowOrigin),
        });
      }
      if (!(await checkRateLimit(env.RATE_LIMIT_BFV_SOCKET, clientKey(request)))) {
        return tooManyRequests(allowOrigin);
      }
      const id = env.BFV_ROOM.idFromName(BFV_ROOM_NAME);
      const stub = env.BFV_ROOM.get(id);
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/corpus/")) {
      if (!env.BFV_ROOM) {
        return new Response(JSON.stringify({ error: "bfv_unconfigured" }), {
          status: 503,
          headers: jsonHeaders(allowOrigin),
        });
      }
      const sub = url.pathname.slice("/api/corpus/".length);

      const id = env.BFV_ROOM.idFromName(BFV_ROOM_NAME);
      const stub = env.BFV_ROOM.get(id);

      if (sub === "state" && (request.method === "GET" || request.method === "POST")) {
        const bodyText = request.method === "POST" ? await request.text() : undefined;
        const inner = new URL(request.url);
        inner.pathname = "/state";
        const resp = await stub.fetch(new Request(inner.toString(), {
          method: request.method,
          headers: request.method === "POST" ? { "content-type": "application/json" } : undefined,
          body: bodyText,
        }));
        const body = await resp.text();
        return new Response(body, { status: resp.status, headers: jsonHeaders(allowOrigin) });
      }

      if (sub === "qualify" && request.method === "POST") {
        if (!(await checkRateLimit(env.RATE_LIMIT_BFV_QUALIFY, clientKey(request)))) {
          return tooManyRequests(allowOrigin);
        }
        const bodyText = await request.text();
        const inner = new URL(request.url);
        inner.pathname = "/qualify";
        const forwarded = new Request(inner.toString(), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": request.headers.get("user-agent") || "",
            "cf-connecting-ip": clientKey(request),
          },
          body: bodyText,
        });
        const resp = await stub.fetch(forwarded);
        const body = await resp.text();
        return new Response(body, { status: resp.status, headers: jsonHeaders(allowOrigin) });
      }

      if (sub === "export.json" && request.method === "GET") {
        const inner = new URL(request.url);
        inner.pathname = "/export";
        const resp = await stub.fetch(new Request(inner.toString(), { method: "GET" }));
        const body = await resp.text();
        return new Response(body, { status: resp.status, headers: jsonHeaders(allowOrigin) });
      }

      if (sub === "snapshot.html" && request.method === "GET") {
        const inner = new URL(request.url);
        inner.pathname = "/snapshot";
        const resp = await stub.fetch(new Request(inner.toString(), { method: "GET" }));
        const body = await resp.text();
        return new Response(body, {
          status: resp.status,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=60",
            "access-control-allow-origin": allowOrigin,
            link: DISCOVERY_LINK_HEADER,
          },
        });
      }

      if (sub === "admin/reset" && request.method === "POST") {
        const bodyText = await request.text();
        const inner = new URL(request.url);
        inner.pathname = "/admin/reset";
        const forwarded = new Request(inner.toString(), {
          method: "POST",
          headers: {
            "authorization": request.headers.get("authorization") || "",
            "content-type": request.headers.get("content-type") || "application/json",
          },
          body: bodyText,
        });
        const resp = await stub.fetch(forwarded);
        const body = await resp.text();
        return new Response(body, { status: resp.status, headers: jsonHeaders(allowOrigin) });
      }

      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: jsonHeaders(allowOrigin),
      });
    }

    // ─── this person ────────────────────────────────────────────────────────
    // A consented Google ad-interest repository: only reviewed Data Portability
    // candidates become public wall entries.
    if (url.pathname.startsWith("/api/this-person/")) {
      const sub = url.pathname.slice("/api/this-person/".length);

      if (sub === "health" && request.method === "GET") {
        return new Response(
          JSON.stringify({ ok: true, at: new Date().toISOString() }),
          { status: 200, headers: jsonHeaders(allowOrigin) }
        );
      }

      if (sub === "config" && request.method === "GET") {
        const googleDpEnabled = googleDpConfigured(env);
        const ga4 = clean(env.THIS_PERSON_GA4_MEASUREMENT_ID);
        const gAds = clean(env.THIS_PERSON_GOOGLE_ADS_ID);
        const metaId = clean(env.THIS_PERSON_META_PIXEL_ID);
        const googleAdsEnabled = !!ga4 || !!gAds;
        const metaEnabled = !!metaId;
        const gamEnabled = gamConfigured(env);
        const gamSizes = parseGamSlotSizes(env.GAM_SLOT_SIZES);
        return new Response(
          JSON.stringify({
            adminEnabled: !!clean(env.THIS_PERSON_ADMIN_TOKEN),
            persistence: "durable_object_sqlite",
            adtech: {
              enabled: googleAdsEnabled || metaEnabled,
              googleAds: {
                enabled: googleAdsEnabled,
                id: ga4 || gAds || null,
                label: gAds || null,
              },
              metaPixel: {
                enabled: metaEnabled,
                id: metaId || null,
              },
            },
            googleAdManager: {
              enabled: gamEnabled,
              networkCode: gamEnabled ? clean(env.GAM_NETWORK_CODE) : null,
              adUnitPath: gamEnabled ? clean(env.GAM_AD_UNIT_PATH) : null,
              sizes: gamSizes,
            },
            googleDataPortability: {
              enabled: googleDpEnabled,
              scope: GOOGLE_DP_SCOPE,
              resource: GOOGLE_DP_RESOURCE,
              startUrl: "/api/this-person/google/start",
            },
            at: new Date().toISOString(),
          }),
          { status: 200, headers: jsonHeaders(allowOrigin) }
        );
      }

      if (sub === "google/start" && request.method === "GET") {
        return handleGoogleDpStart(request, env, allowOrigin);
      }

      if (sub === "google/callback" && request.method === "GET") {
        return handleGoogleDpCallback(request, env);
      }

      if (sub === "google/job" && request.method === "GET") {
        return handleGoogleDpJob(request, env, allowOrigin);
      }

      if (sub === "preview" || sub === "append" || sub === "enroll") {
        return new Response(JSON.stringify({ error: "retired_endpoint" }), {
          status: 410,
          headers: jsonHeaders(allowOrigin),
        });
      }

      if (!env.THIS_PERSON_ROOM) {
        return new Response(JSON.stringify({ error: "this_person_unconfigured" }), {
          status: 503,
          headers: jsonHeaders(allowOrigin),
        });
      }
      const tpId = env.THIS_PERSON_ROOM.idFromName(THIS_PERSON_ROOM_NAME);
      const tpStub = env.THIS_PERSON_ROOM.get(tpId);

      if (sub === "socket") {
        if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
          return new Response(JSON.stringify({ error: "expected_websocket_upgrade" }), {
            status: 426,
            headers: jsonHeaders(allowOrigin),
          });
        }
        return tpStub.fetch(request);
      }

      if (sub === "state" && request.method === "GET") {
        const inner = new URL(request.url);
        inner.pathname = "/state";
        const resp = await tpStub.fetch(new Request(inner.toString(), { method: "GET" }));
        return new Response(await resp.text(), {
          status: resp.status,
          headers: jsonHeaders(allowOrigin),
        });
      }

      if (sub === "google/append" && request.method === "POST") {
        return handleGoogleDpAppend(request, env, allowOrigin, tpStub);
      }

      if (sub === "web-signals/append" && request.method === "POST") {
        return handleThisPersonWebSignalsAppend(request, env, allowOrigin, tpStub);
      }

      if (sub === "gam/resolve" && request.method === "POST") {
        return handleThisPersonGamResolve(request, env, allowOrigin, tpStub);
      }

      if (sub === "admin/clear" || sub === "admin/export") {
        const adminToken = clean(env.THIS_PERSON_ADMIN_TOKEN);
        const auth = clean(request.headers.get("authorization") || "");
        const bearer = auth.match(/^Bearer\s+(.+)$/i);
        const provided = clean(bearer?.[1] || "");
        if (!adminToken || !constantTimeEqual(provided, adminToken)) {
          return new Response(JSON.stringify({ error: "forbidden" }), {
            status: 403,
            headers: jsonHeaders(allowOrigin),
          });
        }
        if (sub === "admin/clear" && request.method === "POST") {
          const inner = new URL(request.url);
          inner.pathname = "/clear";
          const resp = await tpStub.fetch(new Request(inner.toString(), { method: "POST" }));
          return new Response(await resp.text(), {
            status: resp.status,
            headers: jsonHeaders(allowOrigin),
          });
        }
        if (sub === "admin/export" && request.method === "GET") {
          const inner = new URL(request.url);
          inner.pathname = "/export";
          const resp = await tpStub.fetch(new Request(inner.toString(), { method: "GET" }));
          return new Response(await resp.text(), {
            status: resp.status,
            headers: {
              ...jsonHeaders(allowOrigin),
              "content-disposition": 'attachment; filename="this-person-repository.json"',
            },
          });
        }
      }

      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: jsonHeaders(allowOrigin),
      });
    }

    if (url.pathname === "/api/presence") {
      if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: jsonHeaders(allowOrigin),
        });
      }
      // Each room exposes /presence (or /snapshot for CoRoom) returning { count }.
      // Rooms that aren't configured for this environment, or that fail to
      // respond in time, are simply omitted — the labs page renders no count
      // for those tiles. We intentionally do not fail the whole response on
      // one bad room.
      type RoomFetch = { key: string; promise: Promise<number | null> };

      const fetchRoomCount = async (
        ns: DurableObjectNamespace | undefined,
        name: string,
        path: "/presence" | "/snapshot"
      ): Promise<number | null> => {
        if (!ns) return null;
        try {
          const id = ns.idFromName(name);
          const stub = ns.get(id);
          const inner = new URL(request.url);
          inner.pathname = path;
          const resp = await stub.fetch(new Request(inner.toString(), { method: "GET" }));
          if (!resp.ok) return null;
          const data = await resp.json<{ count?: number }>();
          const n = Number(data?.count);
          return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
        } catch {
          return null;
        }
      };

      const room_fetches: RoomFetch[] = [
        { key: "to-complete", promise: fetchRoomCount(env.BFV_ROOM, BFV_ROOM_NAME, "/presence") },
        { key: "string", promise: fetchRoomCount(env.STRING_ROOM, STRING_ROOM_NAME, "/presence") },
        { key: "this-person", promise: fetchRoomCount(env.THIS_PERSON_ROOM, THIS_PERSON_ROOM_NAME, "/presence") },
        { key: "anteroom", promise: fetchRoomCount(env.CO_ROOM, COROOM_NAME, "/snapshot") },
      ];

      const rooms: Record<string, number> = {};
      const settled = await Promise.all(room_fetches.map((r) => r.promise));
      room_fetches.forEach((r, i) => {
        const v = settled[i];
        if (v !== null) rooms[r.key] = v;
      });

      return new Response(
        JSON.stringify({ rooms, at: new Date().toISOString() }),
        { status: 200, headers: jsonHeaders(allowOrigin) }
      );
    }

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ ok: true, at: new Date().toISOString() }), {
        status: 200,
        headers: jsonHeaders(allowOrigin),
      });
    }

    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: jsonHeaders(allowOrigin),
    });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const snapshot = await buildFeedSnapshot(env);
        await persistFeedSnapshot(env, snapshot);
      })()
    );
  },
};
