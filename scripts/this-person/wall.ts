// this person — the repository wall. A fullscreen projection of every
// successful extracted portrait, with a QR to the consent route. Slow
// auto-scroll crawls the ledger; the spacebar pauses it; ?kiosk=1 hides chrome.

import { openWallStream } from "./lib/socket";
import { renderQr } from "./lib/qr";
import { createWallView, sourceLabel } from "./lib/wall-render";

const SCROLL_SPEED_PX_PER_SEC = 22;
const BOTTOM_HOLD_MS = 8000;

function setupAutoScroll(): void {
  let paused = false;
  let last = performance.now();
  let bottomSince = 0;

  function frame(now: number): void {
    const dt = Math.min(now - last, 80);
    last = now;
    if (!paused) {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const atBottom = window.scrollY >= maxScroll - 2;
      if (atBottom) {
        if (bottomSince === 0) bottomSince = now;
        else if (now - bottomSince > BOTTOM_HOLD_MS) {
          window.scrollTo(0, 0);
          bottomSince = 0;
        }
      } else {
        bottomSince = 0;
        window.scrollBy(0, (SCROLL_SPEED_PX_PER_SEC * dt) / 1000);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      paused = !paused;
      document.body.classList.toggle("is-paused", paused);
    }
  });
}

function main(): void {
  const wallContainer = document.getElementById("wall");
  if (!wallContainer) return;
  const countEl = document.getElementById("count");
  const statusEl = document.getElementById("status");
  const mixEl = document.getElementById("source-mix");
  const qrCanvas = document.getElementById("qr") as HTMLCanvasElement | null;
  const submitUrlEl = document.getElementById("submit-url");

  if (new URLSearchParams(location.search).get("kiosk") === "1") {
    document.body.classList.add("kiosk");
  }

  const submitUrl = new URL("../", location.href).toString();
  if (submitUrlEl) submitUrlEl.textContent = submitUrl;
  if (qrCanvas) renderQr(qrCanvas, submitUrl);

  const view = createWallView(wallContainer);
  function refresh(): void {
    if (countEl) countEl.textContent = String(view.count());
    if (mixEl) {
      const counts = view.sourceCounts();
      const keys = Object.keys(counts);
      mixEl.textContent = keys.length
        ? keys
            .map((k) => sourceLabel(k) + ": " + counts[k])
            .join("   /   ")
        : "";
    }
  }

  openWallStream({
    onSnapshot: (persons) => {
      view.setAll(persons);
      refresh();
    },
    onPerson: (person) => {
      view.add(person);
      refresh();
    },
    onUpdate: (person) => {
      view.update(person);
      refresh();
    },
    onCleared: () => {
      view.clear();
      refresh();
    },
    onStatus: (status) => {
      if (statusEl) statusEl.textContent = status;
    },
  });

  setupAutoScroll();
}

main();
