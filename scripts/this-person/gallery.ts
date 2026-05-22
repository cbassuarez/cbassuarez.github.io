// this person — the gallery landing page. Explains installation mode and
// renders the QR code that phones scan to reach the submission route.

import { renderQr } from "./lib/qr";

function main(): void {
  const canvas = document.getElementById("qr") as HTMLCanvasElement | null;
  const urlEl = document.getElementById("submit-url");
  const submitUrl = new URL("../submit/", location.href).toString();
  if (urlEl) urlEl.textContent = submitUrl;
  if (canvas) renderQr(canvas, submitUrl);
}

main();
