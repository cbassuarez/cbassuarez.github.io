// Coarse user-agent classifier. We never store the raw UA; only a class.
// Bots are not refused — they are received as a different kind of visit and
// their mark goes to the corruption fringe, never to the body.

const RULES = [
  { bucket: "search", needles: ["googlebot", "bingbot", "duckduckbot", "yandex", "baiduspider"] },
  {
    bucket: "llm",
    needles: [
      "gptbot",
      "claude-web",
      "anthropic-ai",
      "perplexitybot",
      "ccbot",
      "bytespider",
      "applebot-extended",
      "oai-searchbot",
    ],
  },
  {
    bucket: "social",
    needles: [
      "facebookexternalhit",
      "twitterbot",
      "discordbot",
      "slackbot",
      "linkedinbot",
      "telegrambot",
      "whatsapp",
    ],
  },
  {
    bucket: "client",
    needles: [
      "curl/",
      "wget/",
      "python-requests",
      "python-urllib",
      "httpie",
      "node-fetch",
      "axios/",
      "headlesschrome",
    ],
  },
  { bucket: "generic", needles: ["bot", "crawler", "spider"] },
];

export function classifyUA(ua) {
  const raw = String(ua || "").trim();
  if (!raw) return { isBot: true, bucket: "empty" };
  const lower = raw.toLowerCase();
  for (const { bucket, needles } of RULES) {
    for (const n of needles) {
      if (lower.includes(n)) return { isBot: true, bucket };
    }
  }
  return { isBot: false, bucket: "browser" };
}
