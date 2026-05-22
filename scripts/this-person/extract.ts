// this person — the main extraction chamber route. ?terminal=1 emphasizes
// screen capture for a gallery extraction station; ?operator=1 exposes the
// operator-entry repair method.

import { fetchConfig } from "./lib/api";
import {
  mountExtractionChamber,
  type MethodId,
} from "./lib/extraction/extractionChamber";

async function main(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) return;
  const config = await fetchConfig();
  const params = new URLSearchParams(location.search);
  const terminal = params.get("terminal") === "1";

  const methods: MethodId[] = [
    "screen_capture",
    "screenshot_ocr",
    "data_export",
    "browser_topics",
  ];
  if (params.get("operator") === "1") methods.push("manual_operator_entry");

  mountExtractionChamber(root, {
    config,
    methods,
    emphasis: terminal ? "screen_capture" : undefined,
    wallHref: "../wall/",
  });
}

void main();
