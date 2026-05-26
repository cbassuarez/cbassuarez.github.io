// this person — Google Ad Manager REST API client.
//
// Resolves the opaque numeric IDs that GPT's slotRenderEnded event hands the
// client (advertiserId, lineItemId, creativeId, orderId) into their human
// names by calling GAM's REST API with a service-account JWT. The names are
// what produces "this person likes Patagonia" claims downstream.
//
// Pure-fetch implementation: signs an RS256 JWT with WebCrypto, exchanges it
// for an access token at oauth2.googleapis.com, and queries
// admanager.googleapis.com. Caches the access token in memory per request and
// expects the caller (ThisPersonRoom) to cache resolved names on disk.

const GAM_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GAM_API_BASE = "https://admanager.googleapis.com/v1";
const GAM_SCOPE = "https://www.googleapis.com/auth/admanager.readonly";

export interface GamServiceAccount {
  clientEmail: string;
  privateKeyPem: string;
  networkCode: string;
}

export interface GamResolvedName {
  id: string;
  name: string;
  kind: "advertiser" | "lineItem" | "creative" | "order";
}

export interface GamRenderRecord {
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

export function gamConfigured(env: {
  GAM_NETWORK_CODE?: string;
  GAM_SERVICE_ACCOUNT_EMAIL?: string;
  GAM_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
  GAM_AD_UNIT_PATH?: string;
}): boolean {
  return !!(
    env.GAM_NETWORK_CODE &&
    env.GAM_SERVICE_ACCOUNT_EMAIL &&
    env.GAM_SERVICE_ACCOUNT_PRIVATE_KEY &&
    env.GAM_AD_UNIT_PATH
  );
}

export function readGamServiceAccount(env: {
  GAM_NETWORK_CODE?: string;
  GAM_SERVICE_ACCOUNT_EMAIL?: string;
  GAM_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
}): GamServiceAccount | null {
  const clientEmail = (env.GAM_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKeyPem = (env.GAM_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim();
  const networkCode = (env.GAM_NETWORK_CODE || "").trim();
  if (!clientEmail || !privateKeyPem || !networkCode) return null;
  return { clientEmail, privateKeyPem, networkCode };
}

// ── JWT signing ─────────────────────────────────────────────────────────────

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pemToBytes(pem: string): Uint8Array {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return base64Decode(cleaned);
}

async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const keyBytes = pemToBytes(pem);
  return crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function signServiceAccountJwt(account: GamServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.clientEmail,
    scope: GAM_SCOPE,
    aud: GAM_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const encoder = new TextEncoder();
  const headerEncoded = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const claimsEncoded = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signingInput = headerEncoded + "." + claimsEncoded;
  const key = await importRsaPrivateKey(account.privateKeyPem);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(signingInput)
  );
  return signingInput + "." + base64UrlEncode(new Uint8Array(signature));
}

// ── access token ────────────────────────────────────────────────────────────

interface GamAccessToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: { account: string; token: GamAccessToken } | null = null;

export async function getGamAccessToken(
  account: GamServiceAccount
): Promise<string> {
  const cacheKey = account.clientEmail;
  const now = Date.now();
  if (
    cachedToken &&
    cachedToken.account === cacheKey &&
    cachedToken.token.expiresAt > now + 60_000
  ) {
    return cachedToken.token.accessToken;
  }
  const assertion = await signServiceAccountJwt(account);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const resp = await fetch(GAM_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      "gam_token_exchange_failed_" + resp.status + (text ? "_" + text.slice(0, 200) : "")
    );
  }
  const data: any = await resp.json().catch(() => ({}));
  const accessToken = String(data?.access_token || "");
  const expiresIn = Number(data?.expires_in) || 3600;
  if (!accessToken) throw new Error("gam_token_missing");
  cachedToken = {
    account: cacheKey,
    token: { accessToken, expiresAt: now + expiresIn * 1000 },
  };
  return accessToken;
}

// ── REST calls ──────────────────────────────────────────────────────────────

async function gamGet(
  account: GamServiceAccount,
  path: string
): Promise<any | null> {
  const token = await getGamAccessToken(account);
  const url =
    GAM_API_BASE + "/networks/" + encodeURIComponent(account.networkCode) + path;
  const resp = await fetch(url, {
    headers: { authorization: "Bearer " + token, accept: "application/json" },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error("gam_api_" + resp.status + (text ? "_" + text.slice(0, 200) : ""));
  }
  return resp.json().catch(() => null);
}

function pickDisplayName(value: any): string {
  if (!value || typeof value !== "object") return "";
  const candidates = [value.displayName, value.name?.split("/")?.pop?.()];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

export async function resolveAdvertiserName(
  account: GamServiceAccount,
  advertiserId: string
): Promise<string> {
  const data = await gamGet(account, "/companies/" + encodeURIComponent(advertiserId));
  return pickDisplayName(data);
}

export async function resolveLineItemName(
  account: GamServiceAccount,
  lineItemId: string
): Promise<{ name: string; orderId: string }> {
  const data = await gamGet(account, "/lineItems/" + encodeURIComponent(lineItemId));
  const name = pickDisplayName(data);
  const orderRef =
    typeof data?.order === "string"
      ? data.order
      : typeof data?.orderId === "string"
      ? data.orderId
      : "";
  const orderId = orderRef ? orderRef.split("/").pop() || "" : "";
  return { name, orderId };
}

export async function resolveOrderName(
  account: GamServiceAccount,
  orderId: string
): Promise<string> {
  const data = await gamGet(account, "/orders/" + encodeURIComponent(orderId));
  return pickDisplayName(data);
}

export async function resolveCreativeName(
  account: GamServiceAccount,
  creativeId: string
): Promise<string> {
  const data = await gamGet(account, "/creatives/" + encodeURIComponent(creativeId));
  return pickDisplayName(data);
}

// ── render-record → fragments ───────────────────────────────────────────────

// Convert a GAM render record + resolved names into the fragment shape the
// claim generator expects. Each resolved advertiser becomes a brand fragment;
// resolved line items and orders become brand-adjacent fragments. An empty
// fill (no bid cleared) becomes a single explicit fragment so the wall shows
// "this person was not worth bidding on" rather than skipping silently.
import type { ExtractedFragment, FragmentKind } from "./types";

interface FragmentBuild {
  value: string;
  kind: FragmentKind;
  platformHint?: string;
}

export interface GamResolution {
  advertisers: Record<string, string>; // id -> displayName
  lineItems: Record<string, string>;
  orders: Record<string, string>;
  creatives: Record<string, string>;
}

export function buildGamFragments(
  record: GamRenderRecord,
  resolved: GamResolution
): ExtractedFragment[] {
  const out: FragmentBuild[] = [];

  if (record.isEmpty) {
    out.push({
      value: "no advertiser bid",
      kind: "unknown",
      platformHint: "Google Ad Manager",
    });
  }

  if (record.advertiserId) {
    const name = resolved.advertisers[record.advertiserId];
    if (name) {
      out.push({ value: name, kind: "brand", platformHint: "Google Ad Manager" });
    }
  }
  if (record.lineItemId) {
    const name = resolved.lineItems[record.lineItemId];
    if (name) {
      out.push({
        value: name,
        kind: "brand",
        platformHint: "GAM line item",
      });
    }
  }
  if (record.orderId) {
    const name = resolved.orders[record.orderId];
    if (name) {
      out.push({ value: name, kind: "brand", platformHint: "GAM order" });
    }
  }

  // Third-party hosts touched while the iframe rendered: the brand CDNs and
  // ad-tech middlemen that the served creative pulled in.
  for (const host of record.thirdPartyHosts.slice(0, 6)) {
    const cleaned = host.replace(/^www\./, "");
    if (cleaned && !cleaned.endsWith("doubleclick.net") && !cleaned.endsWith("googlesyndication.com")) {
      out.push({
        value: cleaned,
        kind: "brand",
        platformHint: "ad iframe host",
      });
    }
  }

  // Deduplicate by case-folded value.
  const seen = new Set<string>();
  const fragments: ExtractedFragment[] = [];
  for (const f of out) {
    const key = f.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    fragments.push({
      value: f.value.slice(0, 120),
      kind: f.kind,
      platformHint: f.platformHint,
      confidence: 0.95,
      includeInWall: true,
    });
  }
  return fragments;
}
