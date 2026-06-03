// this person — consented industry-ad-tech read.
//
// One method. The visitor presses a single button, acknowledges a consent
// modal, then the page does exactly what any commercial site does on a normal
// page load: reads the browser fingerprint surface, fires real Google Ads /
// GA4 + Meta Pixel beacons, and renders a Google Ad Manager slot. The slot's
// slotRenderEnded event hands us the advertiserId/lineItemId/creativeId, which
// the worker resolves to display names via the GAM REST API. The result becomes
// a third-person wall entry.

import {
  apiBase,
  appendWebSignals,
  fetchConfig,
  googleDpPopupStartUrl,
  pollGoogleDpJob,
  resolveAdRender,
  type AdRenderRecord,
  type Config,
  type GoogleAdInterestCandidate,
  type ResolvedAdNames,
} from "./lib/api";
import {
  buildAppendPayload,
  collectWebSignals,
  type SignalsConfig,
  type SignalsReading,
} from "./lib/web-signals";
import { renderGamSlot, type GamSlotRender } from "./lib/gam-slot";
import { buildEntry } from "./lib/wall-render";
import { clear, h } from "./lib/dom";

type StepName = "collect" | "review" | "appended";

const STEPS: { id: StepName; label: string }[] = [
  { id: "collect", label: "expose surface" },
  { id: "review", label: "review payload" },
  { id: "appended", label: "append to repository" },
];

function stepIndicator(active: StepName): HTMLElement {
  const activeIndex = STEPS.findIndex((s) => s.id === active);
  return h(
    "ol",
    { class: "chamber-steps" },
    ...STEPS.map((step, index) => {
      let stateClass = "chamber-step";
      if (index === activeIndex) stateClass += " is-active";
      else if (index < activeIndex) stateClass += " is-done";
      return h(
        "li",
        { class: stateClass },
        h("span", { class: "chamber-step__n", text: String(index + 1) }),
        h("span", { text: step.label })
      );
    })
  );
}

function chamberPanel(...children: (Node | string | false | null | undefined)[]): HTMLElement {
  return h("section", { class: "chamber-panel" }, ...children);
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
  if (config.gam.enabled && config.gam.adUnitPath) {
    enabled.push("Google Ad Manager (" + config.gam.adUnitPath + ")");
  }
  if (enabled.length === 0) {
    return "No real ad-tech IDs are configured on this worker — only the browser-side reads will run.";
  }
  return "This page will fire these real industry tags against this browser: " + enabled.join(" + ") + ".";
}

function readingSection(title: string, lines: string[], emptyNote?: string): HTMLElement {
  return h(
    "section",
    { class: "chamber-panel" },
    h("h2", { class: "flow-title", text: title }),
    lines.length
      ? h(
          "ul",
          { class: "fragment-list" },
          ...lines.map((line) =>
            h(
              "li",
              { class: "fragment" },
              h("span", { class: "fragment__value", text: line })
            )
          )
        )
      : h("p", { class: "flow-text--small", text: emptyNote || "(nothing returned)" })
  );
}

function topicsBlock(reading: SignalsReading): HTMLElement {
  const lines = reading.topics.map((t) => t.label + " — " + t.path);
  const section = readingSection(
    "chrome topics",
    lines,
    "this browser did not return any Topics."
  );
  section.append(h("p", { class: "flow-text--small", text: reading.topicsNote }));
  return section;
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
  return readingSection(
    "client hints",
    lines,
    "this browser does not expose client hints — likely Safari or Firefox."
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
  return readingSection("fingerprint surface", lines);
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
  return readingSection("privacy signals + sandbox surface", lines);
}

function firedTagsBlock(reading: SignalsReading): HTMLElement {
  if (!reading.firedTags.length) {
    return h(
      "section",
      { class: "chamber-panel" },
      h("h2", { class: "flow-title", text: "industry tags fired" }),
      h("p", {
        class: "flow-text",
        text: "No real ad-tech IDs were configured, so no outbound beacons were sent. The browser-side reads above still happened.",
      })
    );
  }
  return h(
    "section",
    { class: "chamber-panel" },
    h("h2", { class: "flow-title", text: "industry tags fired against this browser" }),
    ...reading.firedTags.map((tag) =>
      h(
        "div",
        { class: "chamber-panel" },
        h(
          "p",
          { class: "flow-text" },
          (tag.network === "google" ? "Google Ads / GA4" : "Meta Pixel") + " — id " + tag.id + " — event " + tag.event
        ),
        h(
          "ul",
          { class: "fragment-list" },
          ...tag.endpoints.slice(0, 6).map((line) =>
            h(
              "li",
              { class: "fragment" },
              h("span", { class: "fragment__value", text: line })
            )
          )
        )
      )
    ),
    reading.thirdPartyHosts.length
      ? h("p", {
          class: "flow-text--small",
          text: "third-party hosts this page touched after consent: " + reading.thirdPartyHosts.join(", "),
        })
      : false
  );
}

interface AdResult {
  render: GamSlotRender;
  slotNode: HTMLElement;
  resolved: ResolvedAdNames;
}

function adResolutionLines(result: AdResult): string[] {
  const lines: string[] = [];
  const r = result.render;
  const advertisers = Object.values(result.resolved.advertisers).filter(Boolean);
  const lineItems = Object.values(result.resolved.lineItems).filter(Boolean);
  const orders = Object.values(result.resolved.orders).filter(Boolean);

  if (r.isEmpty) {
    lines.push("no advertiser bid — slot returned empty");
  }
  if (advertisers.length) {
    lines.push("advertiser: " + advertisers.join(", "));
  } else if (r.advertiserId) {
    lines.push("advertiser id: " + r.advertiserId + " (name unresolved)");
  }
  if (lineItems.length) lines.push("line item: " + lineItems.join(", "));
  if (orders.length) lines.push("order: " + orders.join(", "));
  if (r.creativeId) {
    const creativeName = result.resolved.creatives[r.creativeId];
    lines.push("creative: " + (creativeName || r.creativeId));
  }
  if (r.size) lines.push("size: " + r.size[0] + "×" + r.size[1]);
  if (r.thirdPartyHosts.length) {
    lines.push("touched hosts: " + r.thirdPartyHosts.slice(0, 6).join(", "));
  }
  return lines;
}

function adSlotPlaceholder(config: Config, ad: AdResult | null): HTMLElement {
  const placeholder = h("div", { class: "ad-slot-placeholder" });
  const primary = config.gam.sizes[0] || [300, 250];
  placeholder.style.minWidth = primary[0] + "px";
  placeholder.style.minHeight = primary[1] + "px";

  let label = "ad slot";
  let note = "";
  if (!config.gam.enabled) {
    label = "ad slot — GAM not configured";
    note =
      "Google Ad Manager is not configured on this worker. When it is, the real GAM creative renders here and the winning advertiser becomes an entry claim.";
  } else if (ad?.render.isEmpty) {
    label = "ad slot — no fill";
    note = "no advertiser bid for this impression. the slot was put up for auction and nothing cleared.";
  } else if (ad === null) {
    label = "ad slot — failed to render";
    note =
      "the slot did not render. an upstream block (ad blocker, network) prevented gpt.js from loading or the slot from filling.";
  } else {
    label = "ad slot — empty";
  }

  placeholder.appendChild(h("p", { class: "ad-slot-placeholder__label", text: label }));
  placeholder.appendChild(
    h("p", { class: "ad-slot-placeholder__dim", text: primary[0] + " × " + primary[1] })
  );
  if (note) {
    placeholder.appendChild(h("p", { class: "ad-slot-placeholder__note", text: note }));
  }
  return placeholder;
}

function adSlotBlock(config: Config, ad: AdResult | null): HTMLElement {
  const wrapper = h(
    "section",
    { class: "chamber-panel" },
    h("h2", { class: "flow-title", text: "the ad Google served to this person" }),
    h("p", {
      class: "flow-text--small",
      text:
        "the real creative GAM returns for this slot. its bidder, line item, and brand are what end up in the entry.",
    })
  );

  const frame = h("div", { class: "ad-slot-frame" });
  const liveSlot = ad?.slotNode && !ad.render.isEmpty ? ad.slotNode : null;
  if (liveSlot) {
    frame.appendChild(liveSlot);
  } else {
    frame.appendChild(adSlotPlaceholder(config, ad));
  }
  wrapper.appendChild(frame);

  const lines = ad ? adResolutionLines(ad) : [];
  if (lines.length) {
    wrapper.appendChild(
      h(
        "ul",
        { class: "fragment-list" },
        ...lines.map((line) =>
          h(
            "li",
            { class: "fragment" },
            h("span", { class: "fragment__value", text: line })
          )
        )
      )
    );
  }
  return wrapper;
}

interface CollectingView {
  panel: HTMLElement;
  adFrame: HTMLElement | null;
}

function showCollecting(root: HTMLElement, message: string, adStage?: HTMLElement): CollectingView {
  clear(root);
  const panel = chamberPanel(
    stepIndicator("collect"),
    h("h1", { class: "flow-title", text: "exposing the surface" }),
    h("p", { class: "flow-working", text: message })
  );
  let adFrame: HTMLElement | null = null;
  if (adStage) {
    adFrame = h("div", { class: "ad-slot-frame" });
    adFrame.appendChild(adStage);
    panel.appendChild(adFrame);
  }
  root.append(panel);
  return { panel, adFrame };
}

function showFailure(root: HTMLElement, message: string, retry: () => void): void {
  clear(root);
  root.append(
    chamberPanel(
      h("h1", { class: "flow-title", text: "extraction failed" }),
      h("p", { class: "flow-text", text: message }),
      h("p", { class: "flow-text--small", text: "nothing was appended." }),
      h(
        "div",
        { class: "flow-actions" },
        h("button", {
          class: "action action--primary",
          type: "button",
          text: "start again",
          onClick: retry,
        }),
        h("a", { class: "action action--quiet", href: "wall/", text: "view the repository" }),
        h("a", { class: "action action--quiet", href: "/", text: "home" })
      )
    )
  );
}

function adLinesList(lines: string[]): HTMLElement {
  return h(
    "ul",
    { class: "fragment-list" },
    ...lines.map((line) =>
      h(
        "li",
        { class: "fragment" },
        h("span", { class: "fragment__value", text: line })
      )
    )
  );
}

function preparePreservedAdFrame(
  frame: HTMLElement,
  config: Config,
  ad: AdResult | null
): void {
  const liveSlot = ad?.slotNode && !ad.render.isEmpty && frame.contains(ad.slotNode)
    ? ad.slotNode
    : null;
  if (liveSlot) return;
  clear(frame);
  frame.appendChild(adSlotPlaceholder(config, ad));
}

function showReview(
  root: HTMLElement,
  config: Config,
  reading: SignalsReading,
  ad: AdResult | null,
  google: GoogleController,
  preservedAdFrame?: HTMLElement | null
): void {
  const payload = buildAppendPayload(reading);
  if (ad) payload.adRender = ad.render;

  // Preview claims: combine topics + resolved brand names so the visitor sees
  // the "likes" shape before pressing append. The server rewrites these on
  // append from the validated fragment list.
  const previewClaims: Array<{
    sentence: string;
    sourceNote: string;
    fragments: string[];
    intensity: "banal" | "aspirational" | "contradictory" | "institutional" | "ugly" | "intimate";
  }> = [];

  for (const t of reading.topics.slice(0, 4)) {
    previewClaims.push({
      sentence: "this person likes " + t.label,
      sourceNote: "Chrome Topics API (taxonomy v2)",
      fragments: [t.label],
      intensity: "banal",
    });
  }

  if (ad) {
    for (const name of Object.values(ad.resolved.advertisers).filter(Boolean)) {
      previewClaims.push({
        sentence: "this person likes " + name,
        sourceNote: "Google Ad Manager: advertiser bid",
        fragments: [name],
        intensity: "banal",
      });
    }
    if (ad.render.isEmpty && Object.keys(ad.resolved.advertisers).length === 0) {
      previewClaims.push({
        sentence: "this person was not worth bidding on",
        sourceNote: "Google Ad Manager: no fill",
        fragments: [],
        intensity: "institutional",
      });
    }
    for (const host of ad.render.thirdPartyHosts.slice(0, 3)) {
      const clean = host.replace(/^www\./, "");
      if (clean.endsWith("doubleclick.net") || clean.endsWith("googlesyndication.com")) continue;
      previewClaims.push({
        sentence: "this person triggered loads from " + clean,
        sourceNote: "ad iframe network traffic",
        fragments: [clean],
        intensity: "institutional",
      });
    }
  }

  if (reading.firedTags.some((t) => t.network === "google")) {
    previewClaims.push({
      sentence: "this person was just shown to Google Ads",
      sourceNote: "GA4 page_view + custom event",
      fragments: ["Google Ads"],
      intensity: "institutional",
    });
  }
  if (reading.firedTags.some((t) => t.network === "meta")) {
    previewClaims.push({
      sentence: "this person was just shown to Meta",
      sourceNote: "Meta Pixel PageView",
      fragments: ["Meta"],
      intensity: "institutional",
    });
  }

  const appendButton = h("button", {
    class: "action action--primary action--large",
    type: "button",
    text: "append to the repository",
  }) as HTMLButtonElement;
  const message = h("p", { class: "flow-text", text: "" });

  appendButton.addEventListener("click", async () => {
    appendButton.disabled = true;
    appendButton.textContent = "appending…";
    const selection = google.getSelection();
    const body = selection
      ? { ...payload, googleJobId: selection.jobId, candidateIds: selection.candidateIds }
      : payload;
    try {
      const person = await appendWebSignals(body);
      clear(root);
      root.append(
        chamberPanel(
          stepIndicator("appended"),
          h("h1", { class: "flow-title", text: "this person has been appended." }),
          h("p", { class: "flow-done-id", text: "this person #" + person.id }),
          buildEntry(person.id, person.source, person.claims, { summary: person.extractionSummary }),
          h(
            "div",
            { class: "flow-actions" },
            h("a", { class: "action action--primary", href: "wall/", text: "view the repository" }),
            h("a", { class: "action action--quiet", href: "/", text: "home" }),
            h("a", { class: "action action--quiet", href: "./", text: "do this again with a different browser" })
          )
        )
      );
    } catch (err) {
      appendButton.disabled = false;
      appendButton.textContent = "append to the repository";
      message.textContent = "append failed: " + ((err as Error)?.message || "unknown");
    }
  });

  const introNodes = [
    stepIndicator("review"),
    h("h1", { class: "flow-title", text: "this is what the industry just saw" }),
    h("p", {
      class: "flow-text",
      text: "Everything below was read from this browser, sent out from it, or served to it in the last few seconds. Review and append, or close the tab and nothing public happens.",
    }),
    h("h2", { class: "flow-title", text: "the ad Google served to this person" }),
    h("p", {
      class: "flow-text--small",
      text:
        "the real creative GAM returns for this slot. its bidder, line item, and brand are what end up in the entry.",
    }),
  ];

  const adLines = ad ? adResolutionLines(ad) : [];
  const tailNodes: (Node | false)[] = [
    adLines.length ? adLinesList(adLines) : false,
    topicsBlock(reading),
    clientHintsBlock(reading),
    fingerprintBlock(reading),
    privacyBlock(reading),
    firedTagsBlock(reading),
    google.enabled ? google.el : false,
    h(
      "section",
      { class: "chamber-panel" },
      h("h2", { class: "flow-title", text: "preview of the public entry" }),
      previewClaims.length
        ? buildEntry("####", "ad_preferences_surface", previewClaims, {
            summary: "preview — the worker rewrites these claims on append from the validated fragment list. anything you check in the Google panel is merged in too.",
          })
        : h("p", { class: "flow-text--small", text: "nothing extracted yet from the browser surface — the Google panel above can still add claims." })
    ),
    previewClaims.length || google.enabled
      ? h("div", { class: "flow-actions" }, appendButton)
      : h("p", { class: "flow-text--small", text: "no claims could be drawn from this browser's surface." }),
    message,
    h(
      "div",
      { class: "flow-actions" },
      h("a", { class: "action action--quiet", href: "wall/", text: "view the repository" }),
      h("a", { class: "action action--quiet", href: "/", text: "home" }),
      h("a", { class: "action action--quiet", href: "./", text: "start over" })
    ),
  ];

  if (preservedAdFrame?.isConnected && root.contains(preservedAdFrame)) {
    const panel = preservedAdFrame.parentElement;
    if (panel) {
      for (const child of [...panel.childNodes]) {
        if (child !== preservedAdFrame) child.remove();
      }
      panel.className = "flow-panel";
      preparePreservedAdFrame(preservedAdFrame, config, ad);
      for (const node of introNodes) {
        panel.insertBefore(node, preservedAdFrame);
      }
      for (const node of tailNodes) {
        if (node) panel.appendChild(node);
      }
      return;
    }
  }

  clear(root);
  root.append(
    h(
      "div",
      { class: "flow-panel" },
      ...introNodes.slice(0, 3),
      adSlotBlock(config, ad),
      ...tailNodes
    )
  );

  void config;
}

async function runUnifiedFlow(root: HTMLElement, config: Config): Promise<void> {
  // The Google popup MUST open synchronously in this user-gesture turn (this
  // function is called directly from the consent button's click), or the
  // browser blocks it. Open it first, then run the silent reads; both proceed
  // concurrently and converge in the one combined review.
  const google = startGooglePopup(config);

  const shouldRenderGam = !!(config.gam.enabled && config.gam.networkCode && config.gam.adUnitPath);
  const slotStage = shouldRenderGam ? h("div", { class: "ad-slot-stage" }) : null;
  const collectingView = showCollecting(
    root,
    "asking the browser what it tells advertisers…",
    slotStage || undefined
  );

  // Run web-signals collection and the GAM slot render in parallel. The slot
  // needs to be visible when GPT evaluates it, so the collect panel owns a
  // real slot frame and the review panel adopts the live node after render.

  let signals: SignalsReading | null = null;
  let ad: AdResult | null = null;

  const signalsTask = collectWebSignals(signalsConfigFromConfig(config))
    .then((reading) => {
      signals = reading;
    })
    .catch((err) => {
      throw new Error("collect_failed:" + ((err as Error)?.message || "unknown"));
    });

  const adTask =
    shouldRenderGam && slotStage
      ? renderGamSlot(slotStage, {
          networkCode: config.gam.networkCode as string,
          adUnitPath: config.gam.adUnitPath as string,
          sizes: config.gam.sizes,
        })
          .then(async (render) => {
            const resolved = await resolveAdRender(render);
            ad = {
              render,
              slotNode: slotStage.firstElementChild as HTMLElement,
              resolved,
            };
          })
          .catch(() => {
            // ad failure should not block append; the entry just has no
            // brand-from-ad row
            ad = null;
          })
      : Promise.resolve();

  try {
    await Promise.all([signalsTask, adTask]);
  } catch (err) {
    slotStage?.remove();
    google.cancel();
    showFailure(root, (err as Error)?.message || "the collection step failed.", () =>
      showStart(root, config)
    );
    return;
  }

  if (!signals) {
    slotStage?.remove();
    google.cancel();
    showFailure(root, "the collection step returned nothing.", () => showStart(root, config));
    return;
  }

  showReview(root, config, signals, ad, google, collectingView.adFrame);
}

function showConsentModal(
  config: Config,
  onAccept: () => void,
  onCancel: () => void
): void {
  const overlay = h("div", {
    class: "consent-overlay",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "consent-title",
  });
  const list = h(
    "ul",
    { class: "consent-list" },
    h("li", {}, "reports whether Chrome's ", h("strong", { text: "Topics" }),
        " surface can be read from this origin."),
    h("li", {}, "reads ", h("strong", { text: "client hints, fingerprint, and Privacy-Sandbox surface" }), "."),
    h("li", {}, "fires real ", h("strong", { text: "Google Ads / GA4 + Meta Pixel" }), " beacons against this browser."),
    config.gam.enabled
      ? h("li", {}, "renders a real ", h("strong", { text: "Google Ad Manager slot" }),
          " and resolves the winning advertiser to its display name via the GAM API.")
      : false,
    config.googleDp.enabled
      ? h("li", {}, "opens a ", h("strong", { text: "Google sign-in in a small window" }),
          " so it can also read what your account hands over — ", h("strong", { text: "YouTube subscriptions + likes and your profile demographics" }), ".")
      : false,
    h("li", {}, "publishes a third-person entry on a ", h("strong", { text: "public" }),
        " wall keyed to a number, not to your identity.")
  );

  const expectations = h(
    "ul",
    { class: "consent-list consent-list--quiet" },
    h("li", {}, h("strong", { text: "What this is not: " }),
      "the silent reads cannot reach your Google profile, your purchase history, or what other sites know about you — pixel and gtag are write-only. The only way account data enters this is the Google sign-in, which you complete yourself and can skip."),
    h("li", {}, h("strong", { text: "Specificity is best-effort: " }),
      "expect device rows at minimum. ‘this person likes Patagonia’-style rows only appear when GAM returns a bid with a resolvable advertiser, or when an explicitly enabled Topics probe returns something narrow."),
    h("li", {}, h("strong", { text: "Persistence: " }),
      "appended entries are permanent and public on this site. There is no delete-after-append."),
    h("li", {}, h("strong", { text: "What is not stored: " }),
      "your IP, user agent, OAuth tokens, or raw fingerprint values. Only the third-person entry the worker generates from the validated fragments.")
  );

  const dialog = h(
    "div",
    { class: "consent-dialog" },
    h("h2", { class: "consent-title", id: "consent-title", text: "consent" }),
    h("p", { class: "flow-text", text: "Before any beacon fires, here is what the next ten seconds will do:" }),
    list,
    expectations,
    h(
      "div",
      { class: "flow-actions" },
      h("button", {
        class: "action",
        type: "button",
        text: "leave",
        onClick: () => {
          overlay.remove();
          onCancel();
        },
      }),
      h("button", {
        class: "action action--primary",
        type: "button",
        text: "i understand — begin extraction",
        onClick: () => {
          overlay.remove();
          onAccept();
        },
      })
    )
  );

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const focusable = dialog.querySelectorAll<HTMLElement>("button");
  focusable[focusable.length - 1]?.focus();

  function escapeHandler(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", escapeHandler);
      onCancel();
    }
  }
  document.addEventListener("keydown", escapeHandler);
}

function showStart(root: HTMLElement, config: Config): void {
  clear(root);

  const beginButton = h("button", {
    class: "action action--primary action--large",
    type: "button",
    text: "begin extraction",
    onClick: () => {
      showConsentModal(
        config,
        () => {
          void runUnifiedFlow(root, config);
        },
        () => {
          // user backed out; leave them on the landing
        }
      );
    },
  });

  root.append(
    h(
      "section",
      { class: "hero" },
      h("h1", { class: "hero__title", text: "this person" }),
      h(
        "p",
        { class: "hero__core" },
        "digital advertising infrastructure made visible",
      ),
      h("p", {
        class: "hero__secondary",
        text: "ads, topics, and identity, anonymized and consented to",
      }),
      h("p", { class: "flow-text--small", text: tagsLine(config) }),
      h("div", { class: "flow-actions" }, beginButton),
      h("a", { class: "hero__link", href: "wall/", text: "view the repository" }),
      h("a", { class: "hero__link", href: "/", text: "home" })
    )
  );
}

function currentReturnTo(): string {
  return location.origin + location.pathname + location.search;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function googleErrorText(code: string): string {
  switch (code) {
    case "access_denied":
      return "you declined the Google sign-in, so nothing from your account was read.";
    case "unconfigured":
      return "the Google sign-in is not configured on this worker.";
    case "rate_limited":
      return "too many Google attempts just now — wait a moment and retry.";
    case "bad_state":
    case "bad_cookie":
      return "the sign-in round-trip expired or did not match. retry.";
    case "popup_blocked":
      return "the sign-in window was blocked. allow popups for this site and retry.";
    case "closed":
      return "the sign-in window closed before finishing.";
    case "timeout":
      return "Google did not answer in time. retry.";
    case "network":
      return "the connection to the worker dropped while reading your account.";
    default:
      return "the Google sign-in did not complete (" + code + ").";
  }
}

// Renders the checkbox list of Google candidates; toggling mutates `selected`.
function googleCandidateList(
  candidates: GoogleAdInterestCandidate[],
  selected: Set<string>
): HTMLElement {
  const rows = candidates.map((candidate) => {
    const checkbox = h("input", {
      type: "checkbox",
      class: "google-candidate__check",
    }) as HTMLInputElement;
    checkbox.checked = selected.has(candidate.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selected.add(candidate.id);
      else selected.delete(candidate.id);
    });
    return h(
      "li",
      { class: "google-candidate" },
      h(
        "label",
        { class: "google-candidate__label" },
        checkbox,
        h("span", { class: "google-candidate__claim", text: candidate.claimSentence })
      ),
      h("p", {
        class: "flow-text--small",
        text: candidate.sourceNote + (candidate.evidenceTitle ? " — " + candidate.evidenceTitle : ""),
      })
    );
  });
  return h("ul", { class: "google-candidate-list" }, ...rows);
}

type GoogleState = "disabled" | "pending" | "ready" | "empty" | "skipped" | "failed";

// The Google account read runs in a popup so the main page never navigates.
// The controller owns the popup lifecycle, a live section node for the review,
// and the visitor's candidate selection. It degrades gracefully: if the popup
// is blocked, times out, errors, or the account/region can't, the section says
// so and the single append simply proceeds with the silent read.
interface GoogleController {
  enabled: boolean;
  el: HTMLElement;
  getSelection(): { jobId: string; candidateIds: string[] } | null;
  cancel(): void;
}

function startGooglePopup(config: Config): GoogleController {
  const el = h("section", { class: "chamber-panel google-section" });
  const selected = new Set<string>();

  if (!config.googleDp.enabled) {
    return { enabled: false, el, getSelection: () => null, cancel: () => {} };
  }

  let state: GoogleState = "pending";
  let jobId = "";
  let errorCode = "";
  let candidates: GoogleAdInterestCandidate[] = [];
  let popup: Window | null = null;
  let popupTimer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const apiOrigin = (() => {
    try {
      return new URL(apiBase()).origin;
    } catch {
      return "";
    }
  })();

  function retryButton(label: string): HTMLElement {
    return h(
      "div",
      { class: "flow-actions" },
      h("button", {
        class: "action action--link",
        type: "button",
        text: label,
        onClick: () => openPopup(),
      })
    );
  }

  const render = (): void => {
    clear(el);
    el.append(h("h2", { class: "flow-title", text: "what your Google account hands over" }));
    if (state === "pending") {
      el.append(
        h("p", { class: "flow-working", text: "waiting for Google sign-in in the popup window…" }),
        h("p", {
          class: "flow-text--small",
          text: "finish signing in there and this fills with your YouTube subscriptions + likes and profile demographics. you can append without it.",
        }),
        retryButton("open the sign-in window again")
      );
      return;
    }
    if (state === "ready") {
      el.append(
        h("p", {
          class: "flow-text--small",
          text: "pulled live from your account on consent. uncheck anything you don't want published.",
        }),
        googleCandidateList(candidates, selected)
      );
      return;
    }
    if (state === "empty") {
      el.append(
        h("p", {
          class: "flow-text--small",
          text: "Google returned nothing readable — little YouTube activity, or no profile fields set. appending the browser read only.",
        })
      );
      return;
    }
    el.append(
      h("p", {
        class: "flow-text--small",
        text:
          state === "skipped"
            ? "Google sign-in was not completed. appending the browser read only."
            : googleErrorText(errorCode),
      }),
      retryButton("try the Google sign-in")
    );
  };

  const poll = async (id: string): Promise<void> => {
    const startedAt = Date.now();
    const maxMs = 90 * 1000;
    for (;;) {
      let result;
      try {
        result = await pollGoogleDpJob(id);
      } catch {
        state = "failed";
        errorCode = "network";
        render();
        return;
      }
      if (result.state === "in_progress") {
        if (Date.now() - startedAt > maxMs) {
          state = "failed";
          errorCode = "timeout";
          render();
          return;
        }
        await delay(1500);
        continue;
      }
      if (result.state === "failed") {
        state = "failed";
        errorCode = result.error || "failed";
        render();
        return;
      }
      if (result.state === "empty") {
        state = "empty";
        render();
        return;
      }
      candidates = result.candidates;
      for (const candidate of candidates) selected.add(candidate.id);
      jobId = id;
      state = "ready";
      render();
      return;
    }
  };

  const onMessage = (ev: MessageEvent): void => {
    if (apiOrigin && ev.origin !== apiOrigin) return;
    const data = ev.data as { type?: string; jobId?: string; error?: string } | null;
    if (!data || data.type !== "this-person-google") return;
    done = true;
    if (popupTimer) clearTimeout(popupTimer);
    if (data.error) {
      state = "failed";
      errorCode = data.error;
      render();
      return;
    }
    if (data.jobId) {
      state = "pending";
      render();
      void poll(data.jobId);
    }
  };

  function openPopup(): void {
    done = false;
    window.addEventListener("message", onMessage);
    popup = window.open(
      googleDpPopupStartUrl(currentReturnTo()),
      "tp_google",
      "popup,width=480,height=760"
    );
    if (!popup) {
      state = "skipped";
      errorCode = "popup_blocked";
      render();
      return;
    }
    state = "pending";
    render();
    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = setTimeout(() => {
      if (done || state !== "pending") return;
      state = "skipped";
      errorCode = "timeout";
      render();
    }, 90 * 1000);
  }

  openPopup();

  return {
    enabled: true,
    el,
    getSelection: () =>
      state === "ready" && jobId && selected.size > 0
        ? { jobId, candidateIds: [...selected] }
        : null,
    cancel: () => {
      window.removeEventListener("message", onMessage);
      if (popupTimer) clearTimeout(popupTimer);
      try {
        popup?.close();
      } catch {
        // ignore
      }
    },
  };
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
      gam: { enabled: false, networkCode: null, adUnitPath: null, sizes: [[300, 250]] },
      googleDp: { enabled: false },
    };
  }

  showStart(root, config);
}

void main();
