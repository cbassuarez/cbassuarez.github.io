// Tiny online-trained neural language model for (to)complete.
//
// A fixed-window neural language model (Bengio 2003): K previous token ids ->
// concatenated embeddings -> tanh hidden layer -> softmax over a capped vocab.
// Feed-forward on purpose — one clean forward/backward pass per example, no
// backprop-through-time, which keeps online SGD numerically stable.
//
// Generation rolls the model out autoregressively under a regulator (temperature,
// repetition penalty, entropy floor) and structural constraints, so its output
// almost always satisfies validateSpeechUnit. The Durable Object trains it in
// place between visits; this module is pure and has no I/O.

import {
  tokenizeSpeech,
  detokenize,
  validateSpeechUnit,
  targetWordCount,
  mulberry32,
  hashTokens,
  isWord as isWordToken,
  SPEECH_ROLE,
  MIN_WORDS,
  MAX_WORDS,
  PUNCTUATION,
  CONNECTORS,
  GOOD_STARTERS,
  BAD_STARTERS,
  BAD_ENDERS,
  NARRATION_WORDS,
  BLOCKED_TERMS,
} from "./grammar.js";

export const NET_VERSION = 1;

// Sampling / regulator hyper-parameters.
const TEMPERATURE = 0.9;
const REP_PENALTY = 1.6;
const REP_WINDOW = 24;
const ENTROPY_FLOOR = 2.0; // nats
const MIX_CAP = 0.5;
const MAX_ROLLOUT_STEPS = 22;
const MAX_ATTEMPTS = 24;
const SEED_A = 0x9e3779b1;
const SEED_B = 0x85ebca6b;

const BOS_TOKEN = "<bos>";
const UNK_TOKEN = "<unk>";

// ---------------------------------------------------------------------------
// Net construction
// ---------------------------------------------------------------------------

export function weightCount(config) {
  const { V, K, D, H } = config;
  return V * D + H * (K * D) + H + V * H + V;
}

function randomMatrix(length, limit, rng) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = (rng() * 2 - 1) * limit;
  return out;
}

export function createNet(config, seed = 1) {
  const { V, K, D, H } = config;
  const IN = K * D;
  const rng = mulberry32(seed >>> 0);
  return {
    config: { V, K, D, H },
    E: randomMatrix(V * D, 0.05, rng),
    W1: randomMatrix(H * IN, Math.sqrt(6 / (IN + H)), rng),
    b1: new Float32Array(H),
    W2: randomMatrix(V * H, Math.sqrt(6 / (H + V)), rng),
    b2: new Float32Array(V),
  };
}

// ---------------------------------------------------------------------------
// Forward / backward
// ---------------------------------------------------------------------------

export function forward(net, ctxIds) {
  const { V, K, D, H } = net.config;
  const IN = K * D;
  const x = new Float32Array(IN);
  for (let k = 0; k < K; k++) {
    const base = (ctxIds[k] >>> 0) * D;
    for (let d = 0; d < D; d++) x[k * D + d] = net.E[base + d];
  }
  const h = new Float32Array(H);
  for (let i = 0; i < H; i++) {
    let s = net.b1[i];
    const row = i * IN;
    for (let j = 0; j < IN; j++) s += net.W1[row + j] * x[j];
    h[i] = Math.tanh(s);
  }
  const logits = new Float32Array(V);
  for (let v = 0; v < V; v++) {
    let s = net.b2[v];
    const row = v * H;
    for (let i = 0; i < H; i++) s += net.W2[row + i] * h[i];
    logits[v] = s;
  }
  return { x, h, logits };
}

export function softmax(logits, temperature = 1) {
  const n = logits.length;
  const out = new Float32Array(n);
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const l = logits[i] / temperature;
    out[i] = l;
    if (l > max) max = l;
  }
  if (!Number.isFinite(max)) max = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.exp(out[i] - max);
    out[i] = e;
    sum += e;
  }
  const inv = sum > 0 ? 1 / sum : 0;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

// One reward-weighted mini-batch SGD step. batch: [{ ctx:[K ids], target:id,
// weight?:number }]. The per-example weight folds in attention and decay; L2
// weight decay shrinks weights every step — the model's literal forgetting.
export function trainStep(net, batch, opts = {}) {
  const { lr = 0.02, clip = 1.0, decay = 1e-4 } = opts;
  const { V, K, D, H } = net.config;
  const IN = K * D;

  const gE = new Float32Array(net.E.length);
  const gW1 = new Float32Array(net.W1.length);
  const gb1 = new Float32Array(H);
  const gW2 = new Float32Array(net.W2.length);
  const gb2 = new Float32Array(V);

  let loss = 0;
  let used = 0;
  for (const ex of batch) {
    const target = ex.target;
    if (!(target >= 0 && target < V)) continue;
    const w = ex.weight == null ? 1 : ex.weight;
    if (!(w > 0)) continue;
    used++;

    const { x, h, logits } = forward(net, ex.ctx);
    const p = softmax(logits);
    loss += -Math.log(Math.max(p[target], 1e-9)) * w;

    const dh = new Float32Array(H);
    for (let v = 0; v < V; v++) {
      const dl = (p[v] - (v === target ? 1 : 0)) * w;
      if (dl === 0) continue;
      gb2[v] += dl;
      const row = v * H;
      for (let i = 0; i < H; i++) {
        gW2[row + i] += dl * h[i];
        dh[i] += dl * net.W2[row + i];
      }
    }
    const dx = new Float32Array(IN);
    for (let i = 0; i < H; i++) {
      const dp = dh[i] * (1 - h[i] * h[i]);
      gb1[i] += dp;
      const row = i * IN;
      for (let j = 0; j < IN; j++) {
        gW1[row + j] += dp * x[j];
        dx[j] += dp * net.W1[row + j];
      }
    }
    for (let k = 0; k < K; k++) {
      const base = (ex.ctx[k] >>> 0) * D;
      for (let d = 0; d < D; d++) gE[base + d] += dx[k * D + d];
    }
  }
  if (used === 0) return 0;

  const inv = 1 / used;
  scale(gE, inv);
  scale(gW1, inv);
  scale(gb1, inv);
  scale(gW2, inv);
  scale(gb2, inv);

  let norm = sumSq(gE) + sumSq(gW1) + sumSq(gb1) + sumSq(gW2) + sumSq(gb2);
  norm = Math.sqrt(norm);
  const gs = norm > clip && norm > 0 ? clip / norm : 1;

  applyUpdate(net.E, gE, lr * gs, lr * decay);
  applyUpdate(net.W1, gW1, lr * gs, lr * decay);
  applyUpdate(net.b1, gb1, lr * gs, 0);
  applyUpdate(net.W2, gW2, lr * gs, lr * decay);
  applyUpdate(net.b2, gb2, lr * gs, 0);

  return loss / used;
}

function scale(arr, factor) {
  for (let i = 0; i < arr.length; i++) arr[i] *= factor;
}

function sumSq(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
  return s;
}

function applyUpdate(param, grad, step, weightDecay) {
  for (let i = 0; i < param.length; i++) {
    param[i] -= step * grad[i] + weightDecay * param[i];
  }
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

function concatWeights(net) {
  const all = new Float32Array(weightCount(net.config));
  let o = 0;
  for (const part of [net.E, net.W1, net.b1, net.W2, net.b2]) {
    all.set(part, o);
    o += part.length;
  }
  return all;
}

export function serializeNet(net) {
  const all = concatWeights(net);
  return new Uint8Array(all.buffer, all.byteOffset, all.byteLength);
}

export function snapshotWeights(net) {
  return concatWeights(net);
}

// Accepts a Float32Array, Uint8Array, or ArrayBuffer of [E|W1|b1|W2|b2].
export function loadWeights(net, data) {
  let floats;
  if (data instanceof Float32Array) {
    floats = data;
  } else if (data instanceof Uint8Array) {
    floats = new Float32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
  } else if (data instanceof ArrayBuffer) {
    floats = new Float32Array(data);
  } else {
    throw new Error("loadWeights: unsupported data type");
  }
  if (floats.length !== weightCount(net.config)) {
    throw new Error(
      `loadWeights: expected ${weightCount(net.config)} floats, got ${floats.length}`
    );
  }
  let o = 0;
  for (const part of [net.E, net.W1, net.b1, net.W2, net.b2]) {
    part.set(floats.subarray(o, o + part.length));
    o += part.length;
  }
  return net;
}

export function hasNaN(net) {
  for (const part of [net.E, net.W1, net.b1, net.W2, net.b2]) {
    for (let i = 0; i < part.length; i++) {
      if (!Number.isFinite(part[i])) return true;
    }
  }
  return false;
}

// Pull every weight a fraction of the way toward a reference snapshot — the
// collapse watchdog uses this to lean back on the bundled warm-start weights.
export function blendToward(net, referenceFloats, alpha) {
  const a = Math.min(Math.max(alpha, 0), 1);
  if (a === 0) return;
  let o = 0;
  for (const part of [net.E, net.W1, net.b1, net.W2, net.b2]) {
    for (let i = 0; i < part.length; i++) {
      part[i] = part[i] * (1 - a) + referenceFloats[o + i] * a;
    }
    o += part.length;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function floatsToBase64(floats) {
  const bytes = new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
  let out = "";
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + "==";
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + "=";
  }
  return out;
}

export function base64ToFloats(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer, 0, bytes.length >> 2);
}

// ---------------------------------------------------------------------------
// Vocabulary context
// ---------------------------------------------------------------------------

// Pre-classifies every vocab id once so the sampler can mask in O(V) with flat
// typed arrays instead of string lookups per step.
export function buildVocabContext(vocab) {
  const V = vocab.length;
  const word2id = new Map();
  for (let id = 0; id < V; id++) word2id.set(vocab[id], id);

  const isWordArr = new Uint8Array(V);
  const isPunctArr = new Uint8Array(V);
  const goodStartArr = new Uint8Array(V);
  const badEnderArr = new Uint8Array(V);
  const connectorArr = new Uint8Array(V);
  const bannedArr = new Uint8Array(V); // never emit: specials, narration, blocked

  const BOS = word2id.has(BOS_TOKEN) ? word2id.get(BOS_TOKEN) : 0;
  const UNK = word2id.has(UNK_TOKEN) ? word2id.get(UNK_TOKEN) : 1;

  for (let id = 0; id < V; id++) {
    const w = vocab[id];
    const word = isWordToken(w);
    isWordArr[id] = word ? 1 : 0;
    isPunctArr[id] = PUNCTUATION.has(w) ? 1 : 0;
    connectorArr[id] = CONNECTORS.has(w) ? 1 : 0;
    badEnderArr[id] = word && BAD_ENDERS.has(w) ? 1 : 0;
    goodStartArr[id] =
      word && GOOD_STARTERS.has(w) && !BAD_STARTERS.has(w) && !NARRATION_WORDS.has(w) ? 1 : 0;
    if (
      id === BOS ||
      id === UNK ||
      NARRATION_WORDS.has(w) ||
      BLOCKED_TERMS.has(w) ||
      (!word && !PUNCTUATION.has(w))
    ) {
      bannedArr[id] = 1;
    }
  }

  return {
    vocab,
    V,
    word2id,
    BOS,
    UNK,
    isWord: isWordArr,
    isPunct: isPunctArr,
    goodStart: goodStartArr,
    badEnder: badEnderArr,
    connector: connectorArr,
    banned: bannedArr,
  };
}

export function encodeContext(words, vctx, K) {
  const ids = [];
  for (let i = Math.max(0, words.length - K); i < words.length; i++) {
    const id = vctx.word2id.get(words[i]);
    ids.push(id == null ? vctx.UNK : id);
  }
  while (ids.length < K) ids.unshift(vctx.BOS);
  return ids;
}

// ---------------------------------------------------------------------------
// Regulated, constrained autoregressive rollout
// ---------------------------------------------------------------------------

function sampleFrom(probs, rng) {
  let r = rng();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r <= 0) return i;
  }
  for (let i = probs.length - 1; i >= 0; i--) {
    if (probs[i] > 0) return i;
  }
  return 0;
}

function entropy(probs) {
  let h = 0;
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i];
    if (p > 0) h -= p * Math.log(p);
  }
  return h;
}

// Returns the token ids of one new speech unit (context excluded), or [].
export function rolloutIds(net, vctx, ctxIds, rng, recentIds = []) {
  const { K, V } = net.config;
  const ctx = ctxIds.slice(-K);
  while (ctx.length < K) ctx.unshift(vctx.BOS);

  const out = [];
  const target = targetWordCount(rng);
  const recent = new Set(recentIds);
  let words = 0;

  for (let step = 0; step < MAX_ROLLOUT_STEPS && words < MAX_WORDS; step++) {
    const { logits } = forward(net, ctx);
    const adj = Float32Array.from(logits);

    for (let id = 0; id < V; id++) {
      if (vctx.banned[id]) adj[id] = -Infinity;
    }

    const prevId = out.length > 0 ? out[out.length - 1] : ctx[K - 1];
    if (out.length === 0) {
      for (let id = 0; id < V; id++) {
        if (!vctx.goodStart[id]) adj[id] = -Infinity;
      }
    } else {
      adj[prevId] = -Infinity;
      if (vctx.isPunct[prevId]) {
        for (let id = 0; id < V; id++) {
          if (vctx.isPunct[id]) adj[id] = -Infinity;
        }
      }
      for (const id of recent) {
        const l = adj[id];
        if (Number.isFinite(l)) adj[id] = l > 0 ? l / REP_PENALTY : l * REP_PENALTY;
      }
    }

    let allowed = 0;
    for (let id = 0; id < V; id++) if (Number.isFinite(adj[id])) allowed++;
    if (allowed === 0) break;

    let probs = softmax(adj, TEMPERATURE);
    const h = entropy(probs);
    if (h < ENTROPY_FLOOR) {
      const a = Math.min(MIX_CAP, Math.max(0, (ENTROPY_FLOOR - h) / ENTROPY_FLOOR));
      const u = 1 / allowed;
      for (let id = 0; id < V; id++) {
        probs[id] = Number.isFinite(adj[id]) ? probs[id] * (1 - a) + u * a : 0;
      }
    }

    const id = sampleFrom(probs, rng);
    out.push(id);
    recent.add(id);
    for (let k = 0; k < K - 1; k++) ctx[k] = ctx[k + 1];
    ctx[K - 1] = id;

    if (vctx.isWord[id]) words++;
    if (vctx.isPunct[id] && words >= MIN_WORDS) break;
    // Prefer to stop on a word that can legally end a unit, or on punctuation.
    if (words >= target && vctx.isWord[id] && !vctx.badEnder[id] && rng() < 0.7) break;
  }

  // Never end on a dangling word (BAD_ENDERS also covers trailing connectors).
  while (
    out.length > 0 &&
    vctx.isWord[out[out.length - 1]] &&
    vctx.badEnder[out[out.length - 1]]
  ) {
    out.pop();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Selector — a drop-in replacement for the old grammar selectNextToken
// ---------------------------------------------------------------------------

export function createSelector(net, vctx) {
  const { K } = net.config;
  return function selectNextToken(prevRole, eventIndex, seed, prevToken = null, model = null) {
    void prevRole;
    const recentWords =
      model && Array.isArray(model.recentTokens) && model.recentTokens.length > 0
        ? model.recentTokens
        : tokenizeSpeech(prevToken || "");
    const ctxIds = encodeContext(recentWords, vctx, K);
    const recentIds = recentWords
      .slice(-REP_WINDOW)
      .map((w) => {
        const id = vctx.word2id.get(w);
        return id == null ? vctx.UNK : id;
      });
    const contextHash = hashTokens(recentWords.slice(-8));

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const attemptSeed =
        (seed ^
          contextHash ^
          Math.imul(eventIndex, SEED_A) ^
          Math.imul(attempt + 1, SEED_B)) >>>
        0;
      const rng = mulberry32(attemptSeed);
      const ids = rolloutIds(net, vctx, ctxIds, rng, recentIds);
      if (ids.length === 0) continue;
      const candidate = detokenize(ids.map((id) => vctx.vocab[id]));
      const validation = validateSpeechUnit(candidate, prevToken);
      if (validation.ok) {
        return { token: validation.token, role: SPEECH_ROLE };
      }
    }
    return null;
  };
}

export const _internals = {
  TEMPERATURE,
  REP_PENALTY,
  REP_WINDOW,
  ENTROPY_FLOOR,
  MAX_ATTEMPTS,
  MAX_ROLLOUT_STEPS,
  entropy,
  softmax,
};
