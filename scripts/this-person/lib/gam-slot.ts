// this person — Google Publisher Tag (GPT) loader and slot observer.
//
// Renders one GAM ad slot in the page and captures the slotRenderEnded event
// the server will use to resolve advertiser names. Also watches the network
// for third-party hosts the served creative pulled in, so the wall can show
// the brand domains the ad touched even when GAM does not resolve a name.

export interface GamSlotConfig {
  networkCode: string;
  adUnitPath: string;
  sizes: [number, number][];
}

export interface GamSlotRender {
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

declare global {
  interface Window {
    googletag?: any;
  }
}

const GPT_URL = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";

function loadGpt(): Promise<any> {
  if (window.googletag && window.googletag.cmd) {
    return Promise.resolve(window.googletag);
  }
  window.googletag = window.googletag || { cmd: [] };
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-gpt-tag="this-person"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(window.googletag));
      existing.addEventListener("error", () => reject(new Error("gpt_load_failed")));
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.src = GPT_URL;
    script.dataset.gptTag = "this-person";
    script.addEventListener("load", () => resolve(window.googletag));
    script.addEventListener("error", () => reject(new Error("gpt_load_failed")));
    document.head.appendChild(script);
  });
}

function pickPrimarySize(sizes: [number, number][]): [number, number] {
  return sizes[0] || [300, 250];
}

function uniq(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (!x || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function collectThirdPartyHosts(after: number): string[] {
  try {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const hosts: string[] = [];
    const ourHost = location.host;
    for (const entry of entries) {
      if (entry.startTime < after - 50) continue;
      let host = "";
      try {
        host = new URL(entry.name).host;
      } catch {
        continue;
      }
      if (!host || host === ourHost) continue;
      hosts.push(host);
    }
    return uniq(hosts).slice(0, 24);
  } catch {
    return [];
  }
}

function readIframeUrl(slotElement: HTMLElement): string | null {
  const iframe = slotElement.querySelector<HTMLIFrameElement>("iframe");
  if (!iframe) return null;
  try {
    return iframe.src || null;
  } catch {
    return null;
  }
}

function eventId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id && id !== "0" ? id : null;
}

// Defines a GPT slot inside the given container, returns a promise that
// resolves once slotRenderEnded fires (or rejects on timeout). The slot stays
// in the DOM — the caller is responsible for showing it to the visitor.
export async function renderGamSlot(
  container: HTMLElement,
  config: GamSlotConfig,
  timeoutMs = 8000
): Promise<GamSlotRender> {
  const googletag = await loadGpt();
  const slotElement = document.createElement("div");
  slotElement.id =
    "this-person-gam-slot-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const primary = pickPrimarySize(config.sizes);
  slotElement.style.width = primary[0] + "px";
  slotElement.style.height = primary[1] + "px";
  slotElement.style.maxWidth = "100%";
  container.appendChild(slotElement);

  const startedAt = performance.now();
  let resolved = false;

  return new Promise<GamSlotRender>((resolve, reject) => {
    const settle = (record: GamSlotRender): void => {
      if (resolved) return;
      resolved = true;
      // Give late-loading creatives a moment to populate before we snapshot
      // the third-party hosts. Then resolve.
      setTimeout(() => {
        const hosts = collectThirdPartyHosts(startedAt);
        const iframeUrl = readIframeUrl(slotElement);
        resolve({
          ...record,
          thirdPartyHosts: hosts,
          iframeUrl,
        });
      }, 400);
    };

    const timeout = setTimeout(() => {
      settle({
        advertiserId: null,
        campaignId: null,
        creativeId: null,
        lineItemId: null,
        orderId: null,
        yieldGroupIds: [],
        companyIds: [],
        size: null,
        iframeUrl: null,
        thirdPartyHosts: [],
        isEmpty: true,
        serviceName: "googletag",
      });
    }, timeoutMs);

    googletag.cmd.push(() => {
      try {
        const slot = googletag
          .defineSlot(config.adUnitPath, config.sizes, slotElement.id)
          .addService(googletag.pubads());

        googletag.pubads().addEventListener("slotRenderEnded", (event: any) => {
          if (!event?.slot || event.slot !== slot) return;
          clearTimeout(timeout);
          const size = Array.isArray(event.size) && event.size.length === 2
            ? ([Number(event.size[0]), Number(event.size[1])] as [number, number])
            : null;
          settle({
            advertiserId: eventId(event.advertiserId),
            campaignId: eventId(event.campaignId),
            creativeId: eventId(event.creativeId),
            lineItemId: eventId(event.lineItemId),
            orderId: null, // GPT does not expose orderId; the worker derives it
            yieldGroupIds: Array.isArray(event.yieldGroupIds)
              ? event.yieldGroupIds.map((x: any) => String(x))
              : [],
            companyIds: Array.isArray(event.companyIds)
              ? event.companyIds.map((x: any) => String(x))
              : [],
            size,
            iframeUrl: null, // patched by settle()
            thirdPartyHosts: [], // patched by settle()
            isEmpty: event.isEmpty === true,
            serviceName: typeof event.serviceName === "string" ? event.serviceName : null,
          });
        });

        if (typeof googletag.setConfig === "function") {
          googletag.setConfig({ centering: true, singleRequest: true });
        } else {
          googletag.pubads().enableSingleRequest();
          googletag.pubads().setCentering(true);
        }
        googletag.enableServices();
        googletag.display(slot);
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}
