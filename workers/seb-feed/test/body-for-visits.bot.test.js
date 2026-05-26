import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyUA } from "../src/body-for-visits/bot.js";

const BROWSERS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

const BOTS = [
  { ua: "Googlebot/2.1 (+http://www.google.com/bot.html)", bucket: "search" },
  { ua: "Bingbot/2.0", bucket: "search" },
  { ua: "GPTBot/1.0", bucket: "llm" },
  { ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)", bucket: "generic" },
  { ua: "anthropic-ai/1.0", bucket: "llm" },
  { ua: "curl/8.4.0", bucket: "client" },
  { ua: "python-requests/2.31.0", bucket: "client" },
  { ua: "facebookexternalhit/1.1", bucket: "social" },
  { ua: "TwitterBot/1.0", bucket: "social" },
  { ua: "", bucket: "empty" },
];

test("real browser UAs classify as browser, not bot", () => {
  for (const ua of BROWSERS) {
    const r = classifyUA(ua);
    assert.equal(r.isBot, false, `should not flag: ${ua}`);
    assert.equal(r.bucket, "browser");
  }
});

test("bot UAs classify with correct bucket and isBot=true", () => {
  for (const { ua, bucket } of BOTS) {
    const r = classifyUA(ua);
    assert.equal(r.isBot, true, `should flag bot: ${JSON.stringify(ua)}`);
    assert.equal(r.bucket, bucket, `expected ${bucket} for ${ua}, got ${r.bucket}`);
  }
});
