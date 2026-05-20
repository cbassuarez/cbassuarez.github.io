var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/body-for-visits/lexicon.js
var BUCKETS = {
  openings: [
    "here",
    "again",
    "still",
    "meanwhile",
    "before that",
    "elsewhere",
    "since you arrived",
    "between requests",
    "in the margin",
    "under the cache",
    "now",
    "once more",
    "afterward",
    "already",
    "soon",
    "later",
    "earlier",
    "beforehand",
    "in passing",
    "in transit",
    "in the open",
    "in the record",
    "in the log",
    "in the queue",
    "at the threshold",
    "at the edge",
    "at first",
    "at last",
    "at once",
    "by now",
    "by then",
    "for now",
    "for a while",
    "from here",
    "from there",
    "just now",
    "of late",
    "on arrival",
    "on return",
    "on the surface",
    "on the record",
    "over and over",
    "past that",
    "since then",
    "thereafter",
    "until now",
    "within reach",
    "without warning",
    "after the request",
    "after the answer",
    "before the answer",
    "beneath the page",
    "between the lines",
    "between answers",
    "in the interval",
    "in the meantime",
    "in the residue",
    "in the corridor",
    "in the anteroom",
    "near the threshold",
    "under observation",
    "while you wait",
    "while it loads",
    "after the fold",
    "before the fold",
    "off the record",
    "somewhere else",
    "here again",
    "still here",
    "even now",
    "ever since",
    "far from here",
    "close by",
    "somewhere near",
    "deep in the archive",
    "at the far end",
    "mid-request",
    "between visits",
    "after the pause",
    "before the pause",
    "once arrived",
    "having waited",
    "when you came",
    "when it began",
    "where it began",
    "again and again",
    "slowly now",
    "quietly here",
    "faintly",
    "barely",
    "almost",
    "not yet",
    "no longer",
    "somewhere",
    "afterward still",
    "long after"
  ],
  nouns: [
    "visitor",
    "witness",
    "threshold",
    "cache",
    "archive",
    "residue",
    "surface",
    "server",
    "room",
    "request",
    "response",
    "signal",
    "latency",
    "body",
    "column",
    "breath",
    "address",
    "hand",
    "page",
    "record",
    "log",
    "trace",
    "echo",
    "mirror",
    "window",
    "door",
    "hallway",
    "corridor",
    "anteroom",
    "chamber",
    "ledger",
    "index",
    "margin",
    "footnote",
    "document",
    "packet",
    "payload",
    "header",
    "cursor",
    "pointer",
    "handshake",
    "session",
    "token",
    "fragment",
    "remainder",
    "interval",
    "pause",
    "silence",
    "hum",
    "current",
    "pulse",
    "thread",
    "queue",
    "buffer",
    "gateway",
    "port",
    "channel",
    "node",
    "edge",
    "lattice",
    "grid",
    "frame",
    "pane",
    "glass",
    "wall",
    "floor",
    "ceiling",
    "corner",
    "seam",
    "hinge",
    "latch",
    "key",
    "lock",
    "gate",
    "fence",
    "border",
    "perimeter",
    "boundary",
    "limit",
    "horizon",
    "distance",
    "proximity",
    "presence",
    "absence",
    "name",
    "shadow",
    "reflection",
    "imprint",
    "fingerprint",
    "stain",
    "mark",
    "watermark",
    "seal",
    "stamp",
    "receipt",
    "manifest",
    "inventory",
    "register",
    "count",
    "tally",
    "attention",
    "regard",
    "notice",
    "glance",
    "gaze",
    "observer",
    "reader",
    "recipient",
    "sender",
    "courier",
    "messenger",
    "host",
    "guest",
    "tenant",
    "occupant",
    "stranger",
    "crowd",
    "network",
    "circuit",
    "wire",
    "cable",
    "conduit",
    "vessel",
    "container",
    "enclosure",
    "vault",
    "repository",
    "stack",
    "shelf",
    "drawer",
    "folder",
    "file",
    "transcript",
    "account",
    "statement",
    "report",
    "dispatch",
    "annotation",
    "gloss",
    "aside",
    "parenthesis",
    "ellipsis",
    "omission",
    "gap",
    "void",
    "vacancy",
    "weight",
    "mass",
    "density",
    "texture",
    "grain",
    "dust",
    "sediment",
    "layer",
    "stratum",
    "membrane",
    "skin",
    "husk",
    "shell",
    "casing"
  ],
  verbs: [
    "arrives",
    "lingers",
    "returns",
    "folds",
    "holds",
    "attends",
    "forgets",
    "remembers",
    "compresses",
    "answers",
    "withholds",
    "passes through",
    "marks",
    "keeps",
    "releases",
    "waits",
    "watches",
    "listens",
    "notices",
    "records",
    "logs",
    "registers",
    "counts",
    "numbers",
    "names",
    "unnames",
    "signs",
    "witnesses",
    "observes",
    "regards",
    "considers",
    "dwells",
    "remains",
    "stays",
    "persists",
    "endures",
    "fades",
    "dims",
    "dissolves",
    "disappears",
    "vanishes",
    "recedes",
    "withdraws",
    "departs",
    "leaves",
    "exits",
    "enters",
    "approaches",
    "crosses",
    "passes",
    "traverses",
    "threads",
    "drifts",
    "wanders",
    "circles",
    "repeats",
    "recurs",
    "resumes",
    "continues",
    "proceeds",
    "begins",
    "opens",
    "closes",
    "seals",
    "locks",
    "unlocks",
    "gathers",
    "collects",
    "accumulates",
    "stores",
    "archives",
    "files",
    "indexes",
    "sorts",
    "orders",
    "arranges",
    "assembles",
    "unfolds",
    "expands",
    "contracts",
    "narrows",
    "widens",
    "settles",
    "rests",
    "pauses",
    "hesitates",
    "falters",
    "breathes",
    "hums",
    "echoes",
    "reflects",
    "mirrors",
    "doubles",
    "halves",
    "divides",
    "joins",
    "binds",
    "frees",
    "admits",
    "refuses",
    "declines",
    "consents",
    "permits",
    "allows",
    "accepts",
    "receives",
    "gives",
    "offers",
    "extends",
    "reaches",
    "touches",
    "grazes",
    "traces",
    "follows",
    "leads",
    "carries",
    "bears",
    "transmits",
    "relays",
    "forwards",
    "delivers",
    "repays",
    "recalls",
    "retains",
    "discards",
    "erases",
    "overwrites",
    "revises",
    "completes",
    "abandons",
    "expires"
  ],
  adjectives: [
    "quiet",
    "attentive",
    "partial",
    "unfinished",
    "legible",
    "narrow",
    "slow",
    "late",
    "present",
    "consented",
    "seen",
    "archived",
    "nameless",
    "returning",
    "silent",
    "still",
    "faint",
    "dim",
    "pale",
    "thin",
    "sparse",
    "brief",
    "fleeting",
    "momentary",
    "transient",
    "provisional",
    "tentative",
    "uncertain",
    "hesitant",
    "patient",
    "deliberate",
    "slight",
    "minor",
    "small",
    "modest",
    "plain",
    "bare",
    "empty",
    "hollow",
    "vacant",
    "absent",
    "distant",
    "remote",
    "near",
    "close",
    "adjacent",
    "parallel",
    "recursive",
    "repeated",
    "doubled",
    "folded",
    "creased",
    "worn",
    "faded",
    "weathered",
    "residual",
    "leftover",
    "remaining",
    "unanswered",
    "unread",
    "unmarked",
    "unsigned",
    "unnamed",
    "anonymous",
    "unwitnessed",
    "unrecorded",
    "recorded",
    "logged",
    "counted",
    "numbered",
    "indexed",
    "filed",
    "stored",
    "kept",
    "held",
    "withheld",
    "released",
    "open",
    "closed",
    "sealed",
    "locked",
    "ajar",
    "permeable",
    "porous",
    "transparent",
    "translucent",
    "opaque",
    "visible",
    "invisible",
    "hidden",
    "exposed",
    "latent",
    "dormant",
    "idle",
    "waiting",
    "pending",
    "queued",
    "buffered",
    "cached",
    "compressed",
    "expanded",
    "delayed",
    "belated",
    "early",
    "gradual",
    "incremental",
    "accumulated",
    "layered",
    "granular",
    "textured",
    "weightless",
    "light",
    "heavy",
    "shared"
  ],
  prepositions: [
    "into",
    "against",
    "before",
    "beneath",
    "through",
    "toward",
    "inside",
    "between",
    "after",
    "without",
    "with",
    "near",
    "under",
    "over",
    "above",
    "below",
    "beyond",
    "within",
    "among",
    "across",
    "along",
    "past",
    "behind",
    "beside",
    "around",
    "despite",
    "throughout",
    "underneath",
    "amid",
    "alongside"
  ],
  conjunctions: [
    "and",
    "or",
    "then",
    "yet",
    "because",
    "so that",
    "until",
    "while",
    "but",
    "nor",
    "so",
    "as",
    "if",
    "though",
    "although",
    "whereas",
    "since",
    "unless",
    "when",
    "where",
    "once",
    "even so",
    "and yet",
    "or else"
  ],
  sutures: [
    "\u2014 the room notes this \u2014",
    "\u2014 archive holds \u2014",
    "\u2014 signal received \u2014",
    "\u2014 witness counted \u2014",
    "\u2014 without name \u2014",
    "\u2014 after latency \u2014",
    "\u2014 a small consent \u2014",
    "\u2014 folded once \u2014",
    "\u2014 the log remembers \u2014",
    "\u2014 address withheld \u2014",
    "\u2014 no name given \u2014",
    "\u2014 counted and kept \u2014",
    "\u2014 seen, not stored \u2014",
    "\u2014 a brief presence \u2014",
    "\u2014 the cache forgets \u2014",
    "\u2014 received in full \u2014",
    "\u2014 the server attends \u2014",
    "\u2014 marked in passing \u2014",
    "\u2014 held a moment \u2014",
    "\u2014 the page turns \u2014",
    "\u2014 between two requests \u2014",
    "\u2014 a quiet arrival \u2014",
    "\u2014 nothing returned \u2014",
    "\u2014 the threshold notes it \u2014",
    "\u2014 logged without trace \u2014",
    "\u2014 a partial answer \u2014",
    "\u2014 consent, then silence \u2014",
    "\u2014 the column holds \u2014",
    "\u2014 after the pause \u2014",
    "\u2014 witnessed once \u2014",
    "\u2014 the record stands \u2014",
    "\u2014 folded again \u2014",
    "\u2014 a small latency \u2014",
    "\u2014 the hand withdraws \u2014",
    "\u2014 still counted \u2014",
    "\u2014 the margin keeps it \u2014",
    "\u2014 an address, hashed \u2014",
    "\u2014 received, not read \u2014",
    "\u2014 the room stays \u2014",
    "\u2014 a visit, counted \u2014",
    "\u2014 the signal fades \u2014",
    "\u2014 kept for now \u2014",
    "\u2014 the archive widens \u2014",
    "\u2014 nothing withheld \u2014",
    "\u2014 a breath of latency \u2014",
    "\u2014 the door, ajar \u2014",
    "\u2014 noted and released \u2014",
    "\u2014 the witness departs \u2014",
    "\u2014 a residue remains \u2014",
    "\u2014 the surface answers \u2014",
    "\u2014 in the interval \u2014",
    "\u2014 a name, then none \u2014",
    "\u2014 the buffer holds \u2014",
    "\u2014 attention paid \u2014",
    "\u2014 the visit ends \u2014",
    "\u2014 so far, so kept \u2014",
    "\u2014 another arrival \u2014",
    "\u2014 the echo settles \u2014",
    "\u2014 recorded in passing \u2014",
    "\u2014 a slow consent \u2014",
    "\u2014 the queue advances \u2014",
    "\u2014 nothing forgotten yet \u2014"
  ],
  punctuation: [".", ",", ";", "\u2014"],
  corruption_glyphs: ["\u25AE", "\u2591", "\u2592", "\u2593", "\u25CC", "\u25CD", "\u25EF", "\u2301", "\u2307", "\u2393", "\u2394", "\u23DA"]
};
var ROLES = Object.freeze([
  "openings",
  "nouns",
  "verbs",
  "prepositions",
  "adjectives",
  "conjunctions",
  "sutures",
  "punctuation"
]);

// src/body-for-visits/bot.js
var RULES = [
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
      "oai-searchbot"
    ]
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
      "whatsapp"
    ]
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
      "headlesschrome"
    ]
  },
  { bucket: "generic", needles: ["bot", "crawler", "spider"] }
];
function classifyUA(ua) {
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
__name(classifyUA, "classifyUA");

// src/body-for-visits/grammar.js
var NEXT_ROLES = {
  openings: ["adjectives", "nouns"],
  punctuation: ["openings", "adjectives", "nouns"],
  sutures: ["adjectives", "nouns", "verbs"],
  adjectives: ["nouns", "conjunctions"],
  nouns: ["verbs", "conjunctions", "punctuation"],
  verbs: ["prepositions", "adjectives", "nouns", "punctuation"],
  prepositions: ["adjectives", "nouns"],
  conjunctions: ["adjectives", "nouns", "verbs"]
};
var SUTURE_EVERY = 7;
var PUNCT_EVERY = 13;
var ROLE_ALPHA = 1;
var WORD_ALPHA = 1;
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
__name(mulberry32, "mulberry32");
function pickWeighted(rng, items, weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}
__name(pickWeighted, "pickWeighted");
function allowedNext(prevRole) {
  return NEXT_ROLES[prevRole] || NEXT_ROLES.punctuation;
}
__name(allowedNext, "allowedNext");
function inferModel(sequence) {
  const roles = {};
  const words = {};
  const bump = /* @__PURE__ */ __name((table, a, b) => {
    if (a == null || b == null) return;
    const row = table[a] || (table[a] = {});
    row[b] = (row[b] || 0) + 1;
  }, "bump");
  const seq = Array.isArray(sequence) ? sequence : [];
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1];
    const cur = seq[i];
    if (!prev || !cur) continue;
    bump(words, prev.token, cur.token);
    const destIndex = i + 1;
    const forced = destIndex % SUTURE_EVERY === 0 || destIndex % PUNCT_EVERY === 0;
    if (!forced) bump(roles, prev.role, cur.role);
  }
  return { roles, words };
}
__name(inferModel, "inferModel");
function chooseRole(rng, prevRole, model) {
  const choices = allowedNext(prevRole);
  const learned = model && model.roles ? model.roles[prevRole] : null;
  if (!learned) {
    return choices[Math.floor(rng() * choices.length)];
  }
  const weights = choices.map((r) => (learned[r] || 0) + ROLE_ALPHA);
  return pickWeighted(rng, choices, weights);
}
__name(chooseRole, "chooseRole");
function chooseToken(rng, pool, prevToken, model) {
  const learned = model && model.words && prevToken != null ? model.words[prevToken] : null;
  if (!learned) {
    return pool[Math.floor(rng() * pool.length)];
  }
  const weights = pool.map((w) => (learned[w] || 0) + WORD_ALPHA);
  return pickWeighted(rng, pool, weights);
}
__name(chooseToken, "chooseToken");
function selectNextToken(prevRole, eventIndex, seed, prevToken = null, model = null) {
  const rng = mulberry32((seed ^ eventIndex * 2654435761) >>> 0);
  let role;
  if (!prevRole) {
    role = "openings";
  } else if (eventIndex > 0 && eventIndex % PUNCT_EVERY === 0) {
    role = "punctuation";
  } else if (eventIndex > 0 && eventIndex % SUTURE_EVERY === 0) {
    role = "sutures";
  } else {
    role = chooseRole(rng, prevRole, model);
  }
  const pool = BUCKETS[role] || BUCKETS.nouns;
  let token = chooseToken(rng, pool, prevToken, model);
  for (let i = 0; i < 4 && token === prevToken && pool.length > 1; i++) {
    token = chooseToken(rng, pool, prevToken, model);
  }
  return { token, role };
}
__name(selectNextToken, "selectNextToken");

// src/body-for-visits/decide.js
var COOLDOWN_MS_DEFAULT = 24 * 60 * 60 * 1e3;
function decideQualify({
  ua,
  lastSessionTs,
  prevRole,
  prevToken,
  humanEventIndex,
  seed,
  now = Date.now(),
  cooldownMs = COOLDOWN_MS_DEFAULT,
  model = null
}) {
  const bot = classifyUA(ua);
  if (bot.isBot) {
    return { action: "bot", bucket: bot.bucket };
  }
  if (typeof lastSessionTs === "number" && now - lastSessionTs < cooldownMs) {
    return { action: "cooldown" };
  }
  const { token, role } = selectNextToken(
    prevRole,
    humanEventIndex,
    seed >>> 0,
    prevToken,
    model
  );
  return { action: "append", token, role, ua_class: "browser" };
}
__name(decideQualify, "decideQualify");

// src/body-for-visits/fold.js
var MAX_VISIBLE = 180;
var KEEP_TAIL = 90;
function foldBody(body, foldCount, foldGenerations, now = Date.now()) {
  if (!Array.isArray(body) || body.length <= MAX_VISIBLE) {
    return { body, fold_count: foldCount, fold_generations: foldGenerations };
  }
  const hadMarker = body.length > 0 && body[0].role === "fold_marker";
  const real = hadMarker ? body.slice(1) : body;
  const cut = real.length - KEEP_TAIL;
  if (cut <= 0) {
    return { body, fold_count: foldCount, fold_generations: foldGenerations };
  }
  const absorbed = real.slice(0, cut);
  const tail = real.slice(cut);
  const nextCount = foldCount + absorbed.length;
  const nextGens = foldGenerations + 1;
  const marker = {
    token: `\u27E8folded \xD7${nextGens}: ${nextCount} tokens held\u27E9`,
    role: "fold_marker",
    event_id: null,
    ts: now
  };
  return {
    body: [marker, ...tail],
    fold_count: nextCount,
    fold_generations: nextGens
  };
}
__name(foldBody, "foldBody");

// src/body-for-visits/snapshot.js
var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var esc = /* @__PURE__ */ __name((s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]), "esc");
function renderSnapshotHTML(state, takenAt = (/* @__PURE__ */ new Date()).toISOString()) {
  const body = Array.isArray(state?.body) ? state.body : [];
  const fringe = String(state?.fringe || "");
  const version = Number(state?.body_version || 0);
  const folded = Number(state?.fold_count || 0);
  const corrupt = Number(state?.corruption_count || 0);
  const HUG_LEFT = /* @__PURE__ */ new Set([".", ",", ";"]);
  let bodyHTML = "";
  body.forEach((t, i) => {
    if (i > 0 && !HUG_LEFT.has(t.token)) bodyHTML += " ";
    bodyHTML += t.role === "fold_marker" ? `<span class="fold-marker">${esc(t.token)}</span>` : esc(t.token);
  });
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>(to)complete \u2014 snapshot</title>
<style>
:root { --bg:#fff; --ink:#111; --ink-soft:rgba(17,17,17,.55); --ink-faint:rgba(17,17,17,.28); }
html,body { margin:0; background:var(--bg); color:var(--ink); }
main { max-width:640px; margin:14vh auto 18vh; padding:0 24px;
       font:19px/1.62 ui-serif,"Iowan Old Style","Hoefler Text",Garamond,serif;
       text-align:left; text-wrap:pretty; }
.fold-marker { font-style:italic; color:var(--ink-soft); }
.status,.fringe { font:11px/1.4 ui-monospace,"SF Mono",Menlo,monospace;
                  letter-spacing:.18em; text-transform:uppercase; color:var(--ink-faint);
                  margin-top:64px; }
.fringe { letter-spacing:.4em; margin-top:8px; text-transform:none; }
</style>
</head><body><main>
<p class="status">static snapshot taken at ${esc(takenAt)} \u2014 not the live work</p>
<p class="body-text">${bodyHTML || '<span class="fold-marker">\u27E8awaiting first visit\u27E9</span>'}</p>
<p class="fringe">${esc(fringe)}</p>
<p class="status">body version ${version} \xB7 ${folded} folded \xB7 ${corrupt} corruptions</p>
</main></body></html>
`;
}
__name(renderSnapshotHTML, "renderSnapshotHTML");

// src/index.ts
var FEED_SNAPSHOT_KEY = "feed:snapshot-v1";
var FEED_MAX_ITEMS = 500;
var FEED_EDGE_CACHE_SECONDS = 60;
var DISCOVERY_LINK_HEADER = [
  '<https://cbassuarez.com/.well-known/cli-letter.txt>; rel="alternate"; type="text/plain"',
  '<ssh://ssh.cbassuarez.com>; rel="alternate"',
  '<gemini://gemini.cbassuarez.com>; rel="alternate"',
  '<https://cbassuarez.com/humans.txt>; rel="author"'
].join(", ");
var jsonHeaders = /* @__PURE__ */ __name((origin) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  link: DISCOVERY_LINK_HEADER
}), "jsonHeaders");
var clean = /* @__PURE__ */ __name((value) => String(value ?? "").replace(/\s+/g, " ").trim(), "clean");
var stripTags = /* @__PURE__ */ __name((value) => value.replace(/<[^>]+>/g, ""), "stripTags");
var toNonNegativeInt = /* @__PURE__ */ __name((value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.floor(parsed);
  return rounded >= 0 ? rounded : null;
}, "toNonNegativeInt");
var short = /* @__PURE__ */ __name((value, max = 120) => {
  const text = clean(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}\u2026` : text;
}, "short");
var sourceBase = /* @__PURE__ */ __name((source) => clean(source).toLowerCase().split(":")[0] || "feed", "sourceBase");
var parseFeedTimeMs = /* @__PURE__ */ __name((value) => {
  const ms = new Date(clean(value)).getTime();
  return Number.isFinite(ms) ? ms : 0;
}, "parseFeedTimeMs");
var normalizeIsoAt = /* @__PURE__ */ __name((value) => {
  const ms = parseFeedTimeMs(value);
  return ms > 0 ? new Date(ms).toISOString() : null;
}, "normalizeIsoAt");
var TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";
var CONTACT_TURNSTILE_ACTION = "contact_form_v1";
var CONTACT_EMAIL_REGEX = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/i;
var CONTACT_ALLOWED_TOPICS = /* @__PURE__ */ new Set(["commission", "performance", "collab", "press", "other"]);
var CONTACT_BLOCKED_LOCAL_PARTS = /* @__PURE__ */ new Set([
  "a",
  "aa",
  "test",
  "testing",
  "asdf",
  "qwerty",
  "user",
  "admin",
  "none",
  "na",
  "n/a"
]);
var CONTACT_BLOCKED_DOMAINS = /* @__PURE__ */ new Set([
  "example.com",
  "test.com",
  "localhost",
  "mailinator.com",
  "tempmail.com",
  "fake.com"
]);
function parseSpotifyEvent(text) {
  const cleaned = clean(text);
  const match = cleaned.match(/^(now playing|played|last played|resumed|paused):\s*(.+)$/i);
  if (!match) {
    return { action: "other", label: cleaned.toLowerCase() };
  }
  return { action: clean(match[1]).toLowerCase(), label: clean(match[2]).toLowerCase() };
}
__name(parseSpotifyEvent, "parseSpotifyEvent");
function spotifyLabelRaw(text) {
  const cleaned = clean(text);
  const match = cleaned.match(/^(?:now playing|played|last played|resumed|paused):\s*(.+)$/i);
  return clean(match?.[1] || cleaned);
}
__name(spotifyLabelRaw, "spotifyLabelRaw");
function withSpotifyAction(item, action) {
  const label = spotifyLabelRaw(item.text);
  return {
    ...item,
    text: `${action}: ${label}`,
    isPlaying: action === "now playing"
  };
}
__name(withSpotifyAction, "withSpotifyAction");
function sanitizeSpotifyTimeline(items) {
  const newestFirst = [...items].sort((a, b) => parseFeedTimeMs(b.at) - parseFeedTimeMs(a.at));
  const kept = [];
  const seenSessionKeys = /* @__PURE__ */ new Set();
  const seenBurstKeys = /* @__PURE__ */ new Set();
  let seenNewestSpotifyState = false;
  for (const item of newestFirst) {
    if (sourceBase(item.source) !== "spotify") {
      kept.push(item);
      continue;
    }
    const atMs = parseFeedTimeMs(item.at);
    const { action, label } = parseSpotifyEvent(item.text);
    const trackKey = clean(item.media || item.url || label);
    if (!trackKey) {
      kept.push(item);
      continue;
    }
    if (action === "last played" || action === "played") {
      continue;
    }
    if (action === "now playing" || action === "resumed" || action === "paused") {
      if (action === "now playing" && item.isPlaying === false) continue;
      const progressBucket = Math.round((toNonNegativeInt(item.progressMs) || 0) / 3e3);
      const timeBucket = Math.round(atMs / 9e4);
      const burstKey = `burst:${trackKey}:${action}:${progressBucket}:${timeBucket}`;
      if (seenBurstKeys.has(burstKey)) continue;
      seenBurstKeys.add(burstKey);
      const sessionKey = `play:${trackKey}:${clean(item.at)}`;
      if (seenSessionKeys.has(sessionKey)) continue;
      seenSessionKeys.add(sessionKey);
      if (action === "paused") {
        seenNewestSpotifyState = true;
        kept.push(withSpotifyAction(item, "paused"));
        continue;
      }
      if (!seenNewestSpotifyState && item.isPlaying !== false) {
        kept.push(withSpotifyAction(item, "now playing"));
        seenNewestSpotifyState = true;
      } else {
        seenNewestSpotifyState = true;
        kept.push(withSpotifyAction(item, "played"));
      }
      continue;
    }
    kept.push(item);
  }
  return kept.sort((a, b) => parseFeedTimeMs(b.at) - parseFeedTimeMs(a.at));
}
__name(sanitizeSpotifyTimeline, "sanitizeSpotifyTimeline");
function timelineIdentity(item) {
  if (sourceBase(item.source) !== "spotify") {
    return `${item.source}|${item.at}|${item.url || ""}|${item.text}`;
  }
  const { label } = parseSpotifyEvent(item.text);
  const trackKey = clean(item.media || item.url || label);
  const atKey = clean(item.at);
  return `spotify|${trackKey}|${atKey}`;
}
__name(timelineIdentity, "timelineIdentity");
function formatAgeLabel(msAgo) {
  if (!Number.isFinite(msAgo) || msAgo < 0) return "just now";
  const minutes = Math.floor(msAgo / 6e4);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
__name(formatAgeLabel, "formatAgeLabel");
function selectCurrentActivity(items, nowMs = Date.now()) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const ordered = items.filter((item) => clean(item?.text).length > 0).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  if (ordered.length === 0) return null;
  const isRecent = /* @__PURE__ */ __name((item, windowMs = 10 * 60 * 1e3) => {
    const atMs = new Date(item.at).getTime();
    return Number.isFinite(atMs) && nowMs - atMs <= windowMs;
  }, "isRecent");
  const build = /* @__PURE__ */ __name((item, isLive) => {
    const atMs = new Date(item.at).getTime();
    const ageLabel = isLive ? "live now" : formatAgeLabel(nowMs - atMs);
    return {
      source: clean(item.source || "feed"),
      text: clean(item.text),
      at: clean(item.at || new Date(nowMs).toISOString()),
      url: clean(item.url || "") || void 0,
      isLive,
      ageLabel
    };
  }, "build");
  const latestSpotify = ordered.find((item) => sourceBase(item.source) === "spotify");
  if (latestSpotify && Boolean(latestSpotify.isPlaying)) return build(latestSpotify, true);
  const instagramLive = ordered.find((item) => sourceBase(item.source) === "instagram" && isRecent(item));
  if (instagramLive) return build(instagramLive, true);
  const githubLive = ordered.find((item) => sourceBase(item.source) === "github" && isRecent(item));
  if (githubLive) return build(githubLive, true);
  const bandcampLive = ordered.find((item) => sourceBase(item.source) === "bandcamp" && isRecent(item));
  if (bandcampLive) return build(bandcampLive, true);
  return build(ordered[0], false);
}
__name(selectCurrentActivity, "selectCurrentActivity");
async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText} :: ${body.slice(0, 240)}`);
  }
  return response.json();
}
__name(fetchJson, "fetchJson");
async function fetchGitHub(env, limit) {
  const username = clean(env.GITHUB_USERNAME || "cbassuarez");
  if (!username) return [];
  const response = await fetch(`https://github.com/${encodeURIComponent(username)}.atom`);
  if (!response.ok) {
    throw new Error(`github atom ${response.status}`);
  }
  const xml = await response.text();
  const items = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRegex.exec(xml)) && items.length < limit) {
    const block = match[1];
    const title = short(decodeHtml(clean((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "")), 108);
    const link = clean((block.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "");
    const updated = clean((block.match(/<updated>([\s\S]*?)<\/updated>/i) || [])[1] || "");
    if (!title) continue;
    items.push({
      source: `github:${username}`,
      text: title,
      at: updated || (/* @__PURE__ */ new Date()).toISOString(),
      url: link || `https://github.com/${username}`
    });
  }
  return items;
}
__name(fetchGitHub, "fetchGitHub");
function decodeHtml(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
__name(decodeHtml, "decodeHtml");
async function fetchBandcamp(env, limit) {
  const domain = clean(env.BANDCAMP_DOMAIN || "cbassuarez.bandcamp.com");
  if (!domain) return [];
  const response = await fetch(`https://${domain}/music`, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      accept: "text/html,application/xhtml+xml"
    }
  });
  if (!response.ok) {
    throw new Error(`bandcamp ${response.status}`);
  }
  const html = await response.text();
  const items = [];
  const itemRegex = /<li[^>]*class="[^"]*music-grid-item[^"]*"[\s\S]*?<a href="([^"]+)"[\s\S]*?<p class="title">\s*([\s\S]*?)\s*<\/p>/gi;
  let match;
  const releases = [];
  while ((match = itemRegex.exec(html)) && releases.length < limit) {
    const href = clean(match[1]);
    const title = short(stripTags(decodeHtml(clean(match[2]))), 96);
    if (!href || !title) continue;
    releases.push({
      title,
      url: href.startsWith("http") ? href : `https://${domain}${href}`
    });
  }
  async function fetchBandcampPublishedAt(url) {
    const parseDateFromHtml = /* @__PURE__ */ __name((releaseHtml) => {
      const datePublishedRaw = clean((releaseHtml.match(/"datePublished"\s*:\s*"([^"]+)"/i) || [])[1] || "");
      if (datePublishedRaw) {
        const ts = Date.parse(datePublishedRaw);
        if (Number.isFinite(ts)) return new Date(ts).toISOString();
      }
      const pubDateMeta = clean(
        (releaseHtml.match(/<meta[^>]+property="og:pubdate"[^>]+content="([^"]+)"/i) || [])[1] || ""
      );
      if (pubDateMeta) {
        const ts = Date.parse(pubDateMeta);
        if (Number.isFinite(ts)) return new Date(ts).toISOString();
      }
      const descriptionMeta = clean((releaseHtml.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) || [])[1] || "");
      const releasedInDescription = clean((descriptionMeta.match(/\breleased\s+(\d{1,2}\s+\w+\s+\d{4})/i) || [])[1] || "");
      if (releasedInDescription) {
        const ts = Date.parse(releasedInDescription);
        if (Number.isFinite(ts)) return new Date(ts).toISOString();
      }
      return null;
    }, "parseDateFromHtml");
    const candidates = [`${url}?output=1`, url];
    for (const target of candidates) {
      const releaseResponse = await fetch(target, {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
          accept: "text/html,application/xhtml+xml"
        }
      });
      if (!releaseResponse.ok) continue;
      const parsed = parseDateFromHtml(await releaseResponse.text());
      if (parsed) return parsed;
    }
    return null;
  }
  __name(fetchBandcampPublishedAt, "fetchBandcampPublishedAt");
  const detailed = await Promise.all(
    releases.map(async (release) => {
      const at = await fetchBandcampPublishedAt(release.url);
      if (!at) return null;
      return {
        source: "bandcamp",
        text: `release: ${release.title}`,
        at,
        url: release.url
      };
    })
  );
  for (const row of detailed) {
    if (row) items.push(row);
  }
  return items;
}
__name(fetchBandcamp, "fetchBandcamp");
async function fetchInstagram(env, limit) {
  const userId = clean(env.IG_USER_ID);
  const token = clean(env.IG_ACCESS_TOKEN);
  if (!userId || !token) return [];
  const query = `fields=id,caption,media_type,permalink,timestamp,media_url&limit=${Math.min(limit, 100)}&access_token=${encodeURIComponent(
    token
  )}`;
  let data;
  try {
    data = await fetchJson(`https://graph.facebook.com/v23.0/${encodeURIComponent(userId)}/media?${query}`);
  } catch {
    data = await fetchJson(`https://graph.instagram.com/${encodeURIComponent(userId)}/media?${query}`);
  }
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows.slice(0, limit).map((post) => ({
    source: "instagram",
    text: short(post?.caption || `new ${clean(post?.media_type || "post").toLowerCase()}`, 110),
    at: post?.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
    url: clean(post?.permalink),
    media: clean(post?.media_url)
  }));
}
__name(fetchInstagram, "fetchInstagram");
async function readSpotifyPlaybackState(env) {
  const kv = env.HITS_KV;
  if (!kv) return null;
  const raw = await kv.get("feed:spotify-state-v1");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const observedAt = clean(parsed?.observedAt);
    const trackKey = clean(parsed?.trackKey);
    if (!observedAt && !trackKey) return null;
    return {
      trackKey,
      trackName: clean(parsed?.trackName),
      trackUrl: clean(parsed?.trackUrl) || void 0,
      trackUri: clean(parsed?.trackUri) || void 0,
      isPlaying: Boolean(parsed?.isPlaying),
      progressMs: Number.isFinite(parsed?.progressMs) ? parsed.progressMs : 0,
      durationMs: Number.isFinite(parsed?.durationMs) ? parsed.durationMs : 0,
      sessionStartedAt: clean(parsed?.sessionStartedAt) || void 0,
      observedAt: observedAt || (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch {
    return null;
  }
}
__name(readSpotifyPlaybackState, "readSpotifyPlaybackState");
async function writeSpotifyPlaybackState(env, state) {
  const kv = env.HITS_KV;
  if (!kv) return;
  await kv.put("feed:spotify-state-v1", JSON.stringify(state));
}
__name(writeSpotifyPlaybackState, "writeSpotifyPlaybackState");
async function fetchSpotify(env) {
  const clientId = clean(env.SPOTIFY_CLIENT_ID);
  const clientSecret = clean(env.SPOTIFY_CLIENT_SECRET);
  const refreshToken = clean(env.SPOTIFY_REFRESH_TOKEN);
  if (!clientId || !clientSecret || !refreshToken) return [];
  const auth = btoa(`${clientId}:${clientSecret}`);
  const tokenBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: tokenBody.toString()
  });
  if (!tokenResponse.ok) {
    throw new Error(`spotify token ${tokenResponse.status}`);
  }
  const tokenData = await tokenResponse.json();
  const accessToken = clean(tokenData.access_token);
  if (!accessToken) return [];
  const headers = { authorization: `Bearer ${accessToken}` };
  const current = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers });
  const previousState = await readSpotifyPlaybackState(env);
  const items = [];
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  if (current.status === 200) {
    const payload = await current.json();
    const track = payload?.item;
    if (track) {
      const artists = Array.isArray(track?.artists) ? track.artists.map((artist) => clean(artist?.name)).filter(Boolean).join(", ") : "";
      const name = clean(track?.name);
      const url = clean(track?.external_urls?.spotify || "");
      const uri = clean(track?.uri || "");
      const trackLabel = `${artists}${artists && name ? " \u2014 " : ""}${name}`;
      const trackKey = clean(uri || url || trackLabel);
      const isPlaying = Boolean(payload?.is_playing);
      const progressMs = Number.isFinite(payload?.progress_ms) ? payload.progress_ms : 0;
      const durationMs = Number.isFinite(track?.duration_ms) ? track.duration_ms : 0;
      const startedAtMs = Math.max(0, nowMs - Math.max(0, progressMs));
      const startedAtIso = new Date(startedAtMs).toISOString();
      const sameTrack = previousState?.trackKey === trackKey && trackKey.length > 0;
      const sessionStartedAt = sameTrack ? clean(previousState?.sessionStartedAt) || startedAtIso : startedAtIso;
      const statusPrefix = isPlaying ? "now playing" : "paused";
      items.push({
        source: "spotify",
        text: `${statusPrefix}: ${trackLabel}`,
        at: sessionStartedAt,
        url: url || void 0,
        media: uri || void 0,
        progressMs,
        durationMs,
        isPlaying
      });
      await writeSpotifyPlaybackState(env, {
        trackKey,
        trackName: trackLabel,
        trackUrl: url || void 0,
        trackUri: uri || void 0,
        isPlaying,
        progressMs,
        durationMs,
        sessionStartedAt,
        observedAt: nowIso
      });
    }
  } else if (current.status === 204) {
    if (previousState?.trackName && previousState?.sessionStartedAt) {
      items.push({
        source: "spotify",
        text: `paused: ${previousState.trackName}`,
        at: previousState.sessionStartedAt,
        url: previousState.trackUrl,
        media: previousState.trackUri,
        progressMs: previousState.progressMs || 0,
        durationMs: previousState.durationMs || 0,
        isPlaying: false
      });
      await writeSpotifyPlaybackState(env, {
        ...previousState,
        isPlaying: false,
        observedAt: nowIso
      });
    }
  }
  return items;
}
__name(fetchSpotify, "fetchSpotify");
async function fetchX(env, limit) {
  const username = clean(env.X_USERNAME);
  const bearer = clean(env.X_BEARER_TOKEN);
  if (!username || !bearer) return [];
  const headers = { authorization: `Bearer ${bearer}` };
  const userData = await fetchJson(
    `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=id`,
    { headers }
  );
  const userId = clean(userData?.data?.id);
  if (!userId) return [];
  const tweetsData = await fetchJson(
    `https://api.twitter.com/2/users/${encodeURIComponent(
      userId
    )}/tweets?exclude=retweets,replies&max_results=${Math.min(limit, 100)}&tweet.fields=created_at`,
    { headers }
  );
  const rows = Array.isArray(tweetsData?.data) ? tweetsData.data : [];
  return rows.slice(0, limit).map((tweet) => ({
    source: `x:${username}`,
    text: short(tweet?.text, 120),
    at: tweet?.created_at || (/* @__PURE__ */ new Date()).toISOString(),
    url: `https://x.com/${username}/status/${clean(tweet?.id)}`
  }));
}
__name(fetchX, "fetchX");
async function fetchYouTube(env, limit) {
  const apiKey = clean(env.YT_API_KEY);
  const channelId = clean(env.YT_CHANNEL_ID);
  if (!apiKey || !channelId) return [];
  const data = await fetchJson(
    `https://www.googleapis.com/youtube/v3/search?key=${encodeURIComponent(apiKey)}&channelId=${encodeURIComponent(
      channelId
    )}&part=snippet,id&order=date&maxResults=${Math.min(limit, 50)}`
  );
  const rows = Array.isArray(data?.items) ? data.items : [];
  return rows.filter((row) => row?.id?.videoId).slice(0, limit).map((video) => ({
    source: "youtube",
    text: short(video?.snippet?.title || "new upload", 120),
    at: video?.snippet?.publishedAt || (/* @__PURE__ */ new Date()).toISOString(),
    url: `https://www.youtube.com/watch?v=${video.id.videoId}`
  }));
}
__name(fetchYouTube, "fetchYouTube");
async function incrementHitCount(env) {
  const kv = env.HITS_KV;
  if (!kv) {
    throw new Error("hits kv missing");
  }
  const deltaKey = "hits:delta-v2";
  const resolveCloudflareBaseline = /* @__PURE__ */ __name(async () => {
    const zoneId = clean(env.CF_ZONE_ID);
    const token = clean(env.CF_API_TOKEN);
    if (!zoneId || !token) return null;
    const sinceDay = clean(env.CF_ANALYTICS_SINCE || "");
    const defaultSince = "2020-01-01";
    const startDay = /^\d{4}-\d{2}-\d{2}$/.test(sinceDay) ? sinceDay : defaultSince;
    const toIsoDay = /* @__PURE__ */ __name((date) => date.toISOString().slice(0, 10), "toIsoDay");
    const addDaysUtc = /* @__PURE__ */ __name((date, days) => {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + days);
      return next;
    }, "addDaysUtc");
    const today = /* @__PURE__ */ new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const earliestAvailable = addDaysUtc(todayUtc, -364);
    let cursor = /* @__PURE__ */ new Date(`${startDay}T00:00:00Z`);
    if (Number.isNaN(cursor.getTime())) {
      cursor = /* @__PURE__ */ new Date(`${defaultSince}T00:00:00Z`);
    }
    if (cursor.getTime() < earliestAvailable.getTime()) {
      cursor = earliestAvailable;
    }
    const query = "query($zoneTag: string, $since: Date, $until: Date){ viewer { zones(filter: { zoneTag: $zoneTag }) { httpRequests1dGroups(filter: { date_geq: $since, date_leq: $until }, limit: 400) { sum { pageViews } } } } }";
    let totalPageViews = 0;
    while (cursor.getTime() <= todayUtc.getTime()) {
      const chunkEnd = addDaysUtc(cursor, 363);
      const until = chunkEnd.getTime() > todayUtc.getTime() ? todayUtc : chunkEnd;
      const body = JSON.stringify({
        query,
        variables: {
          zoneTag: zoneId,
          since: toIsoDay(cursor),
          until: toIsoDay(until)
        }
      });
      const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          "content-type": "application/json"
        },
        body
      });
      if (!response.ok) {
        throw new Error(`cloudflare graphql ${response.status}`);
      }
      const payload = await response.json();
      if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
        const firstError = clean(payload.errors[0]?.message || "cloudflare graphql error");
        throw new Error(firstError);
      }
      const groups = payload?.data?.viewer?.zones?.[0]?.httpRequests1dGroups;
      if (Array.isArray(groups)) {
        for (const group of groups) {
          const pageViews = toNonNegativeInt(group?.sum?.pageViews) ?? 0;
          totalPageViews += pageViews;
        }
      }
      cursor = addDaysUtc(until, 1);
    }
    return totalPageViews;
  }, "resolveCloudflareBaseline");
  let baseline = toNonNegativeInt(env.HITS_BASELINE);
  if (baseline === null) {
    try {
      baseline = await resolveCloudflareBaseline();
    } catch {
      baseline = 0;
    }
  }
  const deltaRaw = await kv.get(deltaKey);
  const delta = toNonNegativeInt(deltaRaw) ?? 0;
  const nextDelta = delta + 1;
  await kv.put(deltaKey, String(nextDelta));
  return baseline + nextDelta;
}
__name(incrementHitCount, "incrementHitCount");
async function readGuestbookEntries(env) {
  const kv = env.HITS_KV;
  if (!kv) {
    throw new Error("guestbook kv missing");
  }
  const raw = await kv.get("guestbook:entries-v1");
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const rows = parsed.map((item) => ({
    name: clean(item?.name).slice(0, 48),
    message: clean(item?.message).slice(0, 280),
    at: clean(item?.at) || (/* @__PURE__ */ new Date()).toISOString()
  })).filter((item) => item.message.length > 0);
  return rows;
}
__name(readGuestbookEntries, "readGuestbookEntries");
async function writeGuestbookEntries(env, entries) {
  const kv = env.HITS_KV;
  if (!kv) {
    throw new Error("guestbook kv missing");
  }
  await kv.put("guestbook:entries-v1", JSON.stringify(entries));
}
__name(writeGuestbookEntries, "writeGuestbookEntries");
async function hashGuestbookSigner(ip) {
  const data = new TextEncoder().encode(`gb-signer-v1:${ip}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(hashGuestbookSigner, "hashGuestbookSigner");
async function hasGuestbookSignature(env, ip) {
  const kv = env.HITS_KV;
  if (!kv) return false;
  const hash = await hashGuestbookSigner(ip);
  return await kv.get(`guestbook:signer:${hash}`) !== null;
}
__name(hasGuestbookSignature, "hasGuestbookSignature");
async function recordGuestbookSignature(env, ip) {
  const kv = env.HITS_KV;
  if (!kv) return;
  const hash = await hashGuestbookSigner(ip);
  await kv.put(`guestbook:signer:${hash}`, (/* @__PURE__ */ new Date()).toISOString());
}
__name(recordGuestbookSignature, "recordGuestbookSignature");
var STRING_PLUCK_WINDOW_MS = 9e4;
var STRING_CURSOR_WINDOW_MS = 5e3;
var STRING_PLUCK_MAX = 200;
var STRING_CURSOR_MAX = 64;
var STRING_INCOMING_MAX_BYTES = 1024;
var STRING_PLUCK_RATE_CAPACITY = 6;
var STRING_PLUCK_RATE_REFILL_PER_SEC = 4;
var STRING_CURSOR_RATE_CAPACITY = 30;
var STRING_CURSOR_RATE_REFILL_PER_SEC = 30;
var STRING_PERSIST_DEBOUNCE_MS = 5e3;
var STRING_ALARM_INTERVAL_MS = 3e4;
var STRING_ROOM_NAME = "string:room-v1";
var STRING_PERSISTED_PLUCKS_KEY = "plucks-v1";
var clamp01 = /* @__PURE__ */ __name((value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}, "clamp01");
async function hashStringWho(ip) {
  const data = new TextEncoder().encode(`string-who-v1:${ip}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer)).slice(0, 6).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(hashStringWho, "hashStringWho");
function consumeToken(attachment, kind, now, capacity, refillPerSec) {
  const tokensField = kind === "pluck" ? "pluckTokens" : "cursorTokens";
  const lastField = kind === "pluck" ? "pluckLast" : "cursorLast";
  const elapsedSec = Math.max(0, (now - attachment[lastField]) / 1e3);
  const refilled = Math.min(capacity, attachment[tokensField] + elapsedSec * refillPerSec);
  attachment[lastField] = now;
  if (refilled < 1) {
    attachment[tokensField] = refilled;
    return false;
  }
  attachment[tokensField] = refilled - 1;
  return true;
}
__name(consumeToken, "consumeToken");
function readAttachment(ws) {
  try {
    const value = ws.deserializeAttachment();
    if (!value || typeof value !== "object") return null;
    const att = value;
    if (typeof att.who !== "string" || att.who.length === 0) return null;
    return att;
  } catch {
    return null;
  }
}
__name(readAttachment, "readAttachment");
var StringRoom = class {
  static {
    __name(this, "StringRoom");
  }
  state;
  env;
  plucks = [];
  cursors = /* @__PURE__ */ new Map();
  persistDirty = false;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    void this.state.blockConcurrencyWhile(async () => {
      try {
        const persisted = await this.state.storage.get(STRING_PERSISTED_PLUCKS_KEY);
        if (Array.isArray(persisted)) {
          const cutoff = Date.now() - STRING_PLUCK_WINDOW_MS;
          this.plucks = persisted.filter((p) => p && Number.isFinite(p.t) && p.t >= cutoff).slice(-STRING_PLUCK_MAX);
        }
      } catch {
        this.plucks = [];
      }
      const now = Date.now();
      for (const ws of this.state.getWebSockets()) {
        const att = readAttachment(ws);
        if (!att) continue;
        att.pluckTokens = STRING_PLUCK_RATE_CAPACITY;
        att.pluckLast = now;
        att.cursorTokens = STRING_CURSOR_RATE_CAPACITY;
        att.cursorLast = now;
        try {
          ws.serializeAttachment(att);
        } catch {
        }
      }
    });
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.endsWith("/socket")) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
    const upgrade = request.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }
    const claimed = clean(url.searchParams.get("who")).toLowerCase();
    const seed = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    const who = /^[0-9a-f]{6,16}$/i.test(claimed) ? claimed : await hashStringWho(seed);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const now = Date.now();
    const attachment = {
      who,
      joinedAt: now,
      lastSeenAt: now,
      pluckTokens: STRING_PLUCK_RATE_CAPACITY,
      pluckLast: now,
      cursorTokens: STRING_CURSOR_RATE_CAPACITY,
      cursorLast: now
    };
    server.serializeAttachment(attachment);
    this.state.acceptWebSocket(server);
    this.pruneExpired(now);
    const recentCursors = [...this.cursors.values()].filter((c) => c.t >= now - STRING_CURSOR_WINDOW_MS);
    try {
      server.send(
        JSON.stringify({
          type: "hello",
          who,
          serverNow: now,
          plucks: this.plucks,
          cursors: recentCursors
        })
      );
    } catch {
    }
    this.broadcast(JSON.stringify({ type: "join", who, t: now }), server);
    void this.scheduleMaintenanceAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string") return;
    if (raw.length === 0 || raw.length > STRING_INCOMING_MAX_BYTES) return;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const att = readAttachment(ws);
    if (!att) return;
    const now = Date.now();
    att.lastSeenAt = now;
    const type = String(parsed.type || "");
    if (type === "pluck") {
      if (!consumeToken(att, "pluck", now, STRING_PLUCK_RATE_CAPACITY, STRING_PLUCK_RATE_REFILL_PER_SEC)) {
        ws.serializeAttachment(att);
        return;
      }
      const pluck = {
        who: att.who,
        t: now,
        x: clamp01(parsed.x),
        y: clamp01(parsed.y),
        force: clamp01(parsed.force),
        pull: clamp01(parsed.pull),
        speed: clamp01(parsed.speed),
        width: clamp01(parsed.width),
        sign: Number(parsed.sign) < 0 ? -1 : 1
      };
      this.plucks.push(pluck);
      const cutoff = now - STRING_PLUCK_WINDOW_MS;
      if (this.plucks.length > STRING_PLUCK_MAX || this.plucks[0] && this.plucks[0].t < cutoff) {
        this.plucks = this.plucks.filter((p) => p.t >= cutoff).slice(-STRING_PLUCK_MAX);
      }
      this.persistDirty = true;
      void this.scheduleMaintenanceAlarm();
      this.broadcast(JSON.stringify({ type: "pluck", ...pluck }), ws);
      ws.serializeAttachment(att);
      return;
    }
    if (type === "cursor") {
      if (!consumeToken(att, "cursor", now, STRING_CURSOR_RATE_CAPACITY, STRING_CURSOR_RATE_REFILL_PER_SEC)) {
        ws.serializeAttachment(att);
        return;
      }
      const cursor = {
        who: att.who,
        t: now,
        x: clamp01(parsed.x)
      };
      this.cursors.set(att.who, cursor);
      if (this.cursors.size > STRING_CURSOR_MAX) {
        let oldestWho = null;
        let oldestT = Infinity;
        for (const [w, c] of this.cursors) {
          if (c.t < oldestT) {
            oldestT = c.t;
            oldestWho = w;
          }
        }
        if (oldestWho && oldestWho !== att.who) this.cursors.delete(oldestWho);
      }
      this.broadcast(JSON.stringify({ type: "cursor", ...cursor }), ws);
      ws.serializeAttachment(att);
      return;
    }
    if (type === "ping") {
      try {
        ws.send(JSON.stringify({ type: "pong", t: now }));
      } catch {
      }
      ws.serializeAttachment(att);
      return;
    }
  }
  webSocketClose(ws, _code, _reason, _wasClean) {
    this.handleDeparture(ws);
  }
  webSocketError(ws, _error) {
    this.handleDeparture(ws);
  }
  async alarm() {
    const now = Date.now();
    this.pruneExpired(now);
    if (this.persistDirty) {
      try {
        await this.state.storage.put(STRING_PERSISTED_PLUCKS_KEY, this.plucks);
        this.persistDirty = false;
      } catch {
      }
    } else if (this.plucks.length === 0) {
      try {
        await this.state.storage.delete(STRING_PERSISTED_PLUCKS_KEY);
      } catch {
      }
    }
    if (this.state.getWebSockets().length > 0 || this.persistDirty || this.cursors.size > 0) {
      try {
        await this.state.storage.setAlarm(Date.now() + STRING_ALARM_INTERVAL_MS);
      } catch {
      }
    }
  }
  handleDeparture(ws) {
    const att = readAttachment(ws);
    if (!att) return;
    const stillPresent = this.state.getWebSockets().some((other) => {
      if (other === ws) return false;
      const otherAtt = readAttachment(other);
      return Boolean(otherAtt && otherAtt.who === att.who);
    });
    if (stillPresent) return;
    this.cursors.delete(att.who);
    this.broadcast(JSON.stringify({ type: "leave", who: att.who, t: Date.now() }), ws);
  }
  broadcast(message, exclude) {
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(message);
      } catch {
      }
    }
  }
  pruneExpired(now) {
    const pluckCutoff = now - STRING_PLUCK_WINDOW_MS;
    if (this.plucks.length > 0 && this.plucks[0].t < pluckCutoff) {
      const before = this.plucks.length;
      this.plucks = this.plucks.filter((p) => p.t >= pluckCutoff).slice(-STRING_PLUCK_MAX);
      if (this.plucks.length !== before) this.persistDirty = true;
    }
    const cursorCutoff = now - STRING_CURSOR_WINDOW_MS;
    for (const [who, cursor] of this.cursors) {
      if (cursor.t < cursorCutoff) this.cursors.delete(who);
    }
  }
  async scheduleMaintenanceAlarm() {
    try {
      const existing = await this.state.storage.getAlarm();
      if (existing != null) return;
      const target = Date.now() + STRING_PERSIST_DEBOUNCE_MS;
      await this.state.storage.setAlarm(target);
    } catch {
    }
  }
};
var COROOM_NAME = "coroom:room-v1";
var COROOM_LOG_KEY = "log-v1";
var COROOM_LOG_MAX = 200;
var COROOM_LEAVE_GRACE_MS = 4e3;
var COROOM_INCOMING_MAX_BYTES = 256;
var COROOM_WHO_REGEX = /^[0-9a-f]{8,12}$|^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function deriveCfLocation(request) {
  const cf = request.cf || {};
  const city = clean(cf.city || "");
  const region = clean(cf.region || cf.regionCode || "");
  const country = clean(cf.country || "");
  const head = city || region || "";
  if (head && country) return `${head}, ${country}`;
  return head || country || "";
}
__name(deriveCfLocation, "deriveCfLocation");
function readCoRoomAttachment(ws) {
  try {
    const value = ws.deserializeAttachment();
    if (!value || typeof value !== "object") return null;
    const att = value;
    if (typeof att.who !== "string" || att.who.length === 0) return null;
    return att;
  } catch {
    return null;
  }
}
__name(readCoRoomAttachment, "readCoRoomAttachment");
var CoRoom = class {
  static {
    __name(this, "CoRoom");
  }
  state;
  env;
  log = [];
  // seenWhos maps each who that has been part of this instance to their last-known location.
  currentInstance = null;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    void this.state.blockConcurrencyWhile(async () => {
      try {
        const persisted = await this.state.storage.get(COROOM_LOG_KEY);
        if (Array.isArray(persisted)) {
          this.log = persisted.filter(
            (e) => !!e && Number.isFinite(e.startedAt) && Number.isFinite(e.endedAt) && Number.isFinite(e.peak)
          ).slice(0, COROOM_LOG_MAX);
        }
      } catch {
        this.log = [];
      }
      const whos = this.distinctWhos();
      if (whos.size >= 2) {
        let startedAt = Date.now();
        const seen = /* @__PURE__ */ new Map();
        for (const ws of this.state.getWebSockets()) {
          const att = readCoRoomAttachment(ws);
          if (!att) continue;
          if (att.joinedAt < startedAt) startedAt = att.joinedAt;
          seen.set(att.who, att.location || "");
        }
        this.currentInstance = { startedAt, peak: seen.size, seenWhos: seen };
      }
    });
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/snapshot")) {
      const now2 = Date.now();
      const whos2 = this.distinctWhos();
      const members = this.membersList();
      return new Response(
        JSON.stringify({
          count: whos2.size,
          currentInstance: this.currentInstance ? {
            startedAt: this.currentInstance.startedAt,
            peak: this.currentInstance.peak,
            members
          } : null,
          log: this.log,
          serverNow: now2
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store"
          }
        }
      );
    }
    if (!url.pathname.endsWith("/socket")) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" }
      });
    }
    const upgrade = request.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }
    const claimed = clean(url.searchParams.get("who")).toLowerCase();
    const seed = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    const who = COROOM_WHO_REGEX.test(claimed) ? claimed : await hashStringWho(seed);
    const location = deriveCfLocation(request);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const now = Date.now();
    const att = { who, joinedAt: now, lastSeenAt: now, location };
    server.serializeAttachment(att);
    this.state.acceptWebSocket(server);
    const whos = this.distinctWhos();
    const wasOpen = this.currentInstance !== null;
    let openedNow = false;
    if (whos.size >= 2 && !this.currentInstance) {
      const seen = /* @__PURE__ */ new Map();
      for (const m of this.membersList()) seen.set(m.who, m.location);
      this.currentInstance = { startedAt: now, peak: whos.size, seenWhos: seen };
      openedNow = true;
    } else if (this.currentInstance) {
      for (const m of this.membersList()) {
        this.currentInstance.seenWhos.set(m.who, m.location);
      }
      if (whos.size > this.currentInstance.peak) this.currentInstance.peak = whos.size;
    }
    const helloPayload = {
      type: "hello",
      who,
      count: whos.size,
      currentInstance: this.currentInstance ? {
        startedAt: this.currentInstance.startedAt,
        peak: this.currentInstance.peak,
        members: this.membersList()
      } : null,
      log: this.log,
      serverNow: now
    };
    try {
      server.send(JSON.stringify(helloPayload));
    } catch {
    }
    if (openedNow) {
      this.broadcast(
        JSON.stringify({
          type: "open",
          startedAt: this.currentInstance.startedAt,
          peak: this.currentInstance.peak,
          members: this.membersList(),
          serverNow: now
        }),
        server
      );
    } else if (wasOpen) {
      this.broadcast(
        JSON.stringify({
          type: "presence",
          count: whos.size,
          peak: this.currentInstance.peak,
          members: this.membersList(),
          serverNow: now
        }),
        server
      );
    }
    if (whos.size >= 2) {
      try {
        await this.state.storage.deleteAlarm();
      } catch {
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string") return;
    if (raw.length === 0 || raw.length > COROOM_INCOMING_MAX_BYTES) return;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const att = readCoRoomAttachment(ws);
    if (!att) return;
    att.lastSeenAt = Date.now();
    if (String(parsed.type) === "ping") {
      try {
        ws.send(JSON.stringify({ type: "pong", t: att.lastSeenAt }));
      } catch {
      }
      ws.serializeAttachment(att);
    }
  }
  webSocketClose(ws, _code, _reason, _wasClean) {
    void this.handleDisconnect(ws);
  }
  webSocketError(ws, _error) {
    void this.handleDisconnect(ws);
  }
  async alarm() {
    const whos = this.distinctWhos();
    if (this.currentInstance && whos.size < 2) {
      const now = Date.now();
      const entry = {
        startedAt: this.currentInstance.startedAt,
        endedAt: now,
        durationMs: Math.max(0, now - this.currentInstance.startedAt),
        peak: this.currentInstance.peak,
        members: [...this.currentInstance.seenWhos.entries()].map(([who, location]) => ({ who, location })).sort((a, b) => a.who.localeCompare(b.who))
      };
      this.log.unshift(entry);
      this.log = this.log.slice(0, COROOM_LOG_MAX);
      try {
        await this.state.storage.put(COROOM_LOG_KEY, this.log);
      } catch {
      }
      this.currentInstance = null;
      this.broadcast(
        JSON.stringify({ type: "close", entry, serverNow: now })
      );
    }
  }
  async handleDisconnect(ws) {
    const att = readCoRoomAttachment(ws);
    if (!att) return;
    const whos = this.distinctWhos(ws);
    const members = this.membersList(ws);
    const now = Date.now();
    if (this.currentInstance) {
      this.broadcast(
        JSON.stringify({
          type: "presence",
          count: whos.size,
          peak: this.currentInstance.peak,
          members,
          serverNow: now
        }),
        ws
      );
      if (whos.size < 2) {
        try {
          const existing = await this.state.storage.getAlarm();
          if (existing == null) {
            await this.state.storage.setAlarm(now + COROOM_LEAVE_GRACE_MS);
          }
        } catch {
        }
      }
    }
  }
  distinctWhos(exclude) {
    const whos = /* @__PURE__ */ new Set();
    for (const ws of this.state.getWebSockets()) {
      if (exclude && ws === exclude) continue;
      const att = readCoRoomAttachment(ws);
      if (att) whos.add(att.who);
    }
    return whos;
  }
  membersList(exclude) {
    const aggregated = /* @__PURE__ */ new Map();
    for (const ws of this.state.getWebSockets()) {
      if (exclude && ws === exclude) continue;
      const att = readCoRoomAttachment(ws);
      if (!att) continue;
      const prev = aggregated.get(att.who);
      if (!prev || att.joinedAt < prev.joinedAt) {
        aggregated.set(att.who, { joinedAt: att.joinedAt, location: att.location || prev?.location || "" });
      } else if (att.location && !prev.location) {
        aggregated.set(att.who, { ...prev, location: att.location });
      }
    }
    return [...aggregated.entries()].map(([who, v]) => ({ who, joinedAt: v.joinedAt, location: v.location })).sort((a, b) => a.joinedAt - b.joinedAt);
  }
  broadcast(message, exclude) {
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(message);
      } catch {
      }
    }
  }
};
var BFV_ROOM_NAME = "body-for-visits:room-v1";
var BFV_FRINGE_KEEP = 12;
async function bfvHashIp(ip, salt) {
  const data = new TextEncoder().encode(`bfv-ip-v1:${salt}:${ip}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bfvHashIp, "bfvHashIp");
async function bfvHashSession(sessionId) {
  const data = new TextEncoder().encode(`bfv-session-v1:${sessionId}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bfvHashSession, "bfvHashSession");
var BodyForVisitsRoom = class {
  static {
    __name(this, "BodyForVisitsRoom");
  }
  state;
  env;
  ready = false;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
    void this.state.blockConcurrencyWhile(async () => {
      this.ensureSchema();
      this.ready = true;
    });
  }
  ensureSchema() {
    const sql = this.state.storage.sql;
    sql.exec(
      `CREATE TABLE IF NOT EXISTS events (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         ts INTEGER NOT NULL,
         kind TEXT NOT NULL,
         ip_hash TEXT NOT NULL,
         session_hash TEXT NOT NULL,
         ua_class TEXT NOT NULL,
         token TEXT NOT NULL,
         role TEXT NOT NULL
       )`
    );
    sql.exec(`CREATE INDEX IF NOT EXISTS events_session_ts ON events(session_hash, ts)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS events_ts ON events(ts)`);
    sql.exec(
      `CREATE TABLE IF NOT EXISTS body_state (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         body_json TEXT NOT NULL,
         body_version INTEGER NOT NULL,
         fold_count INTEGER NOT NULL,
         fold_generations INTEGER NOT NULL,
         corruption_count INTEGER NOT NULL,
         fringe_json TEXT NOT NULL,
         updated_at INTEGER NOT NULL
       )`
    );
    const existing = sql.exec(`SELECT id FROM body_state WHERE id = 1`).toArray();
    if (existing.length === 0) {
      sql.exec(
        `INSERT INTO body_state (id, body_json, body_version, fold_count, fold_generations, corruption_count, fringe_json, updated_at)
         VALUES (1, ?, 0, 0, 0, 0, ?, ?)`,
        "[]",
        "[]",
        Date.now()
      );
    }
  }
  readState() {
    const rows = this.state.storage.sql.exec(`SELECT body_json, body_version, fold_count, fold_generations, corruption_count, fringe_json FROM body_state WHERE id = 1`).toArray();
    return rows[0] || {
      body_json: "[]",
      body_version: 0,
      fold_count: 0,
      fold_generations: 0,
      corruption_count: 0,
      fringe_json: "[]"
    };
  }
  parseBody(row) {
    try {
      const parsed = JSON.parse(row.body_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  parseFringe(row) {
    try {
      const parsed = JSON.parse(row.fringe_json);
      return Array.isArray(parsed) ? parsed.map(String).slice(-BFV_FRINGE_KEEP) : [];
    } catch {
      return [];
    }
  }
  buildResponseBody(row, newTokenIndex) {
    const body = this.parseBody(row);
    const fringe = this.parseFringe(row);
    return {
      body,
      new_token_index: newTokenIndex,
      body_version: row.body_version,
      fold_count: row.fold_count,
      fold_generations: row.fold_generations,
      corruption_count: row.corruption_count,
      fringe: fringe.join(" ")
    };
  }
  // Presence = the number of open corpus pages (live WebSockets). Counted per
  // socket, so it stays simple, visible, and survives DO hibernation.
  presenceCount(exclude) {
    let n = 0;
    for (const ws of this.state.getWebSockets()) {
      if (exclude && ws === exclude) continue;
      n++;
    }
    return n;
  }
  broadcast(message, exclude) {
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(message);
      } catch {
      }
    }
  }
  // One unified message shape: a full authoritative snapshot plus the live
  // presence count. Clients gate on body_version / corruption_count, so a
  // dropped, duplicated, or out-of-order message can never accumulate drift.
  snapshotMessage(row, newTokenIndex, excludePresence) {
    return JSON.stringify({
      type: "sync",
      ...this.buildResponseBody(row, newTokenIndex),
      presence: this.presenceCount(excludePresence)
    });
  }
  handleSocket(request) {
    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
      return new Response("expected websocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    const message = this.snapshotMessage(this.readState(), null);
    try {
      server.send(message);
    } catch {
    }
    this.broadcast(message, server);
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(_ws, _raw) {
  }
  webSocketClose(ws) {
    this.announcePresence(ws);
  }
  webSocketError(ws) {
    this.announcePresence(ws);
  }
  // Cloudflare keeps the closing socket in getWebSockets() until the close
  // handler returns; exclude it so the broadcast reflects the post-close count.
  announcePresence(closing) {
    this.broadcast(this.snapshotMessage(this.readState(), null, closing), closing);
  }
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.endsWith("/socket")) {
      return this.handleSocket(request);
    }
    if (request.method === "GET" && path === "/state") {
      return this.responseJson(this.buildResponseBody(this.readState(), null));
    }
    if (request.method === "POST" && path === "/qualify") {
      return this.qualify(request);
    }
    if (request.method === "GET" && path === "/export") {
      return this.export();
    }
    if (request.method === "GET" && path === "/snapshot") {
      const state = this.buildResponseBody(this.readState(), null);
      const html = renderSnapshotHTML(state, (/* @__PURE__ */ new Date()).toISOString());
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" }
      });
    }
    return this.responseJson({ error: "not_found" }, 404);
  }
  async qualify(request) {
    let payload = {};
    try {
      payload = await request.json();
    } catch {
      return this.responseJson({ error: "bad_json" }, 400);
    }
    const sessionId = clean(payload?.session_id);
    if (!/^[0-9a-f-]{8,64}$/i.test(sessionId)) {
      return this.responseJson({ error: "bad_session" }, 400);
    }
    const ua = request.headers.get("user-agent") || "";
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    const salt = this.env.BFV_HASH_SALT || "bfv-default-salt";
    const ipHash = await bfvHashIp(ip, salt);
    const sessionHash = await bfvHashSession(sessionId);
    const now = Date.now();
    const sql = this.state.storage.sql;
    const lastRows = sql.exec(
      `SELECT MAX(ts) AS max_ts FROM events WHERE session_hash = ? AND kind = 'human'`,
      sessionHash
    ).toArray();
    const lastSessionTs = lastRows[0]?.max_ts ?? null;
    const stateRow = this.readState();
    const body = this.parseBody(stateRow);
    const realBody = body[0]?.role === "fold_marker" ? body.slice(1) : body;
    const prev = realBody.length > 0 ? realBody[realBody.length - 1] : null;
    const humanCountRows = sql.exec(`SELECT COUNT(*) AS n FROM events WHERE kind = 'human'`).toArray();
    const humanEventIndex = (humanCountRows[0]?.n || 0) + 1;
    const seed = parseInt(ipHash.slice(0, 8), 16) || 1;
    const journal = sql.exec(
      `SELECT token, role FROM events WHERE kind = 'human' ORDER BY id`
    ).toArray();
    const model = inferModel(journal);
    const decision = decideQualify({
      ua,
      lastSessionTs,
      prevRole: prev?.role ?? null,
      prevToken: prev?.token ?? null,
      humanEventIndex,
      seed,
      now,
      model
    });
    if (decision.action === "cooldown") {
      const data2 = this.buildResponseBody(stateRow, null);
      return this.responseJson({ ...data2, skipped: "cooldown" });
    }
    if (decision.action === "bot") {
      const glyphs = BUCKETS.corruption_glyphs;
      const glyph = glyphs[Math.abs(seed) % glyphs.length];
      sql.exec(
        `INSERT INTO events (ts, kind, ip_hash, session_hash, ua_class, token, role)
         VALUES (?, 'bot', ?, ?, ?, ?, 'corruption')`,
        now,
        ipHash,
        sessionHash,
        `bot:${decision.bucket}`,
        glyph
      );
      const fringe = this.parseFringe(stateRow);
      fringe.push(glyph);
      const fringeKept = fringe.slice(-BFV_FRINGE_KEEP);
      const nextCorruption = stateRow.corruption_count + 1;
      sql.exec(
        `UPDATE body_state SET corruption_count = ?, fringe_json = ?, updated_at = ? WHERE id = 1`,
        nextCorruption,
        JSON.stringify(fringeKept),
        now
      );
      const next = { ...stateRow, corruption_count: nextCorruption, fringe_json: JSON.stringify(fringeKept) };
      this.broadcast(this.snapshotMessage(next, null));
      const data2 = this.buildResponseBody(next, null);
      return this.responseJson({ ...data2, skipped: "bot" });
    }
    sql.exec(
      `INSERT INTO events (ts, kind, ip_hash, session_hash, ua_class, token, role)
       VALUES (?, 'human', ?, ?, 'browser', ?, ?)`,
      now,
      ipHash,
      sessionHash,
      decision.token,
      decision.role
    );
    const eventIdRow = sql.exec(`SELECT last_insert_rowid() AS id`).toArray();
    const eventId = eventIdRow[0]?.id ?? null;
    let nextToken = decision.token;
    if (nextToken === ".") nextToken = ",";
    const nextBody = [...body, { token: nextToken, role: decision.role, event_id: eventId, ts: now }];
    const folded = foldBody(nextBody, stateRow.fold_count, stateRow.fold_generations, now);
    const newTokenIndex = folded.body.length - 1;
    const nextVersion = stateRow.body_version + 1;
    sql.exec(
      `UPDATE body_state
         SET body_json = ?, body_version = ?, fold_count = ?, fold_generations = ?, updated_at = ?
       WHERE id = 1`,
      JSON.stringify(folded.body),
      nextVersion,
      folded.fold_count,
      folded.fold_generations,
      now
    );
    const updated = {
      body_json: JSON.stringify(folded.body),
      body_version: nextVersion,
      fold_count: folded.fold_count,
      fold_generations: folded.fold_generations,
      corruption_count: stateRow.corruption_count,
      fringe_json: stateRow.fringe_json
    };
    this.broadcast(this.snapshotMessage(updated, newTokenIndex));
    const data = this.buildResponseBody(updated, newTokenIndex);
    return this.responseJson({ ...data, skipped: null });
  }
  export() {
    const rows = this.state.storage.sql.exec(`SELECT id, ts, kind, session_hash, ua_class, token, role FROM events ORDER BY id ASC`).toArray();
    const stateRow = this.readState();
    const humanSeq = rows.filter((r) => r.kind === "human").map((r) => ({ token: r.token, role: r.role }));
    const body = {
      exported_at: (/* @__PURE__ */ new Date()).toISOString(),
      body_version: stateRow.body_version,
      fold_count: stateRow.fold_count,
      fold_generations: stateRow.fold_generations,
      corruption_count: stateRow.corruption_count,
      model: inferModel(humanSeq),
      events: rows
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }
  responseJson(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }
};
var SITE_DEPLOYS_KEY = "feed:site-deploys-v1";
var SITE_DEPLOYS_MAX = 30;
var SITE_DEPLOY_TEXT_MAX = 240;
var SITE_DEPLOY_SUBJECTS_MAX = 220;
async function fetchSite(env) {
  const url = clean(env.SITE_VERSION_URL);
  const kv = env.HITS_KV;
  if (!url || !kv) return [];
  let stored = [];
  try {
    const raw = await kv.get(SITE_DEPLOYS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        stored = parsed.filter((d) => !!d && typeof d.sha === "string" && typeof d.at === "string").slice(0, SITE_DEPLOYS_MAX);
      }
    }
  } catch {
    stored = [];
  }
  let manifest = null;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 30, cacheEverything: false }
    });
    if (response.ok) {
      manifest = await response.json().catch(() => null);
    }
  } catch {
    manifest = null;
  }
  const sha = clean(manifest?.sha);
  if (sha && sha !== "dev" && !stored.some((d) => d.sha === sha)) {
    const shortSha = clean(manifest?.shortSha) || sha.slice(0, 7);
    const at = normalizeIsoAt(manifest?.at) || (/* @__PURE__ */ new Date()).toISOString();
    const subjects = Array.isArray(manifest?.subjects) ? manifest.subjects.map((s) => clean(s)).filter((s) => s.length > 0) : [];
    const subjectsBody = subjects.length > 0 ? short(subjects.join("; "), SITE_DEPLOY_SUBJECTS_MAX) : "";
    const text = subjectsBody ? short(`site deployed \xB7 ${shortSha} \xB7 ${subjectsBody}`, SITE_DEPLOY_TEXT_MAX) : `site deployed \xB7 ${shortSha}`;
    const repoUrl = clean(env.SITE_REPO_URL).replace(/\/+$/, "");
    const commitUrl = repoUrl ? `${repoUrl}/commit/${sha}` : void 0;
    const record = {
      sha,
      shortSha,
      at,
      text,
      ...commitUrl ? { url: commitUrl } : {}
    };
    stored = [record, ...stored].slice(0, SITE_DEPLOYS_MAX);
    try {
      await kv.put(SITE_DEPLOYS_KEY, JSON.stringify(stored));
    } catch {
    }
  }
  return stored.map((d) => ({
    source: "site",
    text: d.text,
    at: d.at,
    ...d.url ? { url: d.url } : {}
  }));
}
__name(fetchSite, "fetchSite");
async function buildFeedSnapshot(env) {
  const tasks = [
    ["github", () => fetchGitHub(env, FEED_MAX_ITEMS)],
    ["bandcamp", () => fetchBandcamp(env, FEED_MAX_ITEMS)],
    ["instagram", () => fetchInstagram(env, FEED_MAX_ITEMS)],
    ["spotify", () => fetchSpotify(env)],
    ["x", () => fetchX(env, FEED_MAX_ITEMS)],
    ["youtube", () => fetchYouTube(env, FEED_MAX_ITEMS)],
    ["site", () => fetchSite(env)]
  ];
  const results = await Promise.allSettled(tasks.map((task) => task[1]()));
  const items = [];
  const sources = {};
  const configured = /* @__PURE__ */ __name((name) => {
    switch (name) {
      case "github":
        return !!clean(env.GITHUB_USERNAME || "cbassuarez");
      case "bandcamp":
        return !!clean(env.BANDCAMP_DOMAIN || "cbassuarez.bandcamp.com");
      case "instagram":
        return !!clean(env.IG_USER_ID) && !!clean(env.IG_ACCESS_TOKEN);
      case "spotify":
        return !!clean(env.SPOTIFY_CLIENT_ID) && !!clean(env.SPOTIFY_CLIENT_SECRET) && !!clean(env.SPOTIFY_REFRESH_TOKEN);
      case "x":
        return !!clean(env.X_USERNAME) && !!clean(env.X_BEARER_TOKEN);
      case "youtube":
        return !!clean(env.YT_CHANNEL_ID) && !!clean(env.YT_API_KEY);
      case "site":
        return !!clean(env.SITE_VERSION_URL);
      default:
        return false;
    }
  }, "configured");
  results.forEach((result, index) => {
    const name = tasks[index][0];
    if (result.status === "fulfilled") {
      const value = result.value || [];
      items.push(...value);
      sources[name] = {
        status: value.length > 0 || configured(name) ? "ok" : "missing_config",
        count: value.length,
        message: value.length > 0 ? void 0 : configured(name) ? "No recent activity." : "No data returned."
      };
      return;
    }
    const message = clean(result.reason?.message || result.reason || "unknown error");
    sources[name] = {
      status: message.toLowerCase().includes("missing") ? "missing_config" : "error",
      count: 0,
      message
    };
  });
  const previous = await readFeedSnapshot(env);
  const historical = previous?.items || [];
  const merged = [...items, ...historical].map((item) => {
    const at = normalizeIsoAt(item?.at);
    return at ? { ...item, at } : null;
  }).filter((item) => !!item && item.text.length > 0).sort((a, b) => parseFeedTimeMs(b.at) - parseFeedTimeMs(a.at)).filter((item, index, array) => {
    const key = timelineIdentity(item);
    return array.findIndex((candidate) => timelineIdentity(candidate) === key) === index;
  });
  const persisted = sanitizeSpotifyTimeline(merged).slice(0, FEED_MAX_ITEMS);
  return {
    items: persisted,
    sources,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(buildFeedSnapshot, "buildFeedSnapshot");
async function persistFeedSnapshot(env, snapshot) {
  const kv = env.HITS_KV;
  if (!kv) return;
  await kv.put(FEED_SNAPSHOT_KEY, JSON.stringify(snapshot));
}
__name(persistFeedSnapshot, "persistFeedSnapshot");
async function readFeedSnapshot(env) {
  const kv = env.HITS_KV;
  if (!kv) return null;
  const raw = await kv.get(FEED_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items)) {
      return {
        items: parsed.items,
        sources: parsed.sources || {},
        generatedAt: clean(parsed.generatedAt) || (/* @__PURE__ */ new Date()).toISOString()
      };
    }
  } catch {
  }
  return null;
}
__name(readFeedSnapshot, "readFeedSnapshot");
async function checkRateLimit(binding, key) {
  if (!binding) return true;
  try {
    const result = await binding.limit({ key });
    return result.success;
  } catch {
    return true;
  }
}
__name(checkRateLimit, "checkRateLimit");
function tooManyRequests(allowOrigin) {
  return new Response(
    JSON.stringify({ error: "rate_limited", at: (/* @__PURE__ */ new Date()).toISOString() }),
    { status: 429, headers: { ...jsonHeaders(allowOrigin), "retry-after": "60" } }
  );
}
__name(tooManyRequests, "tooManyRequests");
function clientKey(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
__name(clientKey, "clientKey");
function isValidContactEmail(value) {
  const email = clean(value);
  if (!CONTACT_EMAIL_REGEX.test(email)) return false;
  const lowered = email.toLowerCase();
  const local = lowered.split("@")[0] || "";
  const domain = lowered.split("@")[1] || "";
  if (CONTACT_BLOCKED_LOCAL_PARTS.has(local)) return false;
  if (CONTACT_BLOCKED_DOMAINS.has(domain)) return false;
  if (domain.startsWith("example.") || domain.startsWith("test.")) return false;
  return true;
}
__name(isValidContactEmail, "isValidContactEmail");
function parseContactSubmission(body) {
  const name = clean(body?.name).slice(0, 120);
  const email = clean(body?.email).slice(0, 254);
  const subject = clean(body?.subject).slice(0, 180);
  const message = clean(body?.message).slice(0, 4e3);
  const requestedTopic = clean(body?.topic).toLowerCase();
  const topic = CONTACT_ALLOWED_TOPICS.has(requestedTopic) ? requestedTopic : "other";
  const timeSensitive = clean(body?.time_sensitive).toLowerCase() === "yes" || body?.time_sensitive === true;
  const token = clean(body?.turnstileToken || body?.["cf-turnstile-response"]).slice(0, 2048);
  if (!name || !email || !subject || !message) {
    return { ok: false, error: "missing_required_fields" };
  }
  if (!isValidContactEmail(email)) {
    return { ok: false, error: "invalid_email" };
  }
  if (!token) {
    return { ok: false, error: "missing_turnstile_token" };
  }
  return {
    ok: true,
    data: {
      name,
      email,
      subject,
      topic,
      timeSensitive,
      message,
      turnstileToken: token
    }
  };
}
__name(parseContactSubmission, "parseContactSubmission");
function resolveTurnstileSecret(env, request) {
  const configured = clean(env.TURNSTILE_SECRET_KEY);
  if (configured) return configured;
  const host = clean(new URL(request.url).hostname).toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  return isLocalHost ? TURNSTILE_TEST_SECRET_KEY : "";
}
__name(resolveTurnstileSecret, "resolveTurnstileSecret");
function allowedTurnstileHostnames(env) {
  const raw = clean(env.TURNSTILE_ALLOWED_HOSTNAMES || "cbassuarez.com,www.cbassuarez.com");
  const parts = raw.split(",").map((host) => clean(host).toLowerCase()).filter(Boolean);
  return new Set(parts);
}
__name(allowedTurnstileHostnames, "allowedTurnstileHostnames");
async function verifyTurnstileToken(token, secret, remoteIp) {
  const payload = new URLSearchParams();
  payload.set("secret", secret);
  payload.set("response", token);
  if (remoteIp && remoteIp !== "unknown") {
    payload.set("remoteip", remoteIp);
  }
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: payload.toString()
    });
    const parsed = await response.json().catch(() => ({}));
    const errorCodes = Array.isArray(parsed?.["error-codes"]) ? parsed["error-codes"].map((code) => clean(code)).filter(Boolean) : [];
    const hostname = clean(parsed?.hostname || "").toLowerCase();
    const action = clean(parsed?.action || "");
    if (!response.ok) {
      return {
        success: false,
        errorCodes: errorCodes.length ? errorCodes : [`siteverify_http_${response.status}`],
        hostname,
        action
      };
    }
    return { success: Boolean(parsed?.success), errorCodes, hostname, action };
  } catch {
    return { success: false, errorCodes: ["siteverify_network_error"], hostname: "", action: "" };
  }
}
__name(verifyTurnstileToken, "verifyTurnstileToken");
var CONTACT_FORMSPREE_DEFAULT_ENDPOINT = "https://formspree.io/f/mjkepaeo";
async function deliverContactEmail(env, payload, receivedAt) {
  const endpoint = clean(env.CONTACT_FORMSPREE_ENDPOINT || CONTACT_FORMSPREE_DEFAULT_ENDPOINT);
  if (!endpoint) {
    return { ok: false, error: "formspree_endpoint_unconfigured", messageId: null };
  }
  const body = {
    name: payload.name,
    email: payload.email,
    _replyto: payload.email,
    _subject: `[contact] ${payload.subject}`,
    subject: payload.subject,
    topic: payload.topic,
    time_sensitive: payload.timeSensitive ? "yes" : "no",
    received_at: receivedAt,
    message: payload.message
  };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(body)
    });
    let parsed = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    if (!response.ok || parsed?.ok === false) {
      const errors = Array.isArray(parsed?.errors) ? parsed.errors.map((e) => clean(e?.message || e?.code || "")).filter(Boolean).join("; ") : "";
      const detail = errors || clean(parsed?.error) || `formspree_status_${response.status}`;
      return { ok: false, error: short(detail, 220), messageId: null };
    }
    const id = clean(parsed?.id || parsed?.next || "");
    return { ok: true, error: null, messageId: id || null };
  } catch (error) {
    const message = clean(error?.message || "formspree_network_error");
    return { ok: false, error: short(message, 220), messageId: null };
  }
}
__name(deliverContactEmail, "deliverContactEmail");
async function handleFeedRequest(request, env, ctx, allowOrigin) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(FEED_MAX_ITEMS, Number(url.searchParams.get("limit")) || 24));
  const cacheUrl = new URL(request.url);
  cacheUrl.search = `?limit=${limit}`;
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set("access-control-allow-origin", allowOrigin);
    response.headers.set("cache-control", "no-store");
    return response;
  }
  let snapshot = await readFeedSnapshot(env);
  if (!snapshot) {
    snapshot = { items: [], sources: {}, generatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    ctx.waitUntil(
      (async () => {
        try {
          const built = await buildFeedSnapshot(env);
          await persistFeedSnapshot(env, built);
        } catch {
        }
      })()
    );
  }
  const body = JSON.stringify(
    {
      items: snapshot.items.slice(0, limit),
      sources: snapshot.sources,
      currentActivity: selectCurrentActivity(snapshot.items),
      generatedAt: snapshot.generatedAt
    },
    null,
    2
  );
  if (snapshot.items.length > 0) {
    const cacheable = new Response(body, {
      status: 200,
      headers: {
        ...jsonHeaders(allowOrigin),
        "cache-control": `public, s-maxage=${FEED_EDGE_CACHE_SECONDS}`
      }
    });
    ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
  }
  return new Response(body, { status: 200, headers: jsonHeaders(allowOrigin) });
}
__name(handleFeedRequest, "handleFeedRequest");
var CLI_USER_AGENT_REGEX = /^(curl|wget|HTTPie|httpie|aria2|powershell|fetch|node-fetch|go-http-client|libwww-perl|python-requests|python-urllib)\b/i;
var CLI_LETTER_FALLBACK = `hello.

this is cbassuarez.com from the command line.
i'm seb. i make cybernetic music systems.

the live surfaces:
  /labs/string    a shared string instrument
  /labs/repl      a live-coding repl in score-grid notation
  /labs/feed      everything i did online today
  /labs/guestbook a place to leave a small mark

the offline ones:
  let go / letting go \xB7 THE TUB \xB7 String \xB7 Praetorius

if you want to talk:  contact@cbassuarez.com
if you want to read:  this came from /humans.txt

curl /feed       see what's happening today
curl /string     /labs/string state
curl /room       /404 anteroom state
curl /works      list of works
curl /version    build label
curl /contact    how to reach me
curl /repl       what /labs/repl is + ssh-render usage

ssh ssh.cbassuarez.com repl < patch.txt | mpv -    actually plays the patch

\u2014 seb
`;
var CLI_PATH_MAP = {
  "/": "letter",
  "/cli": "letter",
  "/cli/": "letter",
  "/cli/feed": "feed",
  "/cli/string": "string",
  "/cli/room": "room",
  "/cli/works": "works",
  "/cli/contact": "contact",
  "/cli/version": "version",
  "/cli/humans": "humans",
  "/cli/repl": "repl",
  "/feed": "feed",
  "/string": "string",
  "/room": "room",
  "/works": "works",
  "/contact": "contact",
  "/version": "version",
  "/repl": "repl"
};
function isCliClient(request) {
  const ua = clean(request.headers.get("user-agent") || "");
  if (CLI_USER_AGENT_REGEX.test(ua)) return true;
  const accept = clean(request.headers.get("accept") || "");
  if (accept && accept.includes("text/plain") && !accept.includes("text/html")) {
    return true;
  }
  return false;
}
__name(isCliClient, "isCliClient");
function classifyCliPath(pathname) {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  return CLI_PATH_MAP[trimmed] ?? null;
}
__name(classifyCliPath, "classifyCliPath");
function cliTextResponse(body, status = 200) {
  return new Response(body.endsWith("\n") ? body : body + "\n", {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      link: DISCOVERY_LINK_HEADER
    }
  });
}
__name(cliTextResponse, "cliTextResponse");
function buildCliFooter() {
  return [
    "",
    "\u2014",
    "more at https://cbassuarez.com  \xB7  signed at /humans.txt",
    ""
  ].join("\n");
}
__name(buildCliFooter, "buildCliFooter");
async function fetchCliLetter(request) {
  try {
    const origin = new URL(request.url);
    origin.pathname = "/.well-known/cli-letter.txt";
    origin.search = "";
    const candidates = [
      `https://cbassuarez.com/.well-known/cli-letter.txt`,
      origin.toString()
    ];
    for (const candidate of candidates) {
      try {
        const r = await fetch(candidate, {
          headers: { accept: "text/plain" },
          cf: { cacheTtl: 60, cacheEverything: true }
        });
        if (r.ok) {
          const text = await r.text();
          const trimmed = text.trim();
          if (trimmed.length > 0) return text;
        }
      } catch {
      }
    }
  } catch {
  }
  return CLI_LETTER_FALLBACK;
}
__name(fetchCliLetter, "fetchCliLetter");
function formatCliRelative(at, nowMs) {
  const t = parseFeedTimeMs(at);
  if (!t) return "";
  const diffMs = Math.max(0, nowMs - t);
  const min = Math.floor(diffMs / 6e4);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}
__name(formatCliRelative, "formatCliRelative");
async function renderCliFeed(env, allowOrigin) {
  const snapshot = await readFeedSnapshot(env);
  const items = (snapshot?.items || []).slice(0, 6);
  const now = Date.now();
  const lines = ["the feed says, today:"];
  if (items.length === 0) {
    lines.push("");
    lines.push("  (the feed is quiet right now.)");
  } else {
    for (const item of items) {
      const src = sourceBase(item.source).padEnd(8, " ");
      const when = formatCliRelative(item.at, now).padEnd(8, " ");
      const text = short(item.text, 88);
      lines.push(`  \xB7 ${when} ${src} ${text}`);
    }
  }
  lines.push("");
  lines.push("more at https://cbassuarez.com/labs/feed");
  return lines.join("\n");
}
__name(renderCliFeed, "renderCliFeed");
function formatCliDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1e3));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h${String(rm).padStart(2, "0")}m`;
  }
  return `${String(m).padStart(2, "0")}m${String(r).padStart(2, "0")}s`;
}
__name(formatCliDuration, "formatCliDuration");
async function renderCliRoom(env) {
  if (!env.CO_ROOM) return "the /404 anteroom is not configured here.\n";
  try {
    const id = env.CO_ROOM.idFromName(COROOM_NAME);
    const stub = env.CO_ROOM.get(id);
    const r = await stub.fetch(new Request("https://internal/snapshot", { method: "GET" }));
    if (!r.ok) {
      return "the /404 anteroom is unreachable right now.\n";
    }
    const data = await r.json().catch(() => null);
    if (!data) return "the /404 anteroom returned no state.\n";
    const count = Number(data.count) || 0;
    const log = Array.isArray(data.log) ? data.log : [];
    if (data.currentInstance && count >= 2) {
      const startedAt = Number(data.currentInstance.startedAt) || 0;
      const dur2 = formatCliDuration(Math.max(0, Date.now() - startedAt));
      const peak2 = Number(data.currentInstance.peak) || count;
      const members = Array.isArray(data.currentInstance.members) ? data.currentInstance.members : [];
      const places2 = members.map((m) => clean(m?.location || "")).filter((p) => p.length > 0);
      const placeLine2 = places2.length > 0 ? `they are connecting from ${places2.join(", ")}.` : "";
      return [
        `the /404 anteroom is open right now.`,
        `${count} people are present (peak ${peak2}); the instance has been open ${dur2}.`,
        placeLine2,
        ``,
        `wander toward https://cbassuarez.com/this-does-not-exist if you want to join.`,
        ``
      ].filter(Boolean).join("\n") + "\n";
    }
    const last = log[0];
    if (!last) {
      return [
        "the /404 anteroom has never opened. it opens when two strangers are",
        "simultaneously asking the site for a page that doesn't exist.",
        "",
        "wander toward https://cbassuarez.com/this-does-not-exist if you want to try.",
        ""
      ].join("\n");
    }
    const dur = formatCliDuration(Number(last.durationMs) || 0);
    const ago = formatCliRelative(new Date(last.endedAt || 0).toISOString(), Date.now());
    const peak = Number(last.peak) || 0;
    const places = Array.isArray(last.members) ? last.members.map((m) => clean(m?.location || "")).filter((p) => p.length > 0) : [];
    const placeLine = places.length > 0 ? `they were from ${places.join(", ")}.` : "";
    return [
      `the /404 anteroom is currently closed.`,
      `it last opened ${ago} for ${dur}, with ${peak} ${peak === 1 ? "person" : "people"}.`,
      placeLine,
      ``,
      `wander toward https://cbassuarez.com/this-does-not-exist if you want to try.`,
      ``
    ].filter(Boolean).join("\n") + "\n";
  } catch {
    return "the /404 anteroom is unreachable right now.\n";
  }
}
__name(renderCliRoom, "renderCliRoom");
async function renderCliString(env) {
  return [
    "the string lab is a shared instrument that lives in your browser.",
    "every visitor plays one string; every pluck travels outward and",
    "returns as sympathetic sound from other strings nearby.",
    "",
    "pluck it yourself at https://cbassuarez.com/labs/string.",
    ""
  ].join("\n");
}
__name(renderCliString, "renderCliString");
function renderCliWorks() {
  return [
    "the offline works:",
    "",
    "  \xB7 let go / letting go    cybernetic performance, ongoing.",
    "  \xB7 THE TUB                installation + sonic sculpture.",
    "  \xB7 String                 cybernetic strings, multi-visitor.",
    "  \xB7 Praetorius             prepared instruments + live system.",
    "",
    "the online (live) ones:",
    "",
    "  \xB7 /labs/string           shared string instrument.",
    "  \xB7 /labs/repl             live-coding repl in score-grid notation.",
    "  \xB7 /labs/feed             a feed of what i did online today.",
    "  \xB7 /labs/guestbook        a place to leave a small mark.",
    "  \xB7 /404 (anteroom)        opens only when two strangers are",
    "                           simultaneously on a page that doesn't exist.",
    "",
    "more at https://cbassuarez.com/works",
    ""
  ].join("\n");
}
__name(renderCliWorks, "renderCliWorks");
function renderCliRepl() {
  return [
    "/labs/repl \u2014 a live-coding piece in score-grid notation, powered by",
    "             the cbassuarez voices. it runs in two places:",
    "",
    "  in your browser, at https://cbassuarez.com/labs/repl",
    "    \u2014 the canonical surface. live transport viz, sample browser,",
    "      hot-reload on Cmd-Enter, share-by-URL.",
    "",
    "  from your shell, over ssh \u2014 same patches, same DSL, rendered to a",
    "  WAV stream you pipe into a local audio player:",
    "",
    "    ssh ssh.cbassuarez.com repl < patch.txt | mpv -",
    "    ssh ssh.cbassuarez.com repl < patch.txt | ffplay -nodisp -autoexit -",
    "    ssh ssh.cbassuarez.com repl < patch.txt | sox -t wav - -d",
    "    ssh ssh.cbassuarez.com repl v1.<hash>   | mpv -",
    "    ssh ssh.cbassuarez.com repl --help",
    "",
    "the language at a glance:",
    "",
    "  tempo 110",
    "  meter 4/4",
    "",
    "  string  A3  C4  E4  G4    | A3  C4  E4  ~",
    "  force   f   mf  p   f     | ff  mf  p   p",
    "  decay   4",
    "  crush   8",
    "",
    "  string  .   .   .   D3",
    "  every   4 bars",
    "  pan     left",
    "",
    "  sample  snm-*&30  .  .  .",
    "  every   2 bars",
    "",
    "slot tokens:  notes (A3, C#4, Bb2), '.' (rest), '~' (sustain), or a",
    "              sample id from the bank.",
    "groups:       (a b c) subdivides one slot's time.",
    "selectors:    bank-* (random per fire), bank-*! (frozen),",
    "              bank-*&N (gradient), a/b (union of pools).",
    "",
    "sample bank \u2014 300 one-shots, mirrored from /labs/chunk-surfer:",
    "  main_b3        b3-01 .. b3-64       (64)",
    "  THE TUB        tub-xither-forge ..  (44)",
    "  amplifications amp-001 .. amp-064   (64)",
    "  soundnoisemusic snm-001 .. snm-064  (64)",
    "  lux_nova       lux-001 .. lux-064   (64)",
    "",
    "more at https://cbassuarez.com/labs/repl",
    ""
  ].join("\n");
}
__name(renderCliRepl, "renderCliRepl");
function renderCliContact() {
  return [
    "to reach me:",
    "",
    "  email      contact@cbassuarez.com",
    "  form       https://cbassuarez.com/contact",
    "  github     https://github.com/cbassuarez",
    "  bandcamp   https://cbassuarez.bandcamp.com",
    "",
    "i read every email. i answer most of them.",
    "",
    "\u2014 seb",
    ""
  ].join("\n");
}
__name(renderCliContact, "renderCliContact");
async function renderCliVersion(env) {
  if (!env.HITS_KV) return "build label is not available right now.\n";
  let manifest = null;
  try {
    const r = await fetch("https://cbassuarez.com/version.json", {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 60 }
    });
    if (r.ok) manifest = await r.json().catch(() => null);
  } catch {
    manifest = null;
  }
  if (!manifest || !manifest.sha) {
    return "the live build manifest is unreachable right now.\n";
  }
  const shortSha = clean(manifest.shortSha || String(manifest.sha).slice(0, 7));
  const at = clean(manifest.at).slice(0, 19).replace("T", " ");
  const subjects = Array.isArray(manifest.subjects) ? manifest.subjects : [];
  const lines = [
    `build \xB7 ${shortSha} \xB7 ${at} UTC`,
    ""
  ];
  if (subjects.length > 0) {
    lines.push("recent work:");
    for (const s of subjects.slice(0, 8)) {
      const trimmed = clean(s);
      if (trimmed) lines.push(`  \xB7 ${trimmed}`);
    }
    lines.push("");
  }
  lines.push("more at https://cbassuarez.com/colophon");
  lines.push("");
  return lines.join("\n");
}
__name(renderCliVersion, "renderCliVersion");
async function renderCliHumans(request) {
  try {
    const r = await fetch("https://cbassuarez.com/humans.txt", {
      headers: { accept: "text/plain" },
      cf: { cacheTtl: 60 }
    });
    if (r.ok) return await r.text();
  } catch {
  }
  return "humans.txt is unavailable right now.\n";
}
__name(renderCliHumans, "renderCliHumans");
async function handleCliRequest(request, env, url) {
  const kind = classifyCliPath(url.pathname);
  if (!kind) {
    const lines = [
      `cbassuarez.com \xB7 cli`,
      ``,
      `no such path: ${url.pathname}`,
      ``,
      `try: /, /feed, /string, /room, /works, /contact, /version`,
      ``
    ];
    return cliTextResponse(lines.join("\n"), 404);
  }
  switch (kind) {
    case "letter": {
      const letter = await fetchCliLetter(request);
      return cliTextResponse(letter);
    }
    case "feed": {
      const body = await renderCliFeed(env, "*");
      return cliTextResponse(body + buildCliFooter());
    }
    case "string": {
      const body = await renderCliString(env);
      return cliTextResponse(body + buildCliFooter());
    }
    case "room": {
      const body = await renderCliRoom(env);
      return cliTextResponse(body + buildCliFooter());
    }
    case "works": {
      return cliTextResponse(renderCliWorks() + buildCliFooter());
    }
    case "contact": {
      return cliTextResponse(renderCliContact() + buildCliFooter());
    }
    case "version": {
      const body = await renderCliVersion(env);
      return cliTextResponse(body + buildCliFooter());
    }
    case "humans": {
      const body = await renderCliHumans(request);
      return cliTextResponse(body);
    }
    case "repl": {
      return cliTextResponse(renderCliRepl() + buildCliFooter());
    }
  }
}
__name(handleCliRequest, "handleCliRequest");
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const allowOrigin = env.FEED_ALLOW_ORIGIN || "*";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: jsonHeaders(allowOrigin) });
    }
    if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
      const cliKind = classifyCliPath(url.pathname);
      const explicitCliPath = url.pathname === "/cli" || url.pathname.startsWith("/cli/");
      if (cliKind && (explicitCliPath || isCliClient(request))) {
        return handleCliRequest(request, env, url);
      }
    }
    if (url.pathname === "/api/feed") {
      if (!await checkRateLimit(env.RATE_LIMIT_FEED, clientKey(request))) {
        return tooManyRequests(allowOrigin);
      }
      return handleFeedRequest(request, env, ctx, allowOrigin);
    }
    if (url.pathname === "/api/hit") {
      if (!await checkRateLimit(env.RATE_LIMIT_HIT, clientKey(request))) {
        return tooManyRequests(allowOrigin);
      }
      try {
        const value = await incrementHitCount(env);
        return new Response(JSON.stringify({ value, at: (/* @__PURE__ */ new Date()).toISOString() }), {
          status: 200,
          headers: jsonHeaders(allowOrigin)
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: clean(error?.message || "hit_count_failed"), at: (/* @__PURE__ */ new Date()).toISOString() }),
          {
            status: 502,
            headers: jsonHeaders(allowOrigin)
          }
        );
      }
    }
    if (url.pathname === "/api/guestbook") {
      if (request.method === "GET") {
        try {
          const rawLimit = Number(url.searchParams.get("limit"));
          const hasLimit = Number.isFinite(rawLimit) && rawLimit > 0;
          const limit = hasLimit ? Math.max(1, Math.min(5e3, Math.floor(rawLimit))) : null;
          const entries = await readGuestbookEntries(env);
          const selected = limit ? entries.slice(0, limit) : entries;
          return new Response(JSON.stringify({ entries: selected, at: (/* @__PURE__ */ new Date()).toISOString() }), {
            status: 200,
            headers: jsonHeaders(allowOrigin)
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: clean(error?.message || "guestbook_read_failed"), at: (/* @__PURE__ */ new Date()).toISOString() }),
            {
              status: 502,
              headers: jsonHeaders(allowOrigin)
            }
          );
        }
      }
      if (request.method === "POST") {
        if (!await checkRateLimit(env.RATE_LIMIT_GUESTBOOK_POST, clientKey(request))) {
          return tooManyRequests(allowOrigin);
        }
        try {
          const signerIp = clientKey(request);
          if (await hasGuestbookSignature(env, signerIp)) {
            return new Response(
              JSON.stringify({ error: "already_signed", at: (/* @__PURE__ */ new Date()).toISOString() }),
              { status: 409, headers: jsonHeaders(allowOrigin) }
            );
          }
          const body = await request.json();
          const name = clean(body?.name || "anonymous").slice(0, 48) || "anonymous";
          const message = clean(body?.message || "").slice(0, 280);
          if (!message) {
            return new Response(JSON.stringify({ error: "message_required", at: (/* @__PURE__ */ new Date()).toISOString() }), {
              status: 400,
              headers: jsonHeaders(allowOrigin)
            });
          }
          const entries = await readGuestbookEntries(env);
          const next = [{ name, message, at: (/* @__PURE__ */ new Date()).toISOString() }, ...entries];
          await writeGuestbookEntries(env, next);
          await recordGuestbookSignature(env, signerIp);
          return new Response(JSON.stringify({ ok: true, entries: next, at: (/* @__PURE__ */ new Date()).toISOString() }), {
            status: 200,
            headers: jsonHeaders(allowOrigin)
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: clean(error?.message || "guestbook_write_failed"), at: (/* @__PURE__ */ new Date()).toISOString() }),
            {
              status: 502,
              headers: jsonHeaders(allowOrigin)
            }
          );
        }
      }
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: jsonHeaders(allowOrigin)
      });
    }
    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: jsonHeaders(allowOrigin)
        });
      }
      if (!await checkRateLimit(env.RATE_LIMIT_CONTACT_POST, clientKey(request))) {
        return tooManyRequests(allowOrigin);
      }
      try {
        const body = await request.json().catch(() => ({}));
        if (clean(body?._gotcha || body?.gotcha)) {
          return new Response(JSON.stringify({ ok: true, at: (/* @__PURE__ */ new Date()).toISOString() }), {
            status: 200,
            headers: jsonHeaders(allowOrigin)
          });
        }
        const parsed = parseContactSubmission(body);
        if (!parsed.ok) {
          return new Response(JSON.stringify({ error: parsed.error, at: (/* @__PURE__ */ new Date()).toISOString() }), {
            status: 400,
            headers: jsonHeaders(allowOrigin)
          });
        }
        const turnstileSecret = resolveTurnstileSecret(env, request);
        if (!turnstileSecret) {
          return new Response(JSON.stringify({ error: "turnstile_unconfigured", at: (/* @__PURE__ */ new Date()).toISOString() }), {
            status: 503,
            headers: jsonHeaders(allowOrigin)
          });
        }
        const verification = await verifyTurnstileToken(
          parsed.data.turnstileToken,
          turnstileSecret,
          clientKey(request)
        );
        if (!verification.success) {
          return new Response(
            JSON.stringify({
              error: "turnstile_failed",
              details: verification.errorCodes,
              at: (/* @__PURE__ */ new Date()).toISOString()
            }),
            { status: 403, headers: jsonHeaders(allowOrigin) }
          );
        }
        const allowedHosts = allowedTurnstileHostnames(env);
        if (allowedHosts.size > 0 && !allowedHosts.has(verification.hostname)) {
          return new Response(
            JSON.stringify({
              error: "turnstile_bad_hostname",
              hostname: verification.hostname || null,
              at: (/* @__PURE__ */ new Date()).toISOString()
            }),
            { status: 403, headers: jsonHeaders(allowOrigin) }
          );
        }
        if (verification.action && verification.action !== CONTACT_TURNSTILE_ACTION) {
          return new Response(
            JSON.stringify({
              error: "turnstile_bad_action",
              action: verification.action,
              at: (/* @__PURE__ */ new Date()).toISOString()
            }),
            { status: 403, headers: jsonHeaders(allowOrigin) }
          );
        }
        const at = (/* @__PURE__ */ new Date()).toISOString();
        const delivered = await deliverContactEmail(env, parsed.data, at);
        if (!delivered.ok) {
          return new Response(
            JSON.stringify({
              error: "contact_delivery_failed",
              detail: delivered.error,
              at
            }),
            { status: 502, headers: jsonHeaders(allowOrigin) }
          );
        }
        return new Response(JSON.stringify({
          ok: true,
          relayed: true,
          messageId: delivered.messageId,
          at
        }), {
          status: 200,
          headers: jsonHeaders(allowOrigin)
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: clean(error?.message || "contact_submit_failed"), at: (/* @__PURE__ */ new Date()).toISOString() }),
          { status: 502, headers: jsonHeaders(allowOrigin) }
        );
      }
    }
    if (url.pathname === "/api/contact-config") {
      if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: jsonHeaders(allowOrigin)
        });
      }
      const siteKey = clean(env.TURNSTILE_SITE_KEY || "");
      return new Response(
        JSON.stringify({
          turnstileSiteKey: siteKey || null,
          at: (/* @__PURE__ */ new Date()).toISOString()
        }),
        { status: 200, headers: jsonHeaders(allowOrigin) }
      );
    }
    if (url.pathname === "/api/string/socket") {
      const upgrade = request.headers.get("upgrade") || "";
      if (upgrade.toLowerCase() !== "websocket") {
        return new Response(JSON.stringify({ error: "expected_websocket_upgrade" }), {
          status: 426,
          headers: jsonHeaders(allowOrigin)
        });
      }
      if (!env.STRING_ROOM) {
        return new Response(JSON.stringify({ error: "string_room_unconfigured" }), {
          status: 503,
          headers: jsonHeaders(allowOrigin)
        });
      }
      if (!await checkRateLimit(env.RATE_LIMIT_STRING_SOCKET, clientKey(request))) {
        return tooManyRequests(allowOrigin);
      }
      const id = env.STRING_ROOM.idFromName(STRING_ROOM_NAME);
      const stub = env.STRING_ROOM.get(id);
      return stub.fetch(request);
    }
    if (url.pathname === "/api/coroom/socket") {
      const upgrade = request.headers.get("upgrade") || "";
      if (upgrade.toLowerCase() !== "websocket") {
        return new Response(JSON.stringify({ error: "expected_websocket_upgrade" }), {
          status: 426,
          headers: jsonHeaders(allowOrigin)
        });
      }
      if (!env.CO_ROOM) {
        return new Response(JSON.stringify({ error: "coroom_unconfigured" }), {
          status: 503,
          headers: jsonHeaders(allowOrigin)
        });
      }
      if (!await checkRateLimit(env.RATE_LIMIT_COROOM_SOCKET, clientKey(request))) {
        return tooManyRequests(allowOrigin);
      }
      const id = env.CO_ROOM.idFromName(COROOM_NAME);
      const stub = env.CO_ROOM.get(id);
      return stub.fetch(request);
    }
    if (url.pathname === "/api/coroom/snapshot") {
      if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: jsonHeaders(allowOrigin)
        });
      }
      if (!env.CO_ROOM) {
        return new Response(JSON.stringify({ error: "coroom_unconfigured" }), {
          status: 503,
          headers: jsonHeaders(allowOrigin)
        });
      }
      const id = env.CO_ROOM.idFromName(COROOM_NAME);
      const stub = env.CO_ROOM.get(id);
      const snapshotUrl = new URL(request.url);
      snapshotUrl.pathname = "/snapshot";
      const doRequest = new Request(snapshotUrl.toString(), { method: "GET" });
      const response = await stub.fetch(doRequest);
      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: jsonHeaders(allowOrigin)
      });
    }
    if (url.pathname === "/api/corpus/socket") {
      if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
        return new Response(JSON.stringify({ error: "expected_websocket_upgrade" }), {
          status: 426,
          headers: jsonHeaders(allowOrigin)
        });
      }
      if (!env.BFV_ROOM) {
        return new Response(JSON.stringify({ error: "bfv_unconfigured" }), {
          status: 503,
          headers: jsonHeaders(allowOrigin)
        });
      }
      if (!await checkRateLimit(env.RATE_LIMIT_BFV_SOCKET, clientKey(request))) {
        return tooManyRequests(allowOrigin);
      }
      const id = env.BFV_ROOM.idFromName(BFV_ROOM_NAME);
      const stub = env.BFV_ROOM.get(id);
      return stub.fetch(request);
    }
    if (url.pathname.startsWith("/api/corpus/")) {
      if (!env.BFV_ROOM) {
        return new Response(JSON.stringify({ error: "bfv_unconfigured" }), {
          status: 503,
          headers: jsonHeaders(allowOrigin)
        });
      }
      const sub = url.pathname.slice("/api/corpus/".length);
      const id = env.BFV_ROOM.idFromName(BFV_ROOM_NAME);
      const stub = env.BFV_ROOM.get(id);
      if (sub === "state" && request.method === "GET") {
        const inner = new URL(request.url);
        inner.pathname = "/state";
        const resp = await stub.fetch(new Request(inner.toString(), { method: "GET" }));
        const body = await resp.text();
        return new Response(body, { status: resp.status, headers: jsonHeaders(allowOrigin) });
      }
      if (sub === "qualify" && request.method === "POST") {
        if (!await checkRateLimit(env.RATE_LIMIT_BFV_QUALIFY, clientKey(request))) {
          return tooManyRequests(allowOrigin);
        }
        const bodyText = await request.text();
        const inner = new URL(request.url);
        inner.pathname = "/qualify";
        const forwarded = new Request(inner.toString(), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": request.headers.get("user-agent") || "",
            "cf-connecting-ip": clientKey(request)
          },
          body: bodyText
        });
        const resp = await stub.fetch(forwarded);
        const body = await resp.text();
        return new Response(body, { status: resp.status, headers: jsonHeaders(allowOrigin) });
      }
      if (sub === "export.json" && request.method === "GET") {
        const inner = new URL(request.url);
        inner.pathname = "/export";
        const resp = await stub.fetch(new Request(inner.toString(), { method: "GET" }));
        const body = await resp.text();
        return new Response(body, { status: resp.status, headers: jsonHeaders(allowOrigin) });
      }
      if (sub === "snapshot.html" && request.method === "GET") {
        const inner = new URL(request.url);
        inner.pathname = "/snapshot";
        const resp = await stub.fetch(new Request(inner.toString(), { method: "GET" }));
        const body = await resp.text();
        return new Response(body, {
          status: resp.status,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=60",
            "access-control-allow-origin": allowOrigin,
            link: DISCOVERY_LINK_HEADER
          }
        });
      }
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: jsonHeaders(allowOrigin)
      });
    }
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ ok: true, at: (/* @__PURE__ */ new Date()).toISOString() }), {
        status: 200,
        headers: jsonHeaders(allowOrigin)
      });
    }
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: jsonHeaders(allowOrigin)
    });
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const snapshot = await buildFeedSnapshot(env);
        await persistFeedSnapshot(env, snapshot);
      })()
    );
  }
};

// ../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-mgSNJb/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-mgSNJb/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  BodyForVisitsRoom,
  CoRoom,
  StringRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
