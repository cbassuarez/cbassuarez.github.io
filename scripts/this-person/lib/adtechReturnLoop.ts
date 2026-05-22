// this person — the optional adtech return loop.
// This layer does not produce the portrait. It produces addressability: it
// places the browser into a real advertising audience so the page may return
// later as an ad. Ad tags are NEVER in the initial HTML and load only after a
// participant explicitly enters the loop. No extracted profile text, no
// category names, and no OCR text are ever sent to ad platforms — only a
// neutral event about participation in the work.

import type { Config } from "./api";
import { enrollPerson } from "./api";

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    fbq?: ((...args: any[]) => void) & { callMethod?: (...args: any[]) => void; queue?: any[] };
    _fbq?: unknown;
  }
}

let gtagLoaded = false;
let fbqLoaded = false;

function injectScript(src: string): void {
  const el = document.createElement("script");
  el.async = true;
  el.src = src;
  document.head.appendChild(el);
}

function loadGtag(id: string): void {
  if (gtagLoaded) return;
  gtagLoaded = true;
  injectScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id));
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", id);
}

function loadFbq(id: string): void {
  if (fbqLoaded) return;
  fbqLoaded = true;
  const fbq: any = function () {
    fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
  };
  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  injectScript("https://connect.facebook.net/en_US/fbevents.js");
  window.fbq("init", id);
}

export interface ReturnLoopOutcome {
  enrolled: boolean;
  adtechFired: string[];
}

// Called after a portrait has been appended, when the participant chooses to
// enter the return loop. Enrollment (the local wall note) happens whether or
// not ad credentials are configured.
export async function enterReturnLoop(
  config: Config,
  publicNumber: number
): Promise<ReturnLoopOutcome> {
  const adtechFired: string[] = [];
  if (config.adtech.enabled) {
    const { googleAds, metaPixel } = config.adtech;
    if (googleAds.enabled && googleAds.id) {
      loadGtag(googleAds.id);
      const sendTo = googleAds.label ? googleAds.id + "/" + googleAds.label : googleAds.id;
      window.gtag?.("event", "conversion", { send_to: sendTo });
      adtechFired.push("google_ads");
    }
    if (metaPixel.enabled && metaPixel.id) {
      loadFbq(metaPixel.id);
      window.fbq?.("trackCustom", "ThisPersonReturnLoop");
      adtechFired.push("meta_pixel");
    }
  }
  let enrolled = false;
  try {
    await enrollPerson(publicNumber);
    enrolled = true;
  } catch {
    enrolled = false;
  }
  return { enrolled, adtechFired };
}

// Fired on the return route when ?returned=ad is present.
export function markReturnedFromAd(config: Config): void {
  if (!config.adtech.enabled) return;
  const { googleAds, metaPixel } = config.adtech;
  if (googleAds.enabled && googleAds.id) {
    loadGtag(googleAds.id);
    window.gtag?.("event", "this_person_returned_from_ad", { send_to: googleAds.id });
  }
  if (metaPixel.enabled && metaPixel.id) {
    loadFbq(metaPixel.id);
    window.fbq?.("trackCustom", "ThisPersonReturnedFromAd");
  }
}
