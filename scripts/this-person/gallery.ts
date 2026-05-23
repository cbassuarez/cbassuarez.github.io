// this person — gallery helper QR.

import { renderQr } from "./lib/qr";

function main(): void {
  const canvas = document.getElementById("qr") as HTMLCanvasElement | null;
  const urlEl = document.getElementById("submit-url");
  const consentUrl = new URL("../", location.href).toString();
  if (urlEl) urlEl.textContent = consentUrl;
  if (canvas) renderQr(canvas, consentUrl);
}

main();
