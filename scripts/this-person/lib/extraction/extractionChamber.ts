// this person — the extraction chamber.
// A procedural, infrastructural UI that routes a participant through one of the
// extraction methods, shows the extracted material, generates the portrait,
// and appends it to the repository. Failed or canceled attempts surface a
// private state and never append.

import type {
  ExtractedFragment,
  ExtractedPerson,
  ExtractionSource,
} from "../../../../worker/src/this-person/types";
import { normalizeText } from "../../../../worker/src/this-person/extraction/normalizeText";
import { extractFragments } from "../../../../worker/src/this-person/extraction/extractFragments";
import { detectPlatforms } from "../../../../worker/src/this-person/extraction/detectPlatform";
import { classifyFragment } from "../../../../worker/src/this-person/extraction/classifyFragment";
import { redactText, isRedactedEmpty } from "../../../../worker/src/this-person/extraction/redactIdentifiers";

import { h, clear } from "../dom";
import type { Config, PreviewResult } from "../api";
import { appendPerson, requestPreview } from "../api";
import { requestBrowserTopics } from "../topics";
import { enterReturnLoop } from "../adtechReturnLoop";
import { ocrImage, terminateOcr } from "./ocr";
import { startScreenCapture, screenCaptureSupported, type ScreenCaptureSession } from "./screenCapture";
import { checkImageFile, IMAGE_ACCEPT } from "./screenshotUpload";
import { ingestArchive } from "./archiveIngest";
import type { ExtensionPayload } from "./importPayload";

export type MethodId =
  | "screen_capture"
  | "screenshot_ocr"
  | "data_export"
  | "browser_topics"
  | "manual_operator_entry";

export interface ChamberOptions {
  config: Config;
  methods: MethodId[];
  emphasis?: MethodId;
  initialPayload?: ExtensionPayload | null;
  // Relative href to the wall from the page hosting the chamber — the landing
  // route and the deeper routes sit at different depths.
  wallHref: string;
  onAppended?: (person: ExtractedPerson) => void;
}

const METHOD_LABELS: Record<MethodId, string> = {
  screen_capture: "extract from screen",
  screenshot_ocr: "extract from screenshot",
  data_export: "extract from data archive",
  browser_topics: "extract from browser topics",
  manual_operator_entry: "operator entry",
};

const METHOD_NOTES: Record<MethodId, string> = {
  screen_capture: "show the extractor an ad-preference or profile page on your screen.",
  screenshot_ocr: "upload screenshots of the profile they made of you.",
  data_export: "upload the archive a platform built about you.",
  browser_topics: "ask this browser for the advertising topics it will admit to.",
  manual_operator_entry: "operator repair: paste extracted fragments by hand.",
};

const STEPS = ["expose surface", "read surface", "select fragments", "generate person", "append to repository"];

export function mountExtractionChamber(root: HTMLElement, options: ChamberOptions): void {
  let captureSession: ScreenCaptureSession | null = null;
  let pipelineSource: ExtractionSource = "screenshot_ocr";
  let pipelineHints: string[] = [];
  let candidates: ExtractedFragment[] = [];
  let preview: PreviewResult | null = null;
  let lastPerson: ExtractedPerson | null = null;

  function show(node: HTMLElement): void {
    clear(root);
    root.append(node);
    if (typeof root.scrollTo === "function") root.scrollTo(0, 0);
  }

  function panel(step: number, ...children: (Node | string | false | null)[]): HTMLElement {
    const bar = h(
      "ol",
      { class: "chamber-steps" },
      ...STEPS.map((label, index) =>
        h("li", { class: "chamber-step" + (index === step ? " is-active" : index < step ? " is-done" : "") },
          h("span", { class: "chamber-step__n", text: String(index + 1) }),
          h("span", { class: "chamber-step__label", text: label })
        )
      )
    );
    return h("section", { class: "chamber-panel" }, step >= 0 ? bar : false, ...children);
  }

  function showWorking(message: string): HTMLElement {
    const line = h("p", { class: "flow-working", text: message });
    show(panel(1, line, h("p", { class: "flow-text flow-text--small", text: "the extraction is running in front of you." })));
    return line;
  }

  function showPrivateFailure(title: string, detail: string): void {
    // A private failure. It is never appended to the repository.
    cleanupCapture();
    show(
      panel(-1,
        h("h2", { class: "flow-title", text: title }),
        h("p", { class: "flow-text", text: detail }),
        h("p", { class: "flow-text flow-text--small", text: "nothing was extracted. nothing was appended." }),
        h("div", { class: "flow-actions" },
          h("button", { class: "action action--primary", type: "button", text: "choose another method", onClick: showMethods })
        )
      )
    );
  }

  function cleanupCapture(): void {
    if (captureSession) {
      captureSession.stop();
      captureSession = null;
    }
  }

  // ── consent ────────────────────────────────────────────────────────────────
  function showConsent(): void {
    const body = [
      "This work extracts visible advertising and profile data that you choose to expose.",
      "You may show it a screenshot, a screen, a browser tab, or an account-data archive.",
      "The extraction happens in front of you. The portrait is shown to you before it is appended. The repository contains only people who choose extraction.",
      "Do not expose anything you do not want transformed into a public ‘this person’ entry.",
    ].map((line) => h("p", { class: "flow-text", text: line }));
    show(
      panel(-1,
        h("h2", { class: "flow-title", text: "consent" }),
        ...body,
        h("div", { class: "flow-actions" },
          h("button", { class: "action", type: "button", text: "leave", onClick: () => { location.href = "/"; } }),
          h("button", { class: "action action--primary", type: "button", text: "begin extraction", onClick: afterConsent })
        )
      )
    );
  }

  function afterConsent(): void {
    if (options.initialPayload) {
      pipelineSource = "active_tab_extension";
      pipelineHints = options.initialPayload.platformHint ? [options.initialPayload.platformHint] : [];
      showReviewText(options.initialPayload.extractedText, "active_tab_extension");
    } else {
      showMethods();
    }
  }

  // ── method selection ───────────────────────────────────────────────────────
  function showMethods(): void {
    cleanupCapture();
    const ordered = options.methods.slice();
    if (options.emphasis && ordered.includes(options.emphasis)) {
      ordered.sort((a, b) => (a === options.emphasis ? -1 : b === options.emphasis ? 1 : 0));
    }
    const buttons = ordered.map((id) =>
      h("button", { class: "method", type: "button", onClick: () => startMethod(id) },
        h("span", { class: "method__label", text: METHOD_LABELS[id] }),
        h("span", { class: "method__note", text: METHOD_NOTES[id] })
      )
    );
    show(
      panel(0,
        h("h2", { class: "flow-title", text: "extraction methods" }),
        h("p", { class: "flow-text", text: "choose how to expose the surface to the extractor." }),
        h("div", { class: "method-list" }, ...buttons)
      )
    );
  }

  function startMethod(id: MethodId): void {
    pipelineSource = id === "manual_operator_entry" ? "manual_operator_entry" : id;
    pipelineHints = [];
    if (id === "screen_capture") startScreen();
    else if (id === "screenshot_ocr") showScreenshotPanel();
    else if (id === "data_export") showArchivePanel();
    else if (id === "browser_topics") runBrowserTopics();
    else if (id === "manual_operator_entry") showOperatorPanel();
  }

  // ── method 1: screen capture ───────────────────────────────────────────────
  function startScreen(): void {
    if (!screenCaptureSupported()) {
      showPrivateFailure("this browser cannot capture the screen", "the Screen Capture API is unavailable here. try the screenshot method instead.");
      return;
    }
    const frames: Blob[] = [];
    const status = h("p", { class: "flow-text flow-text--small", text: "no frames captured yet." });
    const preview = h("div", { class: "capture-preview" });

    const captureBtn = h("button", { class: "action", type: "button", text: "capture visible surface", disabled: "" }) as HTMLButtonElement;
    const readBtn = h("button", { class: "action action--primary", type: "button", text: "read surface", disabled: "" }) as HTMLButtonElement;

    captureBtn.addEventListener("click", async () => {
      if (!captureSession) return;
      try {
        const blob = await captureSession.captureFrame();
        frames.push(blob);
        status.textContent = frames.length + (frames.length === 1 ? " frame captured." : " frames captured.");
        readBtn.disabled = false;
      } catch {
        showPrivateFailure("the capture stopped", "the shared surface ended before a frame could be taken.");
      }
    });

    readBtn.addEventListener("click", async () => {
      cleanupCapture();
      if (frames.length === 0) return;
      const text = await ocrFrames(frames, "frame");
      showReviewText(text, "screen_capture");
    });

    const exposeBtn = h("button", { class: "action action--primary", type: "button", text: "expose surface" }) as HTMLButtonElement;
    exposeBtn.addEventListener("click", async () => {
      exposeBtn.disabled = true;
      try {
        captureSession = await startScreenCapture();
      } catch (err) {
        const reason = err instanceof Error ? err.message : "";
        if (reason === "capture_canceled") showMethods();
        else showPrivateFailure("the screen was not exposed", "no surface was shared with the extractor.");
        return;
      }
      captureSession.video.className = "capture-video";
      clear(preview);
      preview.append(captureSession.video);
      captureBtn.disabled = false;
      exposeBtn.textContent = "surface exposed";
    });

    show(
      panel(0,
        h("h2", { class: "flow-title", text: "extract from screen" }),
        h("p", { class: "flow-text", text: "open your ad-preference or profile page, then expose it to the extractor. your browser's own picker decides what is shared." }),
        h("div", { class: "flow-actions" }, exposeBtn),
        preview,
        status,
        h("div", { class: "flow-actions" }, captureBtn, readBtn),
        h("div", { class: "flow-actions" },
          h("button", { class: "action action--quiet", type: "button", text: "back", onClick: showMethods })
        )
      )
    );
  }

  async function ocrFrames(blobs: Blob[], label: string): Promise<string> {
    const parts: string[] = [];
    for (let i = 0; i < blobs.length; i++) {
      const line = showWorking("reading " + label + " " + (i + 1) + " of " + blobs.length + "…");
      try {
        const text = await ocrImage(blobs[i], (status, progress) => {
          line.textContent =
            "reading " + label + " " + (i + 1) + " of " + blobs.length +
            " — " + status + " " + Math.round(progress * 100) + "%";
        });
        parts.push(text);
      } catch {
        // one unreadable surface does not fail the whole extraction
      }
    }
    await terminateOcr();
    return parts.join("\n");
  }

  // ── method 2: screenshot OCR ───────────────────────────────────────────────
  function showScreenshotPanel(): void {
    const files: File[] = [];
    const thumbs = h("div", { class: "thumb-row" });
    const status = h("p", { class: "flow-text flow-text--small", text: "no screenshots selected." });
    const readBtn = h("button", { class: "action action--primary", type: "button", text: "read screenshots", disabled: "" }) as HTMLButtonElement;
    const input = h("input", { class: "file-input", type: "file", accept: IMAGE_ACCEPT, multiple: "" }) as HTMLInputElement;

    input.addEventListener("change", () => {
      for (const file of Array.from(input.files || [])) {
        const check = checkImageFile(file);
        if (!check.ok) continue;
        files.push(file);
        const img = h("img", { class: "thumb", alt: "screenshot for extraction" }) as HTMLImageElement;
        img.src = URL.createObjectURL(file);
        thumbs.append(img);
      }
      status.textContent = files.length === 0
        ? "no usable screenshots selected."
        : files.length + (files.length === 1 ? " screenshot ready." : " screenshots ready.");
      readBtn.disabled = files.length === 0;
    });

    readBtn.addEventListener("click", async () => {
      if (files.length === 0) return;
      const text = await ocrFrames(files, "screenshot");
      showReviewText(text, "screenshot_ocr");
    });

    show(
      panel(0,
        h("h2", { class: "flow-title", text: "extract from screenshot" }),
        h("p", { class: "flow-text", text: "upload screenshots of the profile they made of you — an ad-preference or personalization page works best." }),
        h("label", { class: "file-label" },
          h("span", { class: "file-label__text", text: "choose screenshots" }),
          input
        ),
        thumbs,
        status,
        h("div", { class: "flow-actions" },
          h("button", { class: "action action--quiet", type: "button", text: "back", onClick: showMethods }),
          readBtn
        )
      )
    );
  }

  // ── method 3: data archive ─────────────────────────────────────────────────
  function showArchivePanel(): void {
    const status = h("p", { class: "flow-text flow-text--small", text: "no archive selected." });
    const readBtn = h("button", { class: "action action--primary", type: "button", text: "receive the page they could have made", disabled: "" }) as HTMLButtonElement;
    const input = h("input", { class: "file-input", type: "file", accept: ".zip,.json,.csv,.tsv,.txt,.html,.htm,.xml" }) as HTMLInputElement;
    let chosen: File | null = null;

    input.addEventListener("change", () => {
      chosen = (input.files && input.files[0]) || null;
      status.textContent = chosen ? "selected: " + chosen.name : "no archive selected.";
      readBtn.disabled = !chosen;
    });

    readBtn.addEventListener("click", async () => {
      if (!chosen) return;
      showWorking("walking the archive for advertising data…");
      try {
        const result = await ingestArchive(chosen);
        if (!result.text.trim()) {
          showPrivateFailure("no extractable data found", "the archive held no advertising or profile text the extractor could read.");
          return;
        }
        showReviewText(result.text, "data_export");
      } catch (err) {
        const reason = err instanceof Error ? err.message : "";
        showPrivateFailure(
          "the archive could not be read",
          reason === "archive_too_large"
            ? "the archive is larger than this extractor accepts."
            : "the archive could not be opened or contained no readable files."
        );
      }
    });

    show(
      panel(0,
        h("h2", { class: "flow-title", text: "extract from data archive" }),
        h("p", { class: "flow-text", text: "upload the archive a platform built about you — a Google, Meta, or Amazon export (ZIP, JSON, HTML, CSV, TXT). it is read in your browser and never uploaded." }),
        h("label", { class: "file-label" },
          h("span", { class: "file-label__text", text: "choose archive" }),
          input
        ),
        status,
        h("div", { class: "flow-actions" },
          h("button", { class: "action action--quiet", type: "button", text: "back", onClick: showMethods }),
          readBtn
        )
      )
    );
  }

  // ── method 4: browser topics (minor source) ────────────────────────────────
  async function runBrowserTopics(): Promise<void> {
    showWorking("asking the browser for advertising topics…");
    const result = await requestBrowserTopics();
    if (!result) {
      showPrivateFailure(
        "the browser admitted to nothing",
        "this browser exposed no advertising topics. that is the usual answer — and not an entry."
      );
      return;
    }
    pipelineSource = "browser_topics";
    pipelineHints = result.platformHints;
    candidates = result.fragments;
    showReviewFragments();
  }

  // ── method 5: operator entry ───────────────────────────────────────────────
  function showOperatorPanel(): void {
    const textarea = h("textarea", { class: "flow-textarea", rows: "8",
      placeholder: "one extracted fragment per line\n/ Home & Garden / Furniture\nStarbucks" }) as HTMLTextAreaElement;
    show(
      panel(2,
        h("h2", { class: "flow-title", text: "operator entry" }),
        h("p", { class: "flow-text", text: "operator repair route for a successful extraction whose OCR failed. paste the extracted fragments, one per line." }),
        textarea,
        h("div", { class: "flow-actions" },
          h("button", { class: "action action--quiet", type: "button", text: "back", onClick: showMethods }),
          h("button", { class: "action action--primary", type: "button", text: "select fragments",
            onClick: () => {
              const lines = normalizeText(textarea.value);
              candidates = [];
              for (const line of lines) {
                const { text } = redactText(line);
                if (!text || isRedactedEmpty(text)) continue;
                candidates.push({
                  value: text.slice(0, 120),
                  kind: classifyFragment(text),
                  confidence: 0.8,
                  sourceLine: line,
                  includeInWall: true,
                });
              }
              pipelineSource = "manual_operator_entry";
              pipelineHints = detectPlatforms(textarea.value);
              if (candidates.length === 0) {
                showPrivateFailure("no fragments entered", "the operator panel received no usable lines.");
                return;
              }
              showReviewFragments();
            },
          })
        )
      )
    );
  }

  // ── review surface text ────────────────────────────────────────────────────
  function showReviewText(rawText: string, source: ExtractionSource): void {
    pipelineSource = source;
    const lines = normalizeText(rawText);
    if (lines.length === 0) {
      showPrivateFailure("no text was read from the surface", "the extractor found nothing legible. try a clearer surface.");
      return;
    }
    const textarea = h("textarea", { class: "flow-textarea flow-textarea--tall", rows: "12" }) as HTMLTextAreaElement;
    textarea.value = lines.join("\n");
    show(
      panel(1,
        h("h2", { class: "flow-title", text: "read surface" }),
        h("p", { class: "flow-text", text: "this is the text read from the surface. delete any line you do not want the extractor to use." }),
        textarea,
        h("div", { class: "flow-actions" },
          h("button", { class: "action action--quiet", type: "button", text: "back", onClick: showMethods }),
          h("button", { class: "action action--primary", type: "button", text: "select fragments",
            onClick: () => {
              const edited = normalizeText(textarea.value);
              candidates = extractFragments(edited);
              pipelineHints = detectPlatforms(textarea.value);
              if (candidates.length === 0) {
                showPrivateFailure("no fragments found", "no advertising-relevant fragments were found in this surface.");
                return;
              }
              showReviewFragments();
            },
          })
        )
      )
    );
  }

  // ── review fragments ───────────────────────────────────────────────────────
  function showReviewFragments(): void {
    const rows = candidates.map((fragment, index) => {
      const checkbox = h("input", { type: "checkbox", class: "fragment__check" }) as HTMLInputElement;
      checkbox.checked = fragment.includeInWall;
      checkbox.addEventListener("change", () => {
        candidates[index].includeInWall = checkbox.checked;
      });
      return h("label", { class: "fragment" },
        checkbox,
        h("span", { class: "fragment__value", text: fragment.value }),
        h("span", { class: "fragment__kind", text: fragment.kind })
      );
    });
    show(
      panel(2,
        h("h2", { class: "flow-title", text: "select fragments" }),
        h("p", { class: "flow-text", text: "these fragments were extracted from the surface. identifiers have been removed. keep what should describe this person." }),
        h("div", { class: "fragment-list" }, ...rows),
        h("div", { class: "flow-actions" },
          h("button", { class: "action action--quiet", type: "button", text: "back", onClick: showMethods }),
          h("button", { class: "action action--primary", type: "button", text: "generate person", onClick: generatePerson })
        )
      )
    );
  }

  async function generatePerson(): Promise<void> {
    const included = candidates.filter((f) => f.includeInWall);
    if (included.length === 0) {
      showPrivateFailure("no fragments selected", "select at least one fragment to generate this person.");
      return;
    }
    showWorking("generating this person…");
    try {
      preview = await requestPreview(pipelineSource, pipelineHints, included);
      showPreview();
    } catch {
      showPrivateFailure("the extractor is unreachable", "the portrait could not be generated. the repository did not respond.");
    }
  }

  // ── preview ────────────────────────────────────────────────────────────────
  function showPreview(): void {
    if (!preview) return;
    const removed = new Set<number>();
    const appendBtn = h("button", { class: "action action--primary", type: "button", text: "append this person" }) as HTMLButtonElement;

    const claimNodes = preview.claims.map((claim, index) => {
      const remove = h("button", { class: "claim__remove", type: "button", "aria-label": "remove this claim", text: "×" }) as HTMLButtonElement;
      const node = h("div", { class: "claim claim--" + claim.intensity },
        h("div", { class: "claim__body" },
          h("p", { class: "claim__sentence", text: claim.sentence }),
          h("p", { class: "claim__source", text: "source: " + claim.sourceNote })
        ),
        remove
      );
      remove.addEventListener("click", () => {
        removed.add(index);
        node.remove();
        if (removed.size >= preview!.claims.length) appendBtn.disabled = true;
      });
      return node;
    });

    appendBtn.addEventListener("click", async () => {
      if (!preview) return;
      const kept = preview.claims.map((_, i) => i).filter((i) => !removed.has(i));
      if (kept.length === 0) return;
      showWorking("appending to the repository…");
      try {
        const person = await appendPerson(
          preview.source,
          preview.platformHints,
          preview.fragments,
          preview.seed,
          kept.length === preview.claims.length ? null : kept
        );
        lastPerson = person;
        options.onAppended?.(person);
        showDone(person);
      } catch {
        showPrivateFailure("the append failed", "this person was not appended. the repository did not respond.");
      }
    });

    show(
      panel(3,
        h("h2", { class: "flow-title", text: "this is the page made of you" }),
        h("p", { class: "flow-text flow-text--small", text: preview.extractionSummary }),
        h("div", { class: "entry entry--preview" },
          h("header", { class: "entry__head" },
            h("span", { class: "entry__id", text: "THIS PERSON #————" })
          ),
          h("div", { class: "entry__claims entry__claims--editable" }, ...claimNodes)
        ),
        h("div", { class: "flow-actions" },
          h("button", { class: "action action--quiet", type: "button", text: "discard", onClick: () => { location.reload(); } }),
          h("button", { class: "action", type: "button", text: "back", onClick: showReviewFragments }),
          appendBtn
        )
      )
    );
  }

  // ── done + return loop ─────────────────────────────────────────────────────
  function showDone(person: ExtractedPerson): void {
    const children: (Node | string | false)[] = [
      h("h2", { class: "flow-title", text: "this person has been appended." }),
      h("p", { class: "flow-done-id", text: "THIS PERSON #" + person.id }),
      h("p", { class: "flow-text flow-text--small", text: "the repository updated. the wall shows this person now." }),
    ];
    const actions = h("div", { class: "flow-actions flow-actions--stacked" },
      h("button", { class: "action action--primary", type: "button", text: "enter the return loop", onClick: () => runReturnLoop(person) }),
      h("a", { class: "action", href: options.wallHref, text: "view the repository" }),
      h("button", { class: "action action--quiet", type: "button", text: "extract again", onClick: showMethods })
    );
    children.push(
      h("p", { class: "flow-text flow-text--small",
        text: "the return loop can place this browser into a real advertising audience. the page may return later as an ad." }),
      actions
    );
    show(panel(4, ...children));
  }

  async function runReturnLoop(person: ExtractedPerson): Promise<void> {
    showWorking("placing this browser into the return loop…");
    const outcome = await enterReturnLoop(options.config, person.publicNumber);
    const lines: (Node | string)[] = [
      h("h2", { class: "flow-title", text: "this person entered the return loop." }),
    ];
    if (outcome.adtechFired.length > 0) {
      lines.push(h("p", { class: "flow-text", text: "this browser was placed into an advertising audience. the page may return later as an advertisement." }));
    } else {
      lines.push(h("p", { class: "flow-text", text: "the repository recorded the enrollment. no ad platform is configured, so no third-party audience was joined." }));
    }
    lines.push(
      h("p", { class: "flow-text flow-text--small", text: "this artwork does not receive the hidden platform dossier. it uses the advertising pipeline only to send the page back." }),
      h("div", { class: "flow-actions" },
        h("a", { class: "action action--primary", href: options.wallHref, text: "view the repository" })
      )
    );
    show(panel(5, ...lines));
  }

  // The chamber always opens on the consent / framing notice.
  void lastPerson;
  showConsent();
}
