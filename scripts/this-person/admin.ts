// this person — the admin route. Inspection is open (the repository is public);
// destructive controls and exports are gated by the ADMIN_TOKEN secret. The
// token is held in page memory only — never localStorage, never a cookie.

import { apiBase, fetchConfig, fetchState } from "./lib/api";
import { sourceLabel } from "./lib/wall-render";
import { clear, h } from "./lib/dom";
import type { ExtractedPerson } from "../../worker/src/this-person/types";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: filename }) as HTMLAnchorElement;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toPlainText(persons: ExtractedPerson[]): string {
  return persons
    .map((person) => {
      const head = "this person #" + person.id;
      const claims = person.claims
        .map((claim) => claim.sentence + "\n  source: " + claim.sourceNote)
        .join("\n\n");
      return head + "\n\n" + claims;
    })
    .join("\n\n────────────────────\n\n");
}

async function main(): Promise<void> {
  const root = document.getElementById("admin");
  if (!root) return;

  const [config, persons] = await Promise.all([fetchConfig(), fetchState()]);

  const counts: Record<string, number> = {};
  for (const person of persons) counts[person.source] = (counts[person.source] || 0) + 1;
  const distribution = Object.keys(counts)
    .map((k) => sourceLabel(k) + ": " + counts[k])
    .join("   /   ");

  const recent = persons
    .slice(-10)
    .reverse()
    .map((person) =>
        h("li", { class: "admin__entry" },
          h("span", { class: "admin__entry-id", text: "#" + person.id }),
        h("span", { class: "admin__entry-source", text: sourceLabel(person.source) }),
        h("span", { class: "admin__entry-claim", text: person.claims[0]?.sentence || "" })
      )
    );

  clear(root);
  root.append(h("h1", { class: "admin__title", text: "this person — admin" }));

  // ── inspection (open) ──
  root.append(
    h("section", { class: "admin__section" },
      h("h2", { class: "admin__subtitle", text: "repository" }),
      h("p", { class: "admin__note", text: "extracted persons: " + persons.length }),
      h("p", { class: "admin__note", text: "source distribution — " + (distribution || "none yet") }),
      h("p", { class: "admin__note", text: "persistence: " + config.persistence }),
      h("p", {
        class: "admin__note",
        text: "Google Ads / GA4: " + (config.adtech.googleAds.enabled ? "configured (" + config.adtech.googleAds.id + ")" : "off"),
      }),
      h("p", {
        class: "admin__note",
        text: "Meta Pixel: " + (config.adtech.metaPixel.enabled ? "configured (" + config.adtech.metaPixel.id + ")" : "off"),
      }),
      h("h3", { class: "admin__subtitle admin__subtitle--small", text: "last entries" }),
      recent.length ? h("ul", { class: "admin__entries" }, ...recent)
        : h("p", { class: "admin__note", text: "the repository is empty." })
    )
  );

  // ── destructive controls (token-gated) ──
  if (!config.adminEnabled) {
    root.append(
      h("section", { class: "admin__section" },
        h("h2", { class: "admin__subtitle", text: "controls" }),
        h("p", { class: "admin__note",
          text: "Admin is disabled. No ADMIN_TOKEN is configured on the worker, so export and clear are unavailable." })
      )
    );
  } else {
    const tokenInput = h("input", {
      class: "admin__input", type: "password", placeholder: "admin token",
      "aria-label": "admin token", autocomplete: "off",
    }) as HTMLInputElement;
    const status = h("p", { class: "admin__status", text: "" });
    const token = () => tokenInput.value.trim();
    const authHeaders = (): Record<string, string> => ({ authorization: "Bearer " + token() });

    async function exportJson(): Promise<void> {
      if (!token()) { status.textContent = "Enter the admin token first."; return; }
      status.textContent = "exporting…";
      try {
        const r = await fetch(apiBase() + "/api/this-person/admin/export", { headers: authHeaders() });
        if (!r.ok) { status.textContent = r.status === 403 ? "rejected: invalid token." : "export failed (" + r.status + ")."; return; }
        downloadBlob(await r.blob(), "this-person-repository.json");
        status.textContent = "JSON export downloaded.";
      } catch { status.textContent = "export failed: the worker is unreachable."; }
    }

    async function exportTxt(): Promise<void> {
      if (!token()) { status.textContent = "Enter the admin token first."; return; }
      status.textContent = "exporting…";
      try {
        const r = await fetch(apiBase() + "/api/this-person/admin/export", { headers: authHeaders() });
        if (!r.ok) { status.textContent = r.status === 403 ? "rejected: invalid token." : "export failed (" + r.status + ")."; return; }
        const j: any = await r.json();
        const text = toPlainText(Array.isArray(j.persons) ? j.persons : []);
        downloadBlob(new Blob([text], { type: "text/plain" }), "this-person-repository.txt");
        status.textContent = "TXT export downloaded.";
      } catch { status.textContent = "export failed: the worker is unreachable."; }
    }

    async function clearRepository(): Promise<void> {
      if (!token()) { status.textContent = "Enter the admin token first."; return; }
      if (!window.confirm("Clear the entire repository? This permanently deletes every extracted person.")) return;
      status.textContent = "clearing…";
      try {
        const r = await fetch(apiBase() + "/api/this-person/admin/clear", { method: "POST", headers: authHeaders() });
        if (r.ok) status.textContent = "repository cleared. numbering restarts at 0001.";
        else status.textContent = r.status === 403 ? "rejected: invalid token." : "clear failed (" + r.status + ").";
      } catch { status.textContent = "clear failed: the worker is unreachable."; }
    }

    root.append(
      h("section", { class: "admin__section" },
        h("h2", { class: "admin__subtitle", text: "controls" }),
        h("p", { class: "admin__note", text: "Export before clearing — clearing is irreversible." }),
        h("label", { class: "admin__field" },
          h("span", { class: "admin__label", text: "admin token" }),
          tokenInput
        ),
        h("div", { class: "admin__actions" },
          h("button", { class: "action action--primary", type: "button", text: "export JSON", onClick: exportJson }),
          h("button", { class: "action action--primary", type: "button", text: "export TXT", onClick: exportTxt }),
          h("button", { class: "action action--danger", type: "button", text: "clear repository", onClick: clearRepository })
        ),
        status
      )
    );
  }

  // ── display ──
  const kioskUrl = new URL("../wall/?kiosk=1", location.href).toString();
  root.append(
    h("section", { class: "admin__section" },
      h("h2", { class: "admin__subtitle", text: "display" }),
      h("p", { class: "admin__note", text: "Open the wall in kiosk mode for the gallery projection:" }),
      h("p", { class: "admin__mono" }, h("a", { href: kioskUrl, text: kioskUrl })),
      h("p", { class: "admin__note" },
        h("a", { href: new URL("../", location.href).toString(),
          text: "open the consent surface" })
      )
    )
  );
}

void main();
