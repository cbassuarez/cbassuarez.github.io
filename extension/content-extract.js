// this person — content extraction.
// Injected into the active tab ONLY when the participant clicks the toolbar
// button. It reads the visible text of the page — nothing else. It does not
// touch cookies, localStorage, passwords, form values, or network data, and it
// does not run in the background. The trailing IIFE's return value is what
// chrome.scripting.executeScript hands back to the popup.

(function extractVisibleText() {
  var MAX_TEXT = 180 * 1024;

  function detectPlatform() {
    var host = location.hostname.toLowerCase();
    var text = (document.body ? document.body.innerText : "").toLowerCase().slice(0, 8000);
    if (host.indexOf("google") >= 0 || text.indexOf("my ad center") >= 0 || text.indexOf("ads personalization") >= 0) {
      return "Google My Ad Center";
    }
    if (host.indexOf("facebook") >= 0 || host.indexOf("meta") >= 0 || host.indexOf("instagram") >= 0 || text.indexOf("ad preferences") >= 0) {
      return "Meta Ad Preferences";
    }
    if (host.indexOf("amazon") >= 0 || text.indexOf("advertising preferences") >= 0) {
      return "Amazon advertising preferences";
    }
    if (host.indexOf("tiktok") >= 0) return "TikTok ad interests";
    return "";
  }

  var visible = document.body ? document.body.innerText || "" : "";
  return {
    source: "active_tab_extension",
    pageTitle: (document.title || "").slice(0, 200),
    platformHint: detectPlatform(),
    extractedText: visible.slice(0, MAX_TEXT),
    extractedAtLocal: new Date().toISOString().slice(0, 13),
  };
})();
