// this person — extractor popup.
// On an explicit click it injects content-extract.js into the active tab,
// encodes the returned visible text as a URL-fragment payload, and opens the
// import route. The payload travels in the fragment, so it is never sent to a
// server until the participant previews and confirms inside the chamber.

// Change this to your deployment (or http://localhost:5173/... for local dev).
const IMPORT_BASE = "https://cbassuarez.com/labs/this-person/import";

const statusEl = document.getElementById("status");
const button = document.getElementById("extract");

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

// base64url of UTF-8 JSON — matches decodePayload() in importPayload.ts.
function encodeToBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

button.addEventListener("click", async () => {
  button.disabled = true;
  setStatus("reading the visible page…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null) {
      setStatus("no active tab.");
      button.disabled = false;
      return;
    }
    const injections = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-extract.js"],
    });
    const payload = injections && injections[0] && injections[0].result;
    if (!payload || !payload.extractedText || !payload.extractedText.trim()) {
      setStatus("no visible text could be read from this tab.");
      button.disabled = false;
      return;
    }
    const encoded = encodeToBase64Url(JSON.stringify(payload));
    await chrome.tabs.create({ url: IMPORT_BASE + "#payload=" + encoded });
    setStatus("opened the import route.");
    window.close();
  } catch (err) {
    setStatus("extraction failed: this tab cannot be read.");
    button.disabled = false;
  }
});
