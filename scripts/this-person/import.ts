// this person — the import route. Receives extracted visible text from the
// browser extension / bookmarklet in the URL fragment, decodes it client-side,
// and routes it through the extraction chamber. Nothing is sent to the server
// until the participant previews and confirms.

import { fetchConfig } from "./lib/api";
import { h } from "./lib/dom";
import { mountExtractionChamber } from "./lib/extraction/extractionChamber";
import { readImportPayloadFromHash } from "./lib/extraction/importPayload";

async function main(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) return;
  const config = await fetchConfig();
  const payload = readImportPayloadFromHash();

  if (!payload) {
    root.append(
      h(
        "section",
        { class: "flow-panel" },
        h("h2", { class: "flow-title", text: "no import payload" }),
        h("p", {
          class: "flow-text",
          text: "this route receives extracted text from the browser extension or bookmarklet. open it through the extension, or use the extraction chamber directly.",
        }),
        h("a", {
          class: "action action--primary",
          href: "../extract/",
          text: "open the extraction chamber",
        })
      )
    );
    return;
  }

  mountExtractionChamber(root, {
    config,
    methods: [],
    initialPayload: payload,
    wallHref: "../wall/",
  });
}

void main();
