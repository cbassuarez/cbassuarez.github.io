// this person — the returned-through-ad route. The page is reached when an
// advertisement built by the return loop sends the participant back. It does
// not append a new entry; it marks the return and fires the neutral
// returned-from-ad event if adtech is configured.

import { fetchConfig } from "./lib/api";
import { h } from "./lib/dom";
import { markReturnedFromAd } from "./lib/adtechReturnLoop";

async function main(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) return;
  const config = await fetchConfig();
  markReturnedFromAd(config);

  root.append(
    h(
      "section",
      { class: "flow-panel" },
      h("h1", { class: "flow-title", text: "this person returned through the advertisement." }),
      h("p", {
        class: "flow-text",
        text: "the page was sent back to you through the advertising pipeline. this return is the part of the work the return loop produces.",
      }),
      h("p", {
        class: "flow-text flow-text--small",
        text: "no entry was appended. the return loop does not create a new person — it only addresses one that already chose extraction.",
      }),
      h("a", { class: "action action--primary", href: "../wall/", text: "view the repository" })
    )
  );
}

void main();
