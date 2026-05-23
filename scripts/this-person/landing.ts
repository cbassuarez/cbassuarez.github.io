// this person — Google ad-interest confessional.

import {
  appendGoogleCandidates,
  fetchConfig,
  fetchGoogleJob,
  googleStartUrl,
  type GoogleAdCandidate,
} from "./lib/api";
import { buildEntry } from "./lib/wall-render";
import { clear, h } from "./lib/dom";

function hashParams(): URLSearchParams {
  return new URLSearchParams(location.hash.replace(/^#/, ""));
}

function removeHash(): void {
  history.replaceState(null, "", location.pathname + location.search);
}

function panel(...children: (Node | string | false | null | undefined)[]): HTMLElement {
  return h("section", {}, ...children);
}

function relationLabel(candidate: GoogleAdCandidate): string {
  if (candidate.relation === "likes") return "more";
  if (candidate.relation === "less") return "fewer";
  if (candidate.relation === "blocked") return "blocked";
  if (candidate.relation === "seen") return "seen";
  if (candidate.relation === "visited") return "visited";
  return "associated";
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJob(root: HTMLElement, id: string): Promise<void> {
  let stopped = false;
  const status = h("p", { text: "waiting for Google to prepare the archive." });
  const stop = h("button", {
    type: "button",
    text: "stop",
    onClick: () => {
      stopped = true;
      showStart(root);
    },
  });
  clear(root);
  root.append(panel(h("h1", { text: "this person" }), status, stop));

  for (let attempt = 0; attempt < 90 && !stopped; attempt++) {
    try {
      const result = await fetchGoogleJob(id);
      if (result.state === "complete") {
        removeHash();
        showReview(root, id, result.candidates);
        return;
      }
      if (result.state === "empty") {
        removeHash();
        showFailure(root, "Google returned no extractable My Ad Center ad-interest records.");
        return;
      }
      if (result.state === "failed") {
        removeHash();
        showFailure(root, "Google Data Portability failed: " + result.error);
        return;
      }
      status.textContent = "waiting for Google to prepare the archive. " + String(attempt + 1);
    } catch {
      status.textContent = "the worker could not read the archive job.";
    }
    await wait(2000);
  }
  if (!stopped) showFailure(root, "the archive did not finish in this browser session.");
}

function showFailure(root: HTMLElement, message: string): void {
  clear(root);
  root.append(
    panel(
      h("h1", { text: "this person" }),
      h("p", { text: message }),
      h("p", { text: "nothing was appended." }),
      h("button", { type: "button", text: "start again", onClick: () => showStart(root) }),
      h("p", {}, h("a", { href: "wall/", text: "view the repository" }))
    )
  );
}

function showReview(root: HTMLElement, id: string, candidates: GoogleAdCandidate[]): void {
  const selected = new Set(candidates.map((candidate) => candidate.id));
  const appendButton = h("button", { type: "button", text: "append selected interests" }) as HTMLButtonElement;
  const list = h(
    "ul",
    {},
    ...candidates.map((candidate) => {
      const checkbox = h("input", {
        type: "checkbox",
        checked: "checked",
        "aria-label": "include " + candidate.label,
      }) as HTMLInputElement;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selected.add(candidate.id);
        else selected.delete(candidate.id);
        appendButton.disabled = selected.size === 0;
      });
      return h(
        "li",
        {},
        h("label", {},
          checkbox,
          " ",
          candidate.label,
          " — ",
          relationLabel(candidate)
        ),
        h("p", { text: candidate.claimSentence }),
        h("p", { text: "source: " + candidate.sourceNote })
      );
    })
  );
  appendButton.addEventListener("click", async () => {
    appendButton.disabled = true;
    appendButton.textContent = "appending";
    try {
      const person = await appendGoogleCandidates(id, [...selected]);
      clear(root);
      root.append(
        panel(
          h("h1", { text: "this person has been appended." }),
          buildEntry(person.id, person.source, person.claims, { summary: person.extractionSummary }),
          h("p", {}, h("a", { href: "wall/", text: "view the repository" }))
        )
      );
    } catch {
      appendButton.disabled = false;
      appendButton.textContent = "append selected interests";
      showFailure(root, "the append failed.");
    }
  });

  clear(root);
  root.append(
    panel(
      h("h1", { text: "review Google ad interests" }),
      h("p", {
        text: "These are sanitized records returned by Google Data Portability for My Ad Center. Remove anything that should not become public.",
      }),
      list,
      appendButton,
      h("p", {}, h("a", { href: "wall/", text: "view the repository" }))
    )
  );
}

async function showStart(root: HTMLElement): Promise<void> {
  const config = await fetchConfig();
  clear(root);
  const children: (Node | string | false)[] = [
    h("h1", { text: "this person" }),
    h("p", {
      text: "consented Google ad-interest data, returned as a public third-person entry.",
    }),
    h("p", {
      text: "The work asks Google for My Ad Center activity through the official Data Portability API. It does not accept substitute data sources.",
    }),
  ];
  if (config.googleDataPortability.enabled) {
    children.push(
      h("p", {
        text: "You will be sent to Google. After consent, Google prepares an archive. You review extracted interests before anything is appended.",
      }),
      h("p", {}, h("a", { href: googleStartUrl(), text: "connect Google My Ad Center" })),
      h("p", {}, h("a", { href: "wall/", text: "view the repository" }))
    );
  } else {
    children.push(
      h("p", {
        text: "Google Data Portability is not configured on this worker. No substitute data source is available.",
      }),
      h("p", {}, h("a", { href: "wall/", text: "view the repository" }))
    );
  }
  root.append(panel(...children));
}

async function main(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) return;
  const params = hashParams();
  const error = params.get("google_error");
  const job = params.get("google_job");
  if (error) {
    removeHash();
    showFailure(root, "Google consent failed: " + error);
    return;
  }
  if (job) {
    await pollJob(root, job);
    return;
  }
  await showStart(root);
}

void main();
