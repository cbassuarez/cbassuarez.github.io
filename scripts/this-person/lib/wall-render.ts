// this person — entry rendering and the repository wall view.
// Every value is written with textContent, so HTML or script text inside a
// claim or fragment is displayed inert and never executed.

import type {
  ExtractedClaim,
  ExtractedPerson,
} from "../../../workers/seb-feed/src/this-person/types";
import { h } from "./dom";

export const SOURCE_LABELS: Record<string, string> = {
  google_data_portability: "Google My Ad Center",
  ad_preferences_surface: "consented industry ad-tech read",
  browser_topics: "Chrome Topics API",
  adtech_return_loop: "ad-loop return",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] || "legacy source";
}

function renderClaim(claim: ExtractedClaim): HTMLElement {
  return h(
    "div",
    { class: "claim claim--" + claim.intensity },
    h("p", { class: "claim__sentence", text: claim.sentence }),
    h("p", { class: "claim__source", text: "source: " + claim.sourceNote })
  );
}

// Builds a "THIS PERSON" block. Used for wall entries and for the pre-append
// preview (where idText is a placeholder).
export function buildEntry(
  idText: string,
  source: string,
  claims: ExtractedClaim[],
  options?: { status?: string; summary?: string; time?: string | null }
): HTMLElement {
  const article = h(
    "article",
    { class: "entry entry--" + source },
    h(
      "header",
      { class: "entry__head" },
      h("span", { class: "entry__id", text: "this person #" + idText }),
      h("span", { class: "entry__source", text: sourceLabel(source) })
    ),
    h("div", { class: "entry__claims" }, ...claims.map(renderClaim))
  );
  if (options?.status) {
    article.append(h("p", { class: "entry__status", text: options.status }));
  }
  if (options?.summary) {
    article.append(h("footer", { class: "entry__summary", text: options.summary }));
  }
  if (options?.time) {
    article.append(h("footer", { class: "entry__time", text: "appended near " + options.time }));
  }
  return article;
}

function statusNote(person: ExtractedPerson): string | undefined {
  if (person.status === "extracted_and_enrolled") return "this person is in the return loop.";
  if (person.status === "returned_through_ad") return "this person returned through the advertisement.";
  return undefined;
}

export function renderPerson(person: ExtractedPerson): HTMLElement {
  const node = buildEntry(person.id, person.source, person.claims, {
    status: statusNote(person),
    time: person.appendedAtVisible || null,
  });
  node.setAttribute("data-order", String(person.appendedAtOrder));
  return node;
}

export interface WallView {
  setAll(persons: ExtractedPerson[]): void;
  add(person: ExtractedPerson): void;
  update(person: ExtractedPerson): void;
  clear(): void;
  count(): number;
  sourceCounts(): Record<string, number>;
}

// Manages the wall container: append-only, deduplicated by append order.
export function createWallView(container: HTMLElement): WallView {
  const order = new Map<number, ExtractedPerson>();

  function render(): void {
    container.textContent = "";
    const sorted = [...order.values()].sort(
      (a, b) => a.appendedAtOrder - b.appendedAtOrder
    );
    for (const person of sorted) container.appendChild(renderPerson(person));
  }

  function setAll(persons: ExtractedPerson[]): void {
    order.clear();
    for (const person of persons) order.set(person.appendedAtOrder, person);
    render();
  }

  function add(person: ExtractedPerson): void {
    if (!person || order.has(person.appendedAtOrder)) return;
    order.set(person.appendedAtOrder, person);
    container.appendChild(renderPerson(person));
  }

  function update(person: ExtractedPerson): void {
    if (!person) return;
    order.set(person.appendedAtOrder, person);
    const existing = container.querySelector(
      '[data-order="' + person.appendedAtOrder + '"]'
    );
    if (existing) existing.replaceWith(renderPerson(person));
    else add(person);
  }

  function clear(): void {
    order.clear();
    container.textContent = "";
  }

  function sourceCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const person of order.values()) {
      counts[person.source] = (counts[person.source] || 0) + 1;
    }
    return counts;
  }

  return { setAll, add, update, clear, count: () => order.size, sourceCounts };
}
