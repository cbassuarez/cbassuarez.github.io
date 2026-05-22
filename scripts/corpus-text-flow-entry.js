import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';

// Corpus layout transitions for /labs/corpus — the "Pretext" reflow.
//
// A transition freezes the OUTGOING layout as a clone in a fixed overlay,
// applies the real layout change underneath, then reveals the REAL frame —
// never a second clone. Because the incoming element is the live one, its
// end state is its own resting style: there is nothing to flash to when the
// overlay lifts.
//
//   mode change (flow <-> paged): new layout fades in, easing down a few
//     lines into place, while the old layout dissolves.
//   page change (<- / ->):        old page dissolves into the new one, in
//     place — the column layout already carries the sense of paging.

const MODE_DURATION = 720;
const PAGE_DURATION = 520;
const MODE_EASING = 'cubic-bezier(0.2, 0.82, 0.18, 1)';
const PAGE_EASING = 'cubic-bezier(0.33, 0, 0.2, 1)';

function raf() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function px(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function lineHeight(bodyEl) {
  const style = getComputedStyle(bodyEl);
  return px(style.lineHeight, px(style.fontSize, 19) * 1.62);
}

function canvasFont(style) {
  if (style.font && style.font !== '') return style.font;
  return `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function normalizedText(el) {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim();
}

export function measureText(bodyEl, width) {
  if (!bodyEl || !Number.isFinite(width) || width <= 0) return null;
  const style = getComputedStyle(bodyEl);
  const measuredLineHeight = lineHeight(bodyEl);
  const letterSpacing = style.letterSpacing === 'normal' ? 0 : px(style.letterSpacing, 0);
  const prepared = prepareWithSegments(normalizedText(bodyEl), canvasFont(style), { letterSpacing });
  const lines = layoutWithLines(prepared, Math.max(1, Math.floor(width)), measuredLineHeight).lines;
  return {
    lineCount: lines.length,
    lineHeight: measuredLineHeight,
    height: lines.length * measuredLineHeight,
  };
}

function removeIds(el) {
  if (el.nodeType !== Node.ELEMENT_NODE) return;
  el.removeAttribute('id');
  for (const child of el.children) removeIds(child);
}

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'bfv-morph-overlay';
  overlay.style.left = '0';
  overlay.style.top = '0';
  overlay.style.width = `${window.innerWidth}px`;
  overlay.style.height = `${window.innerHeight}px`;
  return overlay;
}

function freezeBodyText(source, clone) {
  const style = getComputedStyle(source);
  clone.style.margin = style.margin;
  clone.style.width = style.width;
  clone.style.height = style.height;
  clone.style.columnWidth = style.columnWidth;
  clone.style.columnGap = style.columnGap;
  clone.style.columnFill = style.columnFill;
  clone.style.transform = style.transform === 'none' ? 'none' : style.transform;
  clone.style.transformOrigin = style.transformOrigin;
  clone.style.font = style.font;
  clone.style.lineHeight = style.lineHeight;
  clone.style.textAlign = style.textAlign;
  clone.style.textWrap = style.textWrap;
  clone.style.color = style.color;
}

// A detached, absolutely-positioned copy of the frame exactly as it looks
// now. Only ever used for the OUTGOING layout, which merely dissolves away.
function freezeFrame(bodyFrameEl, bodyEl) {
  const rect = bodyFrameEl.getBoundingClientRect();
  const frameStyle = getComputedStyle(bodyFrameEl);
  const clone = bodyFrameEl.cloneNode(true);
  removeIds(clone);
  clone.classList.remove('bfv-morph-source');
  clone.style.position = 'absolute';
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = '0';
  clone.style.overflow = frameStyle.overflow;
  clone.style.opacity = '1';
  clone.style.willChange = 'opacity';
  clone.style.transform = 'translate3d(0, 0, 0)';

  const clonedBody = clone.querySelector('.body-text');
  if (clonedBody) freezeBodyText(bodyEl, clonedBody);
  return clone;
}

async function withMorph(bodyFrameEl, overlay, work) {
  bodyFrameEl.classList.add('bfv-morph-source');
  document.body.appendChild(overlay);
  try {
    return await work();
  } finally {
    overlay.remove();
    bodyFrameEl.classList.remove('bfv-morph-source');
  }
}

// Reveal the real frame: the outgoing clone dissolves while the live frame
// itself fades — and, for a mode change, eases down `settle`px — into place.
// The frame ends at its own resting style, so the overlay can lift without a
// flash. The hide class is dropped and the animation created in one tick so
// the frame never paints a frame at full opacity before the fade begins.
async function revealRealFrame(bodyFrameEl, sourceClone, settle, duration, easing) {
  bodyFrameEl.classList.remove('bfv-morph-source');
  const revealFrames = settle > 0
    ? [
        { opacity: 0, transform: `translate3d(0, ${-settle}px, 0)` },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ]
    : [{ opacity: 0 }, { opacity: 1 }];
  const reveal = bodyFrameEl.animate(revealFrames, { duration, easing });
  const dissolve = sourceClone.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    { duration, easing, fill: 'forwards' },
  );
  await Promise.allSettled([reveal.finished, dissolve.finished]);
}

// Mode change (flow <-> paged). The old layout dissolves; the real new
// layout fades in and eases down a few lines into place.
export async function transition(opts = {}) {
  const {
    bodyFrameEl,
    bodyEl,
    fromMode,
    toMode,
    pageHeight: requestedPageHeight = 0,
    reducedMotion = false,
    changeLayout,
  } = opts;

  if (reducedMotion ||
      !bodyFrameEl ||
      !bodyEl ||
      typeof changeLayout !== 'function' ||
      (toMode !== 'flow' && toMode !== 'paged') ||
      fromMode === toMode) {
    return false;
  }

  const sourceRect = bodyFrameEl.getBoundingClientRect();
  const pageHeight = Math.max(1, Math.floor(requestedPageHeight || sourceRect.height));
  const settle = Math.min(pageHeight * 0.035, lineHeight(bodyEl) * 0.65);

  const overlay = createOverlay();
  const sourceClone = freezeFrame(bodyFrameEl, bodyEl);
  overlay.appendChild(sourceClone);

  return withMorph(bodyFrameEl, overlay, async () => {
    await raf();
    changeLayout();
    await raf();
    await revealRealFrame(bodyFrameEl, sourceClone, settle, MODE_DURATION, MODE_EASING);
    return true;
  });
}

// Page change. The old page dissolves into the new one, in place — no
// travel; next and previous read the same on purpose.
export async function transitionPage(opts = {}) {
  const {
    bodyFrameEl,
    bodyEl,
    fromPageIndex = 0,
    toPageIndex = 0,
    reducedMotion = false,
    changePage,
  } = opts;

  if (reducedMotion ||
      !bodyFrameEl ||
      !bodyEl ||
      typeof changePage !== 'function' ||
      fromPageIndex === toPageIndex) {
    return false;
  }

  const overlay = createOverlay();
  const sourceClone = freezeFrame(bodyFrameEl, bodyEl);
  overlay.appendChild(sourceClone);

  return withMorph(bodyFrameEl, overlay, async () => {
    await raf();
    changePage();
    await raf();
    await revealRealFrame(bodyFrameEl, sourceClone, 0, PAGE_DURATION, PAGE_EASING);
    return true;
  });
}
