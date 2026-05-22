// this person — the default route. A landing frame, then the extraction
// chamber in place. This page is the standalone laptop/desktop version of the
// work: one person, one device, the whole extraction.

import { fetchConfig } from "./lib/api";
import { clear, h } from "./lib/dom";
import { markReturnedFromAd } from "./lib/adtechReturnLoop";
import { mountExtractionChamber } from "./lib/extraction/extractionChamber";

async function main(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) return;
  const config = await fetchConfig();

  const params = new URLSearchParams(location.search);
  const returned =
    params.get("returned") === "ad" || location.hash === "#returned-through-ad";
  if (returned) markReturnedFromAd(config);

  function beginExtraction(): void {
    clear(root!);
    mountExtractionChamber(root!, {
      config,
      methods: ["screen_capture", "screenshot_ocr", "data_export", "browser_topics"],
      wallHref: "wall/",
    });
  }

  clear(root);
  root.append(
    h(
      "section",
      { class: "hero" },
      returned &&
        h("p", {
          class: "hero__returned",
          text: "this person returned through the advertisement.",
        }),
      h("h1", { class: "hero__title", text: "this person" }),
      h(
        "p",
        { class: "hero__core" },
        "this already happens.",
        h("br"),
        "this time, you get the page."
      ),
      h("p", {
        class: "hero__secondary",
        text: "a repository of people who chose extraction",
      }),
      h(
        "div",
        { class: "flow-actions" },
        h("button", {
          class: "action action--primary action--large",
          type: "button",
          text: "begin extraction",
          onClick: beginExtraction,
        })
      ),
      h("a", { class: "hero__link", href: "wall/", text: "view the repository" })
    )
  );
}

void main();
