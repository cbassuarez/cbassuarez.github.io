const MODE_DURATION = 1040;
const PAGE_DURATION = 680;
const MODE_EASING = 'cubic-bezier(0.2, 0.82, 0.18, 1)';
const PAGE_EASING = 'cubic-bezier(0.22, 0.74, 0.22, 1)';

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

function targetTopForFrame(frameRect) {
  if (frameRect.top >= 20 && frameRect.top <= window.innerHeight * 0.55) return frameRect.top;
  return Math.max(32, Math.min(132, window.innerHeight * 0.14));
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
  clone.style.willChange = 'transform, opacity';
  clone.style.transform = 'translate3d(0, 0, 0)';

  const clonedBody = clone.querySelector('.body-text');
  if (clonedBody) freezeBodyText(bodyEl, clonedBody);
  return clone;
}

async function animateClones(sourceClone, targetClone, sourceToY, targetFromY, duration, easing) {
  sourceClone.style.opacity = '1';
  sourceClone.style.transform = 'translate3d(0, 0, 0)';
  targetClone.style.opacity = '0';
  targetClone.style.transform = `translate3d(0, ${targetFromY}px, 0)`;

  const animations = [
    sourceClone.animate([
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      { opacity: 0, transform: `translate3d(0, ${sourceToY}px, 0)` },
    ], {
      duration,
      easing,
      fill: 'forwards',
    }),
    targetClone.animate([
      { opacity: 0, transform: `translate3d(0, ${targetFromY}px, 0)` },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ], {
      duration,
      easing,
      fill: 'forwards',
    }),
  ];

  await Promise.allSettled(animations.map((animation) => animation.finished));
}

async function withOverlay(bodyFrameEl, overlay, work) {
  bodyFrameEl.classList.add('bfv-morph-source');
  document.body.appendChild(overlay);
  try {
    return await work();
  } finally {
    overlay.remove();
    bodyFrameEl.classList.remove('bfv-morph-source');
  }
}

export async function transition(opts = {}) {
  const {
    bodyFrameEl,
    bodyEl,
    fromMode,
    toMode,
    pageIndex = 0,
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
  const bodyFrameDocumentTop = sourceRect.top + window.scrollY;
  const sourceTop = fromMode === 'flow'
    ? sourceRect.top + Math.max(0, pageIndex) * pageHeight
    : sourceRect.top;
  const targetTop = toMode === 'flow' ? sourceTop : targetTopForFrame({ top: sourceTop });
  const targetScrollY = toMode === 'flow'
    ? bodyFrameDocumentTop + Math.max(0, pageIndex) * pageHeight - targetTop
    : bodyFrameDocumentTop - targetTop;
  const move = Math.min(pageHeight * 0.16, lineHeight(bodyEl) * 4);
  const overlay = createOverlay();
  const sourceClone = freezeFrame(bodyFrameEl, bodyEl);
  overlay.appendChild(sourceClone);

  return withOverlay(bodyFrameEl, overlay, async () => {
    await raf();
    changeLayout({ scrollY: targetScrollY });
    await raf();
    const targetClone = freezeFrame(bodyFrameEl, bodyEl);
    overlay.appendChild(targetClone);
    await animateClones(sourceClone, targetClone, -move, move, MODE_DURATION, MODE_EASING);
    return true;
  });
}

export async function transitionPage(opts = {}) {
  const {
    bodyFrameEl,
    bodyEl,
    fromPageIndex = 0,
    toPageIndex = 0,
    pageHeight: requestedPageHeight = 0,
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

  const sourceRect = bodyFrameEl.getBoundingClientRect();
  const pageHeight = Math.max(1, Math.floor(requestedPageHeight || sourceRect.height));
  const move = Math.min(pageHeight * 0.18, lineHeight(bodyEl) * 5);
  const direction = toPageIndex > fromPageIndex ? 1 : -1;
  const overlay = createOverlay();
  const sourceClone = freezeFrame(bodyFrameEl, bodyEl);
  overlay.appendChild(sourceClone);

  return withOverlay(bodyFrameEl, overlay, async () => {
    await raf();
    changePage();
    await raf();
    const targetClone = freezeFrame(bodyFrameEl, bodyEl);
    overlay.appendChild(targetClone);
    await animateClones(sourceClone, targetClone, -direction * move, direction * move, PAGE_DURATION, PAGE_EASING);
    return true;
  });
}
