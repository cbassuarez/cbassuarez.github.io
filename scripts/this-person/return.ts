// this person — legacy return route. The old "return through an ad loop"
// variant of the work is retired; this stub keeps the URL alive and points to
// the current consent surface.

import { h } from "./lib/dom";

function main(): void {
  const root = document.getElementById("root");
  if (!root) return;
  root.append(
    h(
      "section",
      { class: "flow-panel" },
      h("h1", { class: "flow-title", text: "this person" }),
      h("p", {
        class: "flow-text",
        text: "The ad-return route is no longer the data source. This work now reads what your browser hands to ad tech in real time, with your consent.",
      }),
      h(
        "div",
        { class: "flow-actions" },
        h("a", { class: "action action--primary", href: "../", text: "open the consent surface" }),
        h("a", { class: "action action--quiet", href: "../wall/", text: "view the repository" })
      )
    )
  );
}

main();
