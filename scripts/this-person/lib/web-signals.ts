// this person — consented industry-ad-tech read.
//
// On consent we do exactly what an ordinary commercial site does on page load:
// read every fingerprintable surface the ad ecosystem reads, and fire the real
// Google Ads / GA4 / Meta Pixel beacons against this browser. Then we report
// back: what was just sent, to whom, and what was returned. The page is not
// pretending — these are the same calls a shopping site, a publisher, or a SaaS
// dashboard fires against the visitor silently every day.
//
// What we do not do:
//   - upload anything;
//   - read raw browser history (the platform does not expose that to JS);
//   - persist anything in this browser past the session.
//
// What goes out (only after consent):
//   - one Google Ads / GA4 page_view + 'view_this_person' event to
//     googletagmanager.com / google-analytics.com, with the configured
//     GA4 measurement ID and (optionally) a Google Ads conversion ID;
//   - one Meta Pixel 'PageView' event to facebook.com / connect.facebook.net
//     against the configured Pixel ID.

import { topicLabel, topicPath } from "./topics-taxonomy";
import type { WebSignalsAppendInput } from "./api";

// ── public surface ──────────────────────────────────────────────────────────

export interface TopicReading {
  id: number;
  label: string;          // leaf, e.g. "Comics"
  path: string;           // full taxonomy path
  taxonomyVersion?: number | string;
  modelVersion?: string;
  configVersion?: string;
  version?: string;
}

export interface ClientHintsReading {
  brands: string[];
  fullBrands: string[];
  mobile: boolean;
  platform: string;
  platformVersion: string;
  architecture: string;
  bitness: string;
  model: string;
  uaFullVersion: string;
  wow64: boolean;
  formFactor: string[];
}

export interface FingerprintReading {
  screen: { width: number; height: number; colorDepth: number; pixelRatio: number };
  language: string;
  languages: string[];
  timezone: string;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  connection: { effectiveType: string; downlink: number | null; rtt: number | null; saveData: boolean } | null;
  webglVendor: string;
  webglRenderer: string;
  canvasHashHex: string;       // hex of a small canvas fingerprint
  audioFingerprint: number | null;
}

export interface PrivacySignalReading {
  globalPrivacyControl: boolean | null;
  doNotTrack: string | null;
  cookieEnabled: boolean;
  cookieDeprecationLabel: string | null;
  hasTopicsApi: boolean;
  hasAttributionReporting: boolean;
  hasProtectedAudience: boolean;
  hasSharedStorage: boolean;
  hasPrivateStateTokens: boolean;
  storageAccessSupported: boolean;
}

export interface FiredTag {
  network: "google" | "meta";
  id: string;                  // measurement / pixel id
  event: string;
  endpoints: string[];         // observed outbound URLs from PerformanceObserver
}

export interface SignalsConfig {
  googleAds: { enabled: boolean; id: string | null; label: string | null };
  metaPixel: { enabled: boolean; id: string | null };
}

export interface SignalsReading {
  collectedAt: string;
  config: SignalsConfig;
  topics: TopicReading[];
  topicsNote: string;          // honest explainer of why topics may be empty
  clientHints: ClientHintsReading;
  fingerprint: FingerprintReading;
  privacy: PrivacySignalReading;
  firedTags: FiredTag[];
  thirdPartyHosts: string[];   // hosts our page touched after consent
}

// ── small helpers ───────────────────────────────────────────────────────────

const AD_TECH_HOST_HINTS = [
  "googletagmanager",
  "google-analytics",
  "googleadservices",
  "googlesyndication",
  "doubleclick",
  "connect.facebook",
  "facebook.com",
  "fbcdn",
];

function isAdTechHost(host: string): boolean {
  const h = host.toLowerCase();
  return AD_TECH_HOST_HINTS.some((needle) => h.includes(needle));
}

function nowIso(): string {
  return new Date().toISOString();
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

function loadScript(src: string, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement("script");
    el.async = true;
    el.src = src;
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    el.addEventListener("load", () => finish(true));
    el.addEventListener("error", () => finish(false));
    setTimeout(() => finish(false), timeoutMs);
    document.head.appendChild(el);
  });
}

async function digestHex(text: string): Promise<string> {
  try {
    const buf = new TextEncoder().encode(text);
    const out = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(out))
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

// ── topics ──────────────────────────────────────────────────────────────────

async function readTopics(): Promise<{ topics: TopicReading[]; note: string }> {
  const fn = (document as any).browsingTopics;
  if (typeof fn !== "function") {
    return {
      topics: [],
      note: "This browser does not expose the Topics API. Chromium browsers expose document.browsingTopics() to advertisers; the rest of the ecosystem either does not implement it or has it disabled.",
    };
  }
  const shouldProbe = new URLSearchParams(location.search).get("topics") === "1";
  if (!shouldProbe) {
    return {
      topics: [],
      note: "Chrome exposes the Topics API here, but this origin is not currently Privacy Sandbox-attested for Topics. The direct Topics probe is disabled by default because Chrome can only reject it and write a browser-level warning. Add ?topics=1 after enrollment to force the live probe.",
    };
  }
  try {
    const raw = await withTimeout(
      fn.call(document, { skipObservation: false }),
      3000,
      [] as any[]
    );
    const out: TopicReading[] = [];
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const id = Number((item as any)?.topic);
        if (!Number.isInteger(id) || id <= 0) continue;
        const path = topicPath(id);
        out.push({
          id,
          label: topicLabel(id),
          path: path || `Topic ${id}`,
          taxonomyVersion: (item as any)?.taxonomyVersion ?? undefined,
          modelVersion: (item as any)?.modelVersion ?? undefined,
          configVersion: (item as any)?.configVersion ?? undefined,
          version: (item as any)?.version ?? undefined,
        });
      }
    }
    if (out.length > 0) {
      return {
        topics: out,
        note: "These are the topics Chrome is willing to hand to ad tech that calls document.browsingTopics() this week. The list is computed from this browser's recent history.",
      };
    }
    return {
      topics: [],
      note: "Chrome returned no topics for this origin yet. Topics are computed from prior visits to sites that observed the API; first-time visitors and freshly-cleared browsers come back empty until the next epoch.",
    };
  } catch (err) {
    return {
      topics: [],
      note: "The Topics API call was rejected by the browser (" + (err as Error)?.name + "). Common reasons: the page is in a fenced or sandboxed frame, Topics are disabled in chrome://settings/adPrivacy, or the user is in an incognito profile.",
    };
  }
}

// ── client hints ────────────────────────────────────────────────────────────

async function readClientHints(): Promise<ClientHintsReading> {
  const uaData: any = (navigator as any).userAgentData;
  const empty: ClientHintsReading = {
    brands: [], fullBrands: [], mobile: false, platform: "", platformVersion: "",
    architecture: "", bitness: "", model: "", uaFullVersion: "", wow64: false, formFactor: [],
  };
  if (!uaData) return empty;
  const baseBrands = Array.isArray(uaData.brands)
    ? uaData.brands.map((b: any) => `${b.brand} ${b.version}`).filter(Boolean)
    : [];
  let high: any = null;
  if (typeof uaData.getHighEntropyValues === "function") {
    try {
      high = await withTimeout(
        uaData.getHighEntropyValues([
          "architecture", "bitness", "model", "platform", "platformVersion",
          "uaFullVersion", "fullVersionList", "wow64", "formFactor",
        ]),
        2000,
        null
      );
    } catch {
      high = null;
    }
  }
  const fullBrands = Array.isArray(high?.fullVersionList)
    ? high.fullVersionList.map((b: any) => `${b.brand} ${b.version}`).filter(Boolean)
    : [];
  return {
    brands: baseBrands,
    fullBrands,
    mobile: !!uaData.mobile,
    platform: String(uaData.platform || ""),
    platformVersion: String(high?.platformVersion || ""),
    architecture: String(high?.architecture || ""),
    bitness: String(high?.bitness || ""),
    model: String(high?.model || ""),
    uaFullVersion: String(high?.uaFullVersion || ""),
    wow64: !!high?.wow64,
    formFactor: Array.isArray(high?.formFactor) ? high.formFactor.map(String) : [],
  };
}

// ── fingerprint surface ─────────────────────────────────────────────────────

function readWebgl(): { vendor: string; renderer: string } {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return { vendor: "", renderer: "" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return { vendor: "", renderer: "" };
    const vendor = String(gl.getParameter((ext as any).UNMASKED_VENDOR_WEBGL) || "");
    const renderer = String(gl.getParameter((ext as any).UNMASKED_RENDERER_WEBGL) || "");
    return { vendor, renderer };
  } catch {
    return { vendor: "", renderer: "" };
  }
}

async function readCanvasFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 200, 50);
    ctx.fillStyle = "#069";
    ctx.fillText("this person — fingerprint canvas", 2, 2);
    ctx.strokeStyle = "rgba(102,204,0,0.7)";
    ctx.beginPath();
    ctx.arc(50, 25, 20, 0, Math.PI * 2);
    ctx.stroke();
    const dataUrl = canvas.toDataURL();
    return await digestHex(dataUrl);
  } catch {
    return "";
  }
}

function readAudioFingerprint(): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const AC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      if (!AC) return resolve(null);
      const ctx = new AC(1, 5000, 44100);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(10000, ctx.currentTime);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-50, ctx.currentTime);
      comp.knee.setValueAtTime(40, ctx.currentTime);
      comp.ratio.setValueAtTime(12, ctx.currentTime);
      comp.attack.setValueAtTime(0, ctx.currentTime);
      comp.release.setValueAtTime(0.25, ctx.currentTime);
      osc.connect(comp);
      comp.connect(ctx.destination);
      osc.start(0);
      ctx.startRendering().then((buf: AudioBuffer) => {
        let sum = 0;
        const data = buf.getChannelData(0);
        for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i] || 0);
        resolve(sum);
      }).catch(() => resolve(null));
      setTimeout(() => resolve(null), 2000);
    } catch {
      resolve(null);
    }
  });
}

async function readFingerprint(): Promise<FingerprintReading> {
  const webgl = readWebgl();
  const [canvasHash, audio] = await Promise.all([readCanvasFingerprint(), readAudioFingerprint()]);
  const conn: any = (navigator as any).connection || null;
  return {
    screen: {
      width: Number(screen?.width) || 0,
      height: Number(screen?.height) || 0,
      colorDepth: Number(screen?.colorDepth) || 0,
      pixelRatio: Number(window.devicePixelRatio) || 1,
    },
    language: String(navigator.language || ""),
    languages: Array.isArray(navigator.languages) ? [...navigator.languages] : [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    hardwareConcurrency: Number(navigator.hardwareConcurrency) || 0,
    deviceMemory: typeof (navigator as any).deviceMemory === "number" ? Number((navigator as any).deviceMemory) : null,
    connection: conn ? {
      effectiveType: String(conn.effectiveType || ""),
      downlink: typeof conn.downlink === "number" ? conn.downlink : null,
      rtt: typeof conn.rtt === "number" ? conn.rtt : null,
      saveData: !!conn.saveData,
    } : null,
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    canvasHashHex: canvasHash,
    audioFingerprint: audio,
  };
}

// ── privacy signals ─────────────────────────────────────────────────────────

async function readPrivacySignals(): Promise<PrivacySignalReading> {
  const dnt = navigator.doNotTrack ?? (window as any).doNotTrack ?? null;
  return {
    globalPrivacyControl: typeof (navigator as any).globalPrivacyControl === "boolean"
      ? (navigator as any).globalPrivacyControl
      : null,
    doNotTrack: dnt != null ? String(dnt) : null,
    cookieEnabled: !!navigator.cookieEnabled,
    cookieDeprecationLabel: typeof (navigator as any).cookieDeprecationLabel?.getValue === "function"
      ? await withTimeout((navigator as any).cookieDeprecationLabel.getValue(), 1000, null)
      : (typeof (navigator as any).cookieDeprecationLabel === "string"
          ? String((navigator as any).cookieDeprecationLabel)
          : null),
    hasTopicsApi: typeof (document as any).browsingTopics === "function",
    hasAttributionReporting: typeof (window as any).attributionReporting !== "undefined"
      || ("attributionReporting" in (document as any)) || false,
    hasProtectedAudience: typeof (navigator as any).runAdAuction === "function"
      || typeof (navigator as any).joinAdInterestGroup === "function",
    hasSharedStorage: typeof (window as any).sharedStorage !== "undefined",
    hasPrivateStateTokens: typeof (document as any).hasPrivateToken === "function"
      || typeof (document as any).hasRedemptionRecord === "function",
    storageAccessSupported: typeof (document as any).hasStorageAccess === "function",
  };
}

// ── outbound tag firing ─────────────────────────────────────────────────────

interface FireResult {
  fired: FiredTag[];
  hosts: Set<string>;
}

function captureResourceHosts(since: number, includeAll: boolean): { firedEndpoints: Map<string, string[]>; hosts: Set<string> } {
  const firedEndpoints = new Map<string, string[]>();
  const hosts = new Set<string>();
  try {
    const entries = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]) || [];
    for (const entry of entries) {
      if (entry.startTime < since) continue;
      let host: string;
      try {
        host = new URL(entry.name).host;
      } catch {
        continue;
      }
      if (!host) continue;
      if (!includeAll && !isAdTechHost(host)) continue;
      hosts.add(host);
      const list = firedEndpoints.get(host) || [];
      if (list.length < 3) list.push(entry.name);
      firedEndpoints.set(host, list);
    }
  } catch {
    // PerformanceObserver may be unavailable in this context
  }
  return { firedEndpoints, hosts };
}

async function fireGoogleTag(measurementId: string, conversionId: string | null): Promise<string[]> {
  // gtag.js refuses dataLayer events until it has loaded itself; we set the
  // dataLayer first so the page_view + custom event are queued.
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
  w.gtag("js", new Date());
  w.gtag("config", measurementId, { send_page_view: true, anonymize_ip: true });
  if (conversionId && /^AW-/i.test(conversionId)) {
    w.gtag("config", conversionId);
  }
  w.gtag("event", "view_this_person", {
    event_category: "art_consent",
    event_label: "this person — consented industry-tag read",
    non_interaction: false,
  });
  const ok = await loadScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId));
  // give the loaded library a beat to flush its first beacon
  await new Promise((resolve) => setTimeout(resolve, 600));
  return ok ? ["gtag.js loaded; page_view + view_this_person dispatched"] : ["gtag.js failed to load — beacon not confirmed"];
}

async function fireMetaPixel(pixelId: string): Promise<string[]> {
  const w = window as any;
  // Standard Meta Pixel boilerplate, abbreviated.
  if (!w.fbq) {
    const n: any = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    w.fbq = n;
    if (!w._fbq) w._fbq = n;
  }
  w.fbq("init", pixelId);
  w.fbq("track", "PageView");
  const ok = await loadScript("https://connect.facebook.net/en_US/fbevents.js");
  await new Promise((resolve) => setTimeout(resolve, 600));
  return ok ? ["fbevents.js loaded; PageView track dispatched"] : ["fbevents.js failed to load — beacon not confirmed"];
}

async function fireAdTechTags(config: SignalsConfig): Promise<FireResult> {
  const fired: FiredTag[] = [];
  const start = performance.now();
  if (config.googleAds.enabled && config.googleAds.id) {
    const log = await fireGoogleTag(config.googleAds.id, config.googleAds.label || null);
    fired.push({
      network: "google",
      id: config.googleAds.id,
      event: "view_this_person",
      endpoints: log,
    });
  }
  if (config.metaPixel.enabled && config.metaPixel.id) {
    const log = await fireMetaPixel(config.metaPixel.id);
    fired.push({
      network: "meta",
      id: config.metaPixel.id,
      event: "PageView",
      endpoints: log,
    });
  }
  // Wait a touch more, then snapshot which third-party hosts our page touched.
  await new Promise((resolve) => setTimeout(resolve, 400));
  const { firedEndpoints, hosts } = captureResourceHosts(start, false);
  // Annotate firedTags with the actual outbound URLs grouped by network.
  for (const tag of fired) {
    const matching: string[] = [];
    firedEndpoints.forEach((urls, host) => {
      const ours =
        (tag.network === "google" && (host.includes("googletagmanager") || host.includes("google-analytics") || host.includes("googleadservices") || host.includes("doubleclick"))) ||
        (tag.network === "meta" && (host.includes("facebook") || host.includes("fbcdn")));
      if (ours) {
        for (const u of urls) {
          if (matching.length < 4) matching.push(u);
        }
      }
    });
    if (matching.length) {
      tag.endpoints = [...tag.endpoints, ...matching];
    }
  }
  return { fired, hosts };
}

// ── orchestration ───────────────────────────────────────────────────────────

export async function collectWebSignals(config: SignalsConfig): Promise<SignalsReading> {
  // The reads that don't depend on outbound network activity run first.
  const [topicsResult, clientHints, fingerprint, privacy] = await Promise.all([
    readTopics(),
    readClientHints(),
    readFingerprint(),
    readPrivacySignals(),
  ]);

  // Then the actual ad-tech tags get fired on this browser.
  const fired = await fireAdTechTags(config);

  return {
    collectedAt: nowIso(),
    config,
    topics: topicsResult.topics,
    topicsNote: topicsResult.note,
    clientHints,
    fingerprint,
    privacy,
    firedTags: fired.fired,
    thirdPartyHosts: [...fired.hosts].sort(),
  };
}

// ── claim shaping ───────────────────────────────────────────────────────────
//
// Turns the reading into the {fragments, platformHints} payload the worker
// already knows how to ingest. The worker re-classifies and generates claim
// sentences; the client just hands over the substrate.

import type { ExtractedFragment, FragmentKind } from "../../../workers/seb-feed/src/this-person/types";

const TOPIC_PATH_TO_KIND: { needle: string; kind: FragmentKind }[] = [
  { needle: "/Food", kind: "food" },
  { needle: "Restaurants", kind: "restaurant" },
  { needle: "/Travel", kind: "travel" },
  { needle: "/Autos", kind: "vehicle" },
  { needle: "/Finance", kind: "finance" },
  { needle: "/Real Estate", kind: "real_estate" },
  { needle: "/Jobs & Education", kind: "education" },
  { needle: "/Books & Literature", kind: "literature" },
  { needle: "/Arts & Entertainment", kind: "entertainment" },
  { needle: "/Beauty & Fitness", kind: "health" },
  { needle: "/Home & Garden", kind: "home" },
  { needle: "/Computers", kind: "technology" },
  { needle: "/Internet", kind: "technology" },
  { needle: "/News/Politics", kind: "political" },
  { needle: "/People & Society/Religion", kind: "religious" },
  { needle: "/People & Society/Family", kind: "family" },
  { needle: "/Shopping", kind: "retail" },
  { needle: "/Business", kind: "work" },
];

function kindForTopicPath(path: string): FragmentKind {
  for (const { needle, kind } of TOPIC_PATH_TO_KIND) {
    if (path.includes(needle)) return kind;
  }
  return "unknown";
}

function platformLabelFromHints(hints: ClientHintsReading): string {
  const brand = hints.fullBrands[0] || hints.brands[0] || "";
  const platform = hints.platform || "";
  const v = hints.platformVersion || "";
  if (brand && platform) return `${brand} on ${platform}${v ? " " + v : ""}`;
  if (brand) return brand;
  if (platform) return platform;
  return "";
}

export function buildAppendPayload(reading: SignalsReading): WebSignalsAppendInput {
  const fragments: ExtractedFragment[] = [];
  for (const t of reading.topics) {
    fragments.push({
      value: t.label,
      kind: kindForTopicPath(t.path),
      platformHint: "Chrome Topics API",
      confidence: 0.9,
      includeInWall: true,
    });
  }
  // Language: an honest "this person is read in English" signal.
  if (reading.fingerprint.language) {
    fragments.push({
      value: reading.fingerprint.language,
      kind: "unknown",
      platformHint: "browser locale",
      confidence: 0.5,
      includeInWall: true,
    });
  }
  // Timezone — a coarse-but-real geographic targeting signal.
  if (reading.fingerprint.timezone) {
    fragments.push({
      value: reading.fingerprint.timezone,
      kind: "unknown",
      platformHint: "browser timezone",
      confidence: 0.6,
      includeInWall: true,
    });
  }
  // Each fired ad-tech network becomes a fragment with kind=brand so the
  // claim generator emits "this person was just shown to X".
  for (const tag of reading.firedTags) {
    fragments.push({
      value: tag.network === "google" ? "Google Ads" : "Meta",
      kind: "brand",
      platformHint: tag.network === "google" ? "Google Ads / GA4" : "Meta Pixel",
      confidence: 1,
      includeInWall: true,
    });
  }

  const platformHints: string[] = [];
  const ua = platformLabelFromHints(reading.clientHints);
  if (ua) platformHints.push(ua);
  for (const host of reading.thirdPartyHosts.slice(0, 4)) platformHints.push(host);

  // Stable seed per reading: hash collectedAt + topic ids. Keeps preview and
  // append in sync; not security-sensitive.
  let seed = 0;
  const key = reading.collectedAt + ":" + reading.topics.map((t) => t.id).join(",");
  for (let i = 0; i < key.length; i++) seed = ((seed << 5) - seed + key.charCodeAt(i)) | 0;

  return {
    source: "ad_preferences_surface",
    platformHints,
    fragments,
    seed: seed >>> 0,
  };
}
