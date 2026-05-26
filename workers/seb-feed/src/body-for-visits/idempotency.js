export const VISIT_ID_TTL_MS = 60 * 1000;

const VISIT_ID_RE = /^[0-9a-z][0-9a-z-]{7,79}$/i;

export function normalizeVisitId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return VISIT_ID_RE.test(raw) ? raw.toLowerCase() : null;
}

export function duplicateQualifyResponse(state, quota) {
  return { ...state, skipped: "duplicate", quota };
}

export class SerialQueue {
  constructor() {
    this.tail = Promise.resolve();
  }

  run(task) {
    const next = this.tail.then(() => task());
    this.tail = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}
