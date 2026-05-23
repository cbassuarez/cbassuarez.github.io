// this person — legacy return route.

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
        text: "The ad-return route is no longer the data source. This work now uses consented Google My Ad Center records through Data Portability.",
      }),
      h("p", {}, h("a", { href: "../", text: "start the Google consent flow" })),
      h("p", {}, h("a", { href: "../wall/", text: "view the repository" }))
    )
  );
}

main();
