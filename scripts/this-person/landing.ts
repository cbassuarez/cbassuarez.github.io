// this person — consented industry-ad-tech read.
//
// One method. The visitor presses a single button; the page does exactly what
// any commercial site does on a normal page load: asks Chrome for its Topics,
// reads the browser fingerprint surface, and fires real Google Ads / GA4 +
// Meta Pixel beacons against this browser. The result becomes a third-person
// wall entry. There is no upload, no OAuth, no archive job.

import {
  appendWebSignals,
  fetchConfig,
  type Config,
} from "./lib/api";
import {
  buildAppendPayload,
  collectWebSignals,
  type SignalsConfig,
  type SignalsReading,
} from "./lib/web-signals";
import { buildEntry } from "./lib/wall-render";
import { clear, h } from "./lib/dom";

function panel(...children: (Node | string | false | null | undefined)[]): HTMLElement {
  return h("section", {}, ...children);
}

function signalsConfigFromConfig(config: Config): SignalsConfig {
  return {
    googleAds: { ...config.adtech.googleAds },
    metaPixel: { ...config.adtech.metaPixel },
  };
}

function tagsLine(config: Config): string {
  const enabled: string[] = [];
  if (config.adtech.googleAds.enabled && config.adtech.googleAds.id) {
    enabled.push("Google Ads / GA4 (" + config.adtech.googleAds.id + ")");
  }
  if (config.adtech.metaPixel.enabled && config.adtech.metaPixel.id) {
    enabled.push("Meta Pixel (" + config.adtech.metaPixel.id + ")");
  }
  if (enabled.length === 0) return "No real ad-tech IDs are configured on this worker — only the browser-side reads will run.";
  return "The page will fire these real industry tags against this browser: " + enabled.join(" + ") + ".";
}

function topicsBlock(reading: SignalsReading): HTMLElement {
  const items = reading.topics.length
    ? h(
        "ul",
        {},
        ...reading.topics.map((t) =>
          h(
            "li",
            {},
            h("strong", { text: t.label }),
            " — ",
            h("span", { text: t.path })
          )
        )
      )
    : h("p", { text: "(none returned)" });
  return h(
    "section",
    {},
    h("h2", { text: "Chrome Topics (history-derived ad interests)" }),
    items,
    h("p", { text: reading.topicsNote })
  );
}

function clientHintsBlock(reading: SignalsReading): HTMLElement {
  const ch = reading.clientHints;
  const lines: string[] = [];
  if (ch.fullBrands.length) lines.push("brands: " + ch.fullBrands.join(", "));
  else if (ch.brands.length) lines.push("brands: " + ch.brands.join(", "));
  if (ch.platform) lines.push("platform: " + ch.platform + (ch.platformVersion ? " " + ch.platformVersion : ""));
  if (ch.architecture || ch.bitness) lines.push("architecture: " + [ch.architecture, ch.bitness].filter(Boolean).join(" "));
  if (ch.model) lines.push("model: " + ch.model);
  if (ch.formFactor.length) lines.push("form factor: " + ch.formFactor.join(", "));
  lines.push("mobile: " + (ch.mobile ? "yes" : "no"));
  return h("section", {},
    h("h2", { text: "client hints (what ad tech reads on every request)" }),
    lines.length
      ? h("ul", {}, ...lines.map((line) => h("li", { text: line })))
      : h("p", { text: "(this browser does not expose client hints — likely Safari or Firefox)" })
  );
}

function fingerprintBlock(reading: SignalsReading): HTMLElement {
  const fp = reading.fingerprint;
  const lines: string[] = [
    "language: " + (fp.language || "(unknown)") + (fp.languages.length > 1 ? " (also " + fp.languages.slice(1).join(", ") + ")" : ""),
    "timezone: " + (fp.timezone || "(unknown)"),
    "screen: " + fp.screen.width + "×" + fp.screen.height + " @ " + fp.screen.colorDepth + "-bit / " + fp.screen.pixelRatio + "× dpr",
    "logical cores: " + (fp.hardwareConcurrency || "(unknown)"),
    "device memory: " + (fp.deviceMemory != null ? fp.deviceMemory + " GB" : "(not reported)"),
    "network: " + (fp.connection ? [fp.connection.effectiveType, fp.connection.downlink ? fp.connection.downlink + " Mb/s" : "", fp.connection.rtt != null ? fp.connection.rtt + " ms rtt" : ""].filter(Boolean).join(", ") : "(not reported)"),
    "WebGL: " + ((fp.webglVendor || fp.webglRenderer) ? fp.webglVendor + " / " + fp.webglRenderer : "(masked)"),
    "canvas hash: " + (fp.canvasHashHex || "(unavailable)"),
    "audio hash: " + (fp.audioFingerprint != null ? fp.audioFingerprint.toString().slice(0, 14) : "(unavailable)"),
  ];
  return h("section", {},
    h("h2", { text: "fingerprint surface" }),
    h("ul", {}, ...lines.map((line) => h("li", { text: line })))
  );
}

function privacyBlock(reading: SignalsReading): HTMLElement {
  const p = reading.privacy;
  const lines: string[] = [
    "Global Privacy Control: " + (p.globalPrivacyControl == null ? "(no signal)" : p.globalPrivacyControl ? "on" : "off"),
    "Do Not Track: " + (p.doNotTrack ?? "(no signal)"),
    "cookies enabled: " + (p.cookieEnabled ? "yes" : "no"),
    "cookieDeprecationLabel: " + (p.cookieDeprecationLabel ?? "(none)"),
    "Topics API present: " + (p.hasTopicsApi ? "yes" : "no"),
    "Attribution Reporting present: " + (p.hasAttributionReporting ? "yes" : "no"),
    "Protected Audience (FLEDGE) present: " + (p.hasProtectedAudience ? "yes" : "no"),
    "Shared Storage present: " + (p.hasSharedStorage ? "yes" : "no"),
    "Private State Tokens present: " + (p.hasPrivateStateTokens ? "yes" : "no"),
    "Storage Access API present: " + (p.storageAccessSupported ? "yes" : "no"),
  ];
  return h("section", {},
    h("h2", { text: "privacy signals + sandbox surface" }),
    h("ul", {}, ...lines.map((line) => h("li", { text: line })))
  );
}

function firedTagsBlock(reading: SignalsReading): HTMLElement {
  if (!reading.firedTags.length) {
    return h("section", {},
      h("h2", { text: "industry tags fired" }),
      h("p", { text: "No real ad-tech IDs were configured, so no outbound beacons were sent. The browser-side reads above still happened." })
    );
  }
  return h(
    "section",
    {},
    h("h2", { text: "industry tags fired against this browser" }),
    ...reading.firedTags.map((tag) =>
      h(
        "div",
        {},
        h("p", {},
          h("strong", { text: tag.network === "google" ? "Google Ads / GA4" : "Meta Pixel" }),
          " — id ",
          h("code", { text: tag.id }),
          " — event ",
          h("code", { text: tag.event })
        ),
        h("ul", {}, ...tag.endpoints.slice(0, 6).map((line) => h("li", {}, h("code", { text: line }))))
      )
    ),
    reading.thirdPartyHosts.length
      ? h("p", { text: "third-party hosts this page touched after consent: " + reading.thirdPartyHosts.join(", ") })
      : false
  );
}

function showCollecting(root: HTMLElement, message: string): void {
  clear(root);
  root.append(
    panel(
      h("h1", { text: "this person" }),
      h("p", { text: message })
    )
  );
}

function showFailure(root: HTMLElement, message: string, retry: () => void): void {
  clear(root);
  root.append(
    panel(
      h("h1", { text: "this person" }),
      h("p", { text: message }),
      h("p", { text: "nothing was appended." }),
      h("button", { type: "button", text: "start again", onClick: retry }),
      h("p", {}, h("a", { href: "wall/", text: "view the repository" }))
    )
  );
}

async function runFlow(root: HTMLElement, config: Config): Promise<void> {
  showCollecting(root, "asking the browser what it tells advertisers…");
  let reading: SignalsReading;
  try {
    reading = await collectWebSignals(signalsConfigFromConfig(config));
  } catch (err) {
    showFailure(root, "the collection step failed: " + ((err as Error)?.message || "unknown"), () => showStart(root, config));
    return;
  }
  showReview(root, config, reading);
}

function showReview(root: HTMLElement, config: Config, reading: SignalsReading): void {
  const payload = buildAppendPayload(reading);

  const previewClaims = reading.topics.slice(0, 6).map((t) => ({
    sentence: "this person likes " + t.label,
    sourceNote: "Chrome Topics API (taxonomy v2)",
    fragments: [t.label],
    intensity: "banal" as const,
  }));
  // Add a couple of structural claims for the preview so the visitor sees the
  // shape even before the worker generates the final ones.
  if (reading.firedTags.some((t) => t.network === "google")) {
    previewClaims.push({
      sentence: "this person was just shown to Google Ads",
      sourceNote: "GA4 page_view + custom event",
      fragments: ["Google Ads"],
      intensity: "institutional" as const,
    });
  }
  if (reading.firedTags.some((t) => t.network === "meta")) {
    previewClaims.push({
      sentence: "this person was just shown to Meta",
      sourceNote: "Meta Pixel PageView",
      fragments: ["Meta"],
      intensity: "institutional" as const,
    });
  }

  const appendButton = h("button", { type: "button", text: "append to the repository" }) as HTMLButtonElement;
  const message = h("p", { text: "" });
  appendButton.addEventListener("click", async () => {
    appendButton.disabled = true;
    appendButton.textContent = "appending";
    try {
      const person = await appendWebSignals(payload);
      clear(root);
      root.append(
        panel(
          h("h1", { text: "this person has been appended." }),
          buildEntry(person.id, person.source, person.claims, { summary: person.extractionSummary }),
          h("p", {}, h("a", { href: "wall/", text: "view the repository" })),
          h("p", {}, h("a", { href: "./", text: "do this again with a different browser" }))
        )
      );
    } catch (err) {
      appendButton.disabled = false;
      appendButton.textContent = "append to the repository";
      message.textContent = "append failed: " + ((err as Error)?.message || "unknown");
    }
  });

  clear(root);
  root.append(
    panel(
      h("h1", { text: "this is what the industry just saw" }),
      h("p", { text: "Everything below was read from this browser, or sent out from it, in the last few seconds. Review and append, or close the tab and nothing public happens." }),
      topicsBlock(reading),
      clientHintsBlock(reading),
      fingerprintBlock(reading),
      privacyBlock(reading),
      firedTagsBlock(reading),
      h("section", {},
        h("h2", { text: "preview of the public entry" }),
        previewClaims.length
          ? buildEntry("####", "ad_preferences_surface", previewClaims, { summary: "preview — the worker will rewrite these claims on append." })
          : h("p", { text: "nothing extracted — there is no entry to append yet." })
      ),
      previewClaims.length ? appendButton : false,
      message,
      h("p", {}, h("a", { href: "wall/", text: "view the repository" })),
      h("p", {}, h("a", { href: "./", text: "start over" }))
    )
  );
}

async function showStart(root: HTMLElement, config: Config): Promise<void> {
  clear(root);
  const beginButton = h("button", { type: "button", text: "reveal what they see" }) as HTMLButtonElement;
  beginButton.addEventListener("click", () => {
    void runFlow(root, config);
  });

  root.append(
    panel(
      h("h1", { text: "this person" }),
      h("p", { text: "An art piece in the shape of an ordinary page load." }),
      h("p", { text: "Press the button and this page does what almost every commercial site does silently against its visitors:" }),
      h("ol", {},
        h("li", { text: "asks Chrome for the topics it has decided you are interested in this week (Topics API);" }),
        h("li", { text: "reads the user-agent client hints, fingerprint surface, and Privacy-Sandbox feature presence on your browser;" }),
        h("li", { text: "fires real Google Ads / GA4 and Meta Pixel beacons against this browser, using configured IDs;" }),
        h("li", { text: "shows you the exact payload, in third-person, before anything is appended." })
      ),
      h("p", { text: tagsLine(config) }),
      h("p", { text: "Browser history itself is not exposed to JavaScript — the Topics list is Chrome's projection of your history. Nothing you upload, nothing screenshotted." }),
      h("p", {}, beginButton),
      h("p", {}, h("a", { href: "wall/", text: "view the repository without appending" }))
    )
  );
}

async function main(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) return;
  showCollecting(root, "loading…");
  let config: Config;
  try {
    config = await fetchConfig();
  } catch {
    config = {
      adminEnabled: false,
      persistence: "unknown",
      adtech: {
        enabled: false,
        googleAds: { enabled: false, id: null, label: null },
        metaPixel: { enabled: false, id: null },
      },
    };
  }
  await showStart(root, config);
}

void main();
