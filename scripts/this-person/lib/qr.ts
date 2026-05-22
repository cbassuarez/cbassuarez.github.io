// this person — local QR generation. The qrcode package is pure JavaScript,
// bundled at build time; it makes no network calls.

import QRCode from "qrcode";

export function renderQr(canvas: HTMLCanvasElement, text: string): void {
  QRCode.toCanvas(
    canvas,
    text,
    { width: 320, margin: 1, color: { dark: "#000000", light: "#ffffff" } },
    (error: Error | null | undefined) => {
      if (error) {
        // Leave the canvas blank — the submit URL is rendered as text alongside
        // it and remains a usable fallback.
      }
    }
  );
}
