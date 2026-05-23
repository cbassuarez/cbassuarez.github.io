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
      {},
      h("h1", { text: "this person" }),
      h("p", {
        text: "The ad-return route is no longer the data source. This work now reads what your browser hands to ad tech in real time, with your consent.",
      }),
      h("p", {}, h("a", { href: "../", text: "open the consent surface" })),
      h("p", {}, h("a", { href: "../wall/", text: "view the repository" }))
    )
  );
}

main();
