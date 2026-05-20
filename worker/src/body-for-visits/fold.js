// Folding keeps the visible body finite without erasing what has been visited.
// When the body exceeds MAX, the oldest tokens are absorbed into a single
// italic fold marker that names the count. The marker is part of the work.

export const MAX_VISIBLE = 180;
export const KEEP_TAIL = 90;

export function makeFoldMarker(foldGenerations, foldCount) {
  return {
    token: `⟨folded ×${foldGenerations}: ${foldCount} entries held⟩`,
    role: "fold_marker",
    event_id: null,
    ts: Date.now(),
  };
}

// Returns { body, fold_count, fold_generations } — original values unchanged
// if no fold occurred. The body may already contain a previous fold marker at
// position 0; if so, it is replaced rather than stacked.
export function foldBody(body, foldCount, foldGenerations, now = Date.now()) {
  if (!Array.isArray(body) || body.length <= MAX_VISIBLE) {
    return { body, fold_count: foldCount, fold_generations: foldGenerations };
  }

  const hadMarker = body.length > 0 && body[0].role === "fold_marker";
  const real = hadMarker ? body.slice(1) : body;

  // Peel everything except the most recent KEEP_TAIL real tokens.
  const cut = real.length - KEEP_TAIL;
  if (cut <= 0) {
    return { body, fold_count: foldCount, fold_generations: foldGenerations };
  }
  const absorbed = real.slice(0, cut);
  const tail = real.slice(cut);

  const nextCount = foldCount + absorbed.length;
  const nextGens = foldGenerations + 1;
  const marker = {
    token: `⟨folded ×${nextGens}: ${nextCount} entries held⟩`,
    role: "fold_marker",
    event_id: null,
    ts: now,
  };
  return {
    body: [marker, ...tail],
    fold_count: nextCount,
    fold_generations: nextGens,
  };
}

// Count of real (non-marker) tokens in a visible body.
export function realTokenCount(body) {
  if (!Array.isArray(body)) return 0;
  let n = 0;
  for (const t of body) if (t.role !== "fold_marker") n++;
  return n;
}
