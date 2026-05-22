// this person — the mobile / gallery submission route, reached by scanning the
// wall's QR. Screenshot extraction is the fastest phone-native path and is
// surfaced first; data-export ingestion is also offered.

import { fetchConfig } from "./lib/api";
import { mountExtractionChamber } from "./lib/extraction/extractionChamber";

async function main(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) return;
  const config = await fetchConfig();
  mountExtractionChamber(root, {
    config,
    methods: ["screenshot_ocr", "data_export"],
    emphasis: "screenshot_ocr",
    wallHref: "../wall/",
  });
}

void main();
