(() => {
  'use strict';

  // The work mutates only when a visit is *visible* for at least DWELL_MS and
  // the same browser session still has quota in the server-side rolling window.
  const PROD_API = 'https://seb-feed.cbassuarez.workers.dev';
  const params = new URLSearchParams(location.search);
  const API_BASE = (params.get('api') || PROD_API).replace(/\/+$/, '');

  const DWELL_MS = 2000;
  const SESSION_KEY = 'bfv:session-v1';
  const VISIT_KEY = 'bfv:visit-v1';
  const VIEW_KEY = 'bfv:view-v1';
  const VISIT_TTL_MS = 60000;
  const VISIT_ID_RE = /^[0-9a-z][0-9a-z-]{7,79}$/i;
  const PAGE_GAP_PX = 48;

  const bodyFrameEl = document.getElementById('bfv-body-frame');
  const bodyEl = document.getElementById('bfv-body');
  const fringeEl = document.getElementById('bfv-fringe');
  const statusEl = document.getElementById('bfv-status');
  const motionRoot = document.getElementById('bfv-motion-root');
  const readoutEl = document.getElementById('bfv-readout');
  const countEl = document.getElementById('bfv-count');
  const presenceEl = document.getElementById('bfv-presence');
  const continueBtn = document.getElementById('bfv-continue');
  const pageControlsEl = document.getElementById('bfv-page-controls');
  const pagePrevBtn = document.getElementById('bfv-page-prev');
  const pageNextBtn = document.getElementById('bfv-page-next');
  const pageReadoutEl = document.getElementById('bfv-page-readout');
  const viewToggleBtn = document.getElementById('bfv-view-toggle');
  const reducedMotionQuery = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  const colophonBtn = document.getElementById('bfv-colophon-open');
  const colophonDlg = document.getElementById('bfv-colophon');
  if (colophonBtn && colophonDlg && typeof colophonDlg.showModal === 'function') {
    function setDialogScrollLock(locked) {
      document.documentElement.classList.toggle('bfv-dialog-open', locked);
      document.body.classList.toggle('bfv-dialog-open', locked);
    }

    colophonBtn.addEventListener('click', () => {
      colophonDlg.showModal();
      setDialogScrollLock(true);
    });
    colophonDlg.addEventListener('close', () => setDialogScrollLock(false));
    colophonDlg.addEventListener('click', (e) => {
      if (e.target === colophonDlg) colophonDlg.close();
    });
  }

  const motionController = (() => {
    try {
      if (!motionRoot || !window.CorpusAcceptanceMotion) return null;
      return window.CorpusAcceptanceMotion.mount(motionRoot);
    } catch (_) {
      return null;
    }
  })();

  function setMotionPhase(phase) {
    if (motionController && typeof motionController.setPhase === 'function') {
      motionController.setPhase(phase);
    }
  }

  function setMotionProgress(progress) {
    if (motionController && typeof motionController.setProgress === 'function') {
      motionController.setProgress(progress);
    }
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setReadout(text) {
    if (readoutEl) readoutEl.textContent = text;
  }

  function setAcceptedCount(count) {
    if (!countEl) return;
    const n = Math.floor(Number(count));
    if (!Number.isFinite(n) || n < 0) {
      countEl.hidden = true;
      countEl.textContent = '';
      return;
    }
    countEl.textContent = `${n.toLocaleString('en-US')} accepted`;
    countEl.hidden = false;
  }

  function setPresence(count) {
    if (!presenceEl) return;
    const n = Math.max(0, Math.floor(Number(count) || 0));
    // A quiet signal — shown only when you are not alone in the body.
    presenceEl.textContent = n >= 2 ? `${n} here now` : '';
  }

  function setContinueVisible(visible) {
    if (!continueBtn) return;
    continueBtn.hidden = !visible;
    continueBtn.disabled = !visible;
  }

  function normalizeViewMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    return mode === 'flow' || mode === 'paged' ? mode : '';
  }

  function initialViewMode() {
    const fromQuery = normalizeViewMode(params.get('view'));
    if (fromQuery) return fromQuery;
    try {
      const saved = normalizeViewMode(localStorage.getItem(VIEW_KEY));
      if (saved) return saved;
    } catch (_) {}
    return 'paged';
  }

  let viewMode = initialViewMode();
  let pageIndex = 0;
  let pageCount = 1;
  let pageStride = 0;
  let followLatestPage = true;
  let lastPagedPageIndex = 0;
  let pageSyncFrame = null;
  let forceLatestOnNextSync = true;
  let viewTransitioning = false;
  let pageTransitioning = false;
  let queuedPageIndex = null;

  function clearPageLayoutStyles() {
    if (bodyFrameEl) {
      bodyFrameEl.style.removeProperty('--bfv-page-height');
      bodyFrameEl.style.removeProperty('--bfv-page-width');
      bodyFrameEl.style.removeProperty('--bfv-page-gap');
    }
    if (bodyEl) {
      bodyEl.style.removeProperty('--bfv-page-height');
      bodyEl.style.removeProperty('--bfv-page-width');
      bodyEl.style.removeProperty('--bfv-page-gap');
      bodyEl.style.removeProperty('--bfv-page-offset');
    }
  }

  function restartMotionClass(el, className, duration = 900) {
    if (!el || reducedMotionQuery.matches) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    window.setTimeout(() => {
      el.classList.remove(className);
    }, duration);
  }

  function animateViewControls() {
    restartMotionClass(pageReadoutEl, 'is-view-motion', 420);
  }

  function updatePageControls(opts = {}) {
    const paged = viewMode === 'paged';
    if (pageControlsEl) pageControlsEl.hidden = false;
    if (pagePrevBtn) {
      pagePrevBtn.hidden = !paged;
      pagePrevBtn.disabled = !paged || pageIndex <= 0;
    }
    if (pageNextBtn) {
      pageNextBtn.hidden = !paged;
      pageNextBtn.disabled = !paged || pageIndex >= pageCount - 1;
    }
    if (pageReadoutEl) {
      pageReadoutEl.hidden = false;
      pageReadoutEl.textContent = paged ? `page ${Math.min(pageIndex + 1, pageCount)} / ${pageCount}` : 'flow';
    }
    if (viewToggleBtn) {
      const label = paged ? 'flow' : 'paged';
      viewToggleBtn.dataset.action = label;
      viewToggleBtn.textContent = `[ ${label} ]`;
      viewToggleBtn.setAttribute('aria-label', paged ? 'switch to flow view' : 'switch to paged view');
    }
  }

  function applyPageOffset() {
    if (!bodyEl || viewMode !== 'paged') return;
    bodyEl.style.setProperty('--bfv-page-offset', `${Math.max(0, pageIndex * pageStride)}px`);
    updatePageControls();
  }

  function clampPageIndex(index) {
    return Math.max(0, Math.min(pageCount - 1, Math.floor(Number(index) || 0)));
  }

  function setPageIndex(index) {
    pageIndex = clampPageIndex(index);
    followLatestPage = pageIndex >= pageCount - 1;
    if (viewMode === 'paged') lastPagedPageIndex = pageIndex;
    applyPageOffset();
  }

  async function animatePageTo(index) {
    if (viewMode !== 'paged') return;
    const target = clampPageIndex(index);
    if (target === pageIndex && !pageTransitioning) return;
    if (viewTransitioning) return;
    if (pageTransitioning) {
      queuedPageIndex = target;
      return;
    }

    pageTransitioning = true;
    queuedPageIndex = target;
    try {
      while (queuedPageIndex !== null) {
        const nextPageIndex = clampPageIndex(queuedPageIndex);
        queuedPageIndex = null;
        const previousPageIndex = pageIndex;
        if (nextPageIndex === previousPageIndex) continue;

        const runPretextPage =
          !reducedMotionQuery.matches &&
          window.CorpusTextFlow &&
          typeof window.CorpusTextFlow.transitionPage === 'function';

        if (!runPretextPage) {
          setPageIndex(nextPageIndex);
          animateViewControls();
          continue;
        }

        let changedPage = false;
        try {
          const animated = await window.CorpusTextFlow.transitionPage({
            bodyFrameEl,
            bodyEl,
            fromPageIndex: previousPageIndex,
            toPageIndex: nextPageIndex,
            pageHeight: readablePageHeight(),
            reducedMotion: reducedMotionQuery.matches,
            changePage() {
              changedPage = true;
              setPageIndex(nextPageIndex);
            },
          });
          if (!animated || !changedPage) {
            setPageIndex(nextPageIndex);
          }
        } catch (_) {
          setPageIndex(nextPageIndex);
        }
        animateViewControls();
      }
    } finally {
      pageTransitioning = false;
      queuedPageIndex = null;
    }
  }

  function pageBy(delta) {
    if (viewMode !== 'paged') return;
    animatePageTo(pageIndex + delta);
  }

  function readablePageHeight() {
    if (!bodyFrameEl || !bodyEl) return 420;
    const rect = bodyFrameEl.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight || 720;
    const lineHeight = parseFloat(getComputedStyle(bodyEl).lineHeight) || 31;
    const reserved = Math.min(260, Math.max(190, viewportHeight * 0.28));
    const raw = Math.max(lineHeight * 7, Math.min(640, viewportHeight - rect.top - reserved));
    return Math.max(lineHeight * 7, Math.floor(raw / lineHeight) * lineHeight);
  }

  function syncPageLayout(opts = {}) {
    if (viewMode !== 'paged' || !bodyFrameEl || !bodyEl) {
      clearPageLayoutStyles();
      pageIndex = 0;
      pageCount = 1;
      pageStride = 0;
      followLatestPage = true;
      updatePageControls();
      return;
    }

    // Only trust "at the last page" when pageCount is a real measurement.
    // On the first sync after entering paged mode it is still the stale 1,
    // which would otherwise force every flow->paged switch to the last page.
    const wasAtEnd = pageCount > 1 && pageIndex >= pageCount - 1;
    const shouldFollowLatest = !!opts.forceLatest || followLatestPage || wasAtEnd;
    const pageWidth = Math.max(1, Math.floor(bodyFrameEl.clientWidth));
    const pageHeight = readablePageHeight();
    pageStride = pageWidth + PAGE_GAP_PX;

    bodyFrameEl.style.setProperty('--bfv-page-height', `${pageHeight}px`);
    bodyFrameEl.style.setProperty('--bfv-page-width', `${pageWidth}px`);
    bodyFrameEl.style.setProperty('--bfv-page-gap', `${PAGE_GAP_PX}px`);
    bodyEl.style.setProperty('--bfv-page-height', `${pageHeight}px`);
    bodyEl.style.setProperty('--bfv-page-width', `${pageWidth}px`);
    bodyEl.style.setProperty('--bfv-page-gap', `${PAGE_GAP_PX}px`);

    const scrollWidth = Math.max(pageWidth, bodyEl.scrollWidth);
    pageCount = Math.max(1, Math.ceil(scrollWidth / pageStride));
    pageIndex = shouldFollowLatest ? pageCount - 1 : Math.min(pageIndex, pageCount - 1);
    followLatestPage = pageIndex >= pageCount - 1;
    lastPagedPageIndex = pageIndex;
    applyPageOffset();
  }

  function queuePageSync(opts = {}) {
    if (opts.forceLatest) forceLatestOnNextSync = true;
    if (pageSyncFrame !== null) return;
    pageSyncFrame = requestAnimationFrame(() => {
      pageSyncFrame = null;
      const forceLatest = forceLatestOnNextSync;
      forceLatestOnNextSync = false;
      syncPageLayout({ forceLatest });
    });
  }

  function setViewMode(mode, opts = {}) {
    viewMode = normalizeViewMode(mode) || 'paged';
    document.body.classList.toggle('bfv-view-paged', viewMode === 'paged');
    document.body.classList.toggle('bfv-view-flow', viewMode === 'flow');
    if (opts.persist) {
      try { localStorage.setItem(VIEW_KEY, viewMode); } catch (_) {}
    }
    if (viewMode === 'paged') {
      followLatestPage = opts.forceLatest !== false;
      updatePageControls({ animate: opts.animate });
      queuePageSync({ forceLatest: opts.forceLatest !== false });
    } else {
      clearPageLayoutStyles();
      pageIndex = 0;
      pageCount = 1;
      pageStride = 0;
      followLatestPage = true;
      updatePageControls({ animate: opts.animate });
    }
    if (opts.animate) animateViewControls();
  }

  function estimatedFlowPageIndex() {
    if (!bodyFrameEl || !bodyEl) return lastPagedPageIndex;
    const rect = bodyFrameEl.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(bodyEl).lineHeight) || 31;
    const viewportHeight = window.visualViewport?.height || window.innerHeight || 720;
    const anchorTop = Math.max(32, Math.min(132, viewportHeight * 0.14));
    const bodyTop = rect.top + window.scrollY;
    const visibleLine = Math.max(0, Math.floor((window.scrollY + anchorTop - bodyTop) / lineHeight));
    const linesPerPage = Math.max(1, Math.floor(readablePageHeight() / lineHeight));
    return Math.max(0, Math.floor(visibleLine / linesPerPage));
  }

  async function switchViewMode(nextMode, opts = {}) {
    const normalized = normalizeViewMode(nextMode) || 'paged';
    if (viewTransitioning || pageTransitioning || normalized === viewMode) return;
    const previous = viewMode;
    const targetPageIndex = previous === 'flow' ? estimatedFlowPageIndex() : pageIndex;
    const runPretextFlow =
      !reducedMotionQuery.matches &&
      window.CorpusTextFlow &&
      typeof window.CorpusTextFlow.transition === 'function';

    if (!runPretextFlow) {
      if (normalized === 'paged') {
        pageIndex = targetPageIndex;
        lastPagedPageIndex = targetPageIndex;
      }
      setViewMode(normalized, opts);
      return;
    }

    viewTransitioning = true;
    const lockedPageIndex = targetPageIndex;
    let changedLayout = false;
    try {
      const animated = await window.CorpusTextFlow.transition({
        bodyFrameEl,
        bodyEl,
        fromMode: previous,
        toMode: normalized,
        pageIndex: lockedPageIndex,
        pageHeight: readablePageHeight(),
        reducedMotion: reducedMotionQuery.matches,
        changeLayout(layout = {}) {
          changedLayout = true;
          if (normalized === 'paged') {
            pageIndex = lockedPageIndex;
            lastPagedPageIndex = lockedPageIndex;
            setViewMode(normalized, { ...opts, animate: false, forceLatest: false });
          } else {
            setViewMode(normalized, { ...opts, animate: false });
          }
          if (Number.isFinite(layout.scrollY)) {
            window.scrollTo({
              top: Math.max(0, layout.scrollY),
              left: window.scrollX,
              behavior: 'auto',
            });
          }
        },
      });
      if ((!animated || !changedLayout) && viewMode !== normalized) {
        if (normalized === 'paged') {
          pageIndex = lockedPageIndex;
          lastPagedPageIndex = lockedPageIndex;
        }
        setViewMode(normalized, opts);
      } else if (opts.animate) {
        animateViewControls();
      }
    } catch (_) {
      setViewMode(normalized, opts);
    } finally {
      viewTransitioning = false;
    }
  }

  function quotaText(quota) {
    if (!quota || typeof quota !== 'object') return '';
    const remaining = Number(quota.remaining);
    if (Number.isFinite(remaining)) {
      return ` · ${Math.max(0, remaining)} left this hour`;
    }
    return '';
  }

  function quotaRetryText(quota) {
    if (!quota || typeof quota !== 'object') return '';
    const resetAt = Number(quota.reset_at);
    if (!Number.isFinite(resetAt)) return '';
    const minutes = Math.max(1, Math.ceil((resetAt - Date.now()) / 60000));
    return ` · retry in ${minutes} min`;
  }

  let currentQuota = null;

  function updateQuota(quota) {
    currentQuota = quota && typeof quota === 'object' ? quota : currentQuota;
    return currentQuota;
  }

  function quotaRemaining(quota = currentQuota) {
    const remaining = Number(quota?.remaining);
    return Number.isFinite(remaining) ? remaining : null;
  }

  // Every state source — initial fetch, qualify response, WebSocket push, and
  // poll — funnels through here. Monotonic guards make it idempotent: a stale,
  // duplicated, or out-of-order update simply does nothing.
  let lastBodyVersion = -1;
  let lastCorruption = -1;

  function applyState(state, opts = {}) {
    if (!state || !Array.isArray(state.body)) return;
    const version = Number(state.body_version);
    const corruption = Number(state.corruption_count);
    const bodyGrew = Number.isFinite(version) && version > lastBodyVersion;
    const fringeChanged = Number.isFinite(corruption) && corruption > lastCorruption;
    if (bodyGrew || fringeChanged) {
      let newTokenIndex = null;
      if (bodyGrew) {
        newTokenIndex = typeof opts.newTokenIndex === 'number'
          ? opts.newTokenIndex
          : (typeof state.new_token_index === 'number' ? state.new_token_index : null);
        lastBodyVersion = version;
      }
      if (fringeChanged) lastCorruption = corruption;
      render(state, { newTokenIndex });
    }
    if (typeof state.presence === 'number') setPresence(state.presence);
    if (typeof state.accepted_count === 'number') setAcceptedCount(state.accepted_count);
    if (state.quota) updateQuota(state.quota);
  }

  function settleMotion(progress = 1) {
    setMotionProgress(progress);
    setMotionPhase('settled');
    setReadout('');
  }

  function blockMotion(progress = 0) {
    setMotionProgress(progress);
    setMotionPhase('blocked');
    setReadout('');
  }

  // Punctuation glyphs that hug the preceding word — no space before them.
  // "—" and "…" are space-joined instead.
  const HUG_LEFT = new Set([',', ';', ':']);

  function renderTokenContent(el, tok) {
    const spans = Array.isArray(tok?.spans) ? tok.spans : null;
    if (!spans) {
      el.textContent = tok.token;
      return;
    }
    const normalized = spans
      .map((span) => ({
        text: typeof span?.text === 'string' ? span.text : '',
        italic: span?.italic === true,
      }))
      .filter((span) => span.text.length > 0);
    if (!normalized.some((span) => span.italic) ||
        normalized.map((span) => span.text).join('') !== tok.token) {
      el.textContent = tok.token;
      return;
    }
    normalized.forEach((span) => {
      if (span.italic) {
        const em = document.createElement('em');
        em.textContent = span.text;
        el.appendChild(em);
      } else {
        el.appendChild(document.createTextNode(span.text));
      }
    });
  }

  function render(state, opts = {}) {
    if (!state || !Array.isArray(state.body)) return;
    const newIndex = typeof opts.newTokenIndex === 'number' ? opts.newTokenIndex : null;
    bodyEl.innerHTML = '';
    if (state.body.length === 0) {
      const span = document.createElement('span');
      span.className = 'fold-marker';
      span.textContent = '⟨awaiting first visit⟩';
      bodyEl.appendChild(span);
      fringeEl.textContent = typeof state.fringe === 'string' ? state.fringe : '';
      queuePageSync({ forceLatest: true });
      return;
    }
    state.body.forEach((tok, i) => {
      // Punctuation that clings to the previous word takes no leading space.
      if (i > 0 && !HUG_LEFT.has(tok.token)) {
        bodyEl.appendChild(document.createTextNode(' '));
      }
      const span = document.createElement('span');
      if (tok.role === 'fold_marker') {
        span.className = 'fold-marker';
      }
      if (i === newIndex) {
        span.classList.add('token-new');
      }
      renderTokenContent(span, tok);
      bodyEl.appendChild(span);
    });
    fringeEl.textContent = typeof state.fringe === 'string' ? state.fringe : '';
    queuePageSync();
  }

  function quotaExhausted(state) {
    const remaining = quotaRemaining(state?.quota);
    return remaining !== null && remaining <= 0;
  }

  function localFixtureAllowed() {
    return location.protocol === 'file:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1' ||
      location.hostname === '::1';
  }

  function fixtureRandom(seed) {
    let h = 2166136261;
    const text = String(seed || 'layout');
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += 0x6d2b79f5;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fixtureChoice(rng, items) {
    return items[Math.floor(rng() * items.length) % items.length];
  }

  function fixtureToken(token, index, rng) {
    const tok = {
      token,
      role: HUG_LEFT.has(token) || token === '—' ? 'punctuation' : 'fixture',
      event_id: `fixture-${String(index).padStart(5, '0')}`,
      ts: 1893456000000 + index,
    };
    if (tok.role !== 'punctuation' && index % 41 === 17 && rng() > 0.25) {
      tok.spans = [{ text: token, italic: true }];
    }
    return tok;
  }

  function buildFixtureState() {
    const mode = (params.get('fixture') || '').trim().toLowerCase();
    if (!mode) return null;
    if (!localFixtureAllowed()) return null;

    const rawCount = Number(params.get('tokens') || params.get('units') || 800);
    const count = Math.max(1, Math.min(5000, Number.isFinite(rawCount) ? Math.floor(rawCount) : 800));
    const seed = params.get('seed') || mode || 'layout';
    const rng = fixtureRandom(seed);
    const starts = [
      'in a municipal corridor', 'beneath the archive table', 'after the elevator stalled',
      'where the river met the service road', 'inside a room of borrowed chairs',
      'along the unfinished concourse', 'under an awning of registration forms',
      'beside the warehouse windows',
    ];
    const subjects = [
      'the clerk', 'a weathered ledger', 'the freight elevator', 'every receipt',
      'the neighborhood committee', 'a stack of permits', 'the old transformer',
      'some patient machinery', 'the inspection report', 'a temporary sign',
    ];
    const verbs = [
      'kept', 'misread', 'translated', 'delayed', 'remembered', 'classified',
      'folded', 'withheld', 'measured', 'revised', 'indexed', 'returned',
    ];
    const objects = [
      'a smaller version of the city', 'the shape of an earlier mistake',
      'three rooms of fluorescent certainty', 'a promise of completion',
      'the sound of paper becoming policy', 'a diagram no one trusted',
      'the corridor between evidence and rumor', 'a map of authorized waiting',
      'the useful part of the silence', 'one more unfinished explanation',
    ];
    const tails = [
      'with unusual care', 'as if the building had asked', 'before the hour changed',
      'without naming the problem', 'inside the same sentence', 'for no audience in particular',
      'while the windows kept their count', 'under a weak but persistent light',
      'until the record softened', 'near the edge of the page',
    ];
    const punctuation = [',', ';', ':', '—'];

    const body = [];
    while (body.length < count) {
      const index = body.length;
      let token;
      if (index > 0 && index % 19 === 0) {
        token = fixtureChoice(rng, punctuation);
      } else if (index % 11 === 0) {
        token = fixtureChoice(rng, starts);
      } else if (index % 11 === 1 || index % 11 === 5) {
        token = fixtureChoice(rng, subjects);
      } else if (index % 11 === 2 || index % 11 === 6) {
        token = fixtureChoice(rng, verbs);
      } else if (index % 11 === 3 || index % 11 === 7) {
        token = fixtureChoice(rng, objects);
      } else {
        token = fixtureChoice(rng, tails);
      }
      body.push(fixtureToken(token, index, rng));
    }

    return {
      body,
      body_version: body.length,
      accepted_count: body.length,
      corruption_count: 0,
      fringe: '',
      presence: 1,
      fixture: { mode, seed, tokens: body.length },
    };
  }

  async function fetchState(opts = {}) {
    try {
      const scoped = !!opts.sessionScoped;
      const resp = await fetch(`${API_BASE}/api/corpus/state`, scoped ? {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId() }),
      } : { credentials: 'omit' });
      if (!resp.ok) throw new Error(`state http ${resp.status}`);
      const json = await resp.json();
      applyState(json);
      return json;
    } catch (err) {
      // Only show the failure marker if nothing has rendered yet — the
      // WebSocket may already have delivered the body.
      if (lastBodyVersion < 0) {
        bodyEl.innerHTML = '';
        const span = document.createElement('span');
        span.className = 'fold-marker';
        span.textContent = '⟨body unavailable⟩';
        bodyEl.appendChild(span);
        queuePageSync({ forceLatest: true });
      }
      blockMotion(0);
      setStatus('upstream unreachable');
      if (lastBodyVersion < 0) setAcceptedCount(null);
      setContinueVisible(false);
      return null;
    }
  }

  function sessionId() {
    let id = null;
    try { id = sessionStorage.getItem(SESSION_KEY); } catch (_) { id = null; }
    if (id) return id;
    try {
      id = crypto.randomUUID();
    } catch (_) {
      id = 'sess-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
    }
    try { sessionStorage.setItem(SESSION_KEY, id); } catch (_) {}
    return id;
  }

  function newVisitId() {
    try {
      return crypto.randomUUID();
    } catch (_) {
      return 'visit-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
    }
  }

  function activeVisitId() {
    const now = Date.now();
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(VISIT_KEY) || 'null');
    } catch (_) {
      saved = null;
    }
    if (saved &&
        typeof saved.id === 'string' &&
        VISIT_ID_RE.test(saved.id) &&
        now - Number(saved.startedAt || 0) < VISIT_TTL_MS) {
      return saved.id;
    }
    const next = { id: newVisitId(), startedAt: now };
    try { sessionStorage.setItem(VISIT_KEY, JSON.stringify(next)); } catch (_) {}
    return next.id;
  }

  function clearVisitId(id) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(VISIT_KEY) || 'null');
      if (!saved || saved.id === id) sessionStorage.removeItem(VISIT_KEY);
    } catch (_) {
      try { sessionStorage.removeItem(VISIT_KEY); } catch (_) {}
    }
  }

  let qualifying = false;

  async function qualify() {
    if (qualifying) return null;
    qualifying = true;
    const sid = sessionId();
    const vid = activeVisitId();
    setContinueVisible(false);
    setMotionProgress(1);
    setMotionPhase('qualifying');
    setReadout('');
    try {
      // visible_ms is the attention signal the model weights its learning by.
      const visibleMs = Math.max(0, Math.min(600000, Math.round(visibleElapsedMs())));
      const resp = await fetch(`${API_BASE}/api/corpus/qualify`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sid, visible_ms: visibleMs, visit_id: vid }),
      });
      if (resp.status === 429) {
        clearVisitId(vid);
        blockMotion();
        setStatus('rate-limited');
        setContinueVisible(false);
        return null;
      }
      if (!resp.ok) {
        let error = null;
        try { error = await resp.json(); } catch (_) { error = null; }
        blockMotion();
        if (error && error.error === 'generator_unavailable') {
          applyState(error);
          setStatus('voice unavailable · try again');
        } else {
          setStatus('upstream silent');
        }
        setContinueVisible(false);
        return null;
      }
      const json = await resp.json();
      updateQuota(json.quota);
      if (json.skipped === 'cooldown') {
        clearVisitId(vid);
        blockMotion();
        setStatus(`visit withheld · hourly quota reached${quotaRetryText(json.quota)}`);
        applyState(json);
        setContinueVisible(false);
        return json;
      }
      if (json.skipped === 'bot') {
        clearVisitId(vid);
        blockMotion();
        setStatus('machine mark withheld · deposited to fringe');
        applyState(json);
        setContinueVisible(false);
        return json;
      }
      if (json.skipped === 'duplicate') {
        clearVisitId(vid);
        applyState(json);
        settleMotion();
        setStatus(`visible visit already counted${quotaText(json.quota)}`);
        const remaining = quotaRemaining(json.quota);
        setContinueVisible(remaining === null || remaining > 0);
        return json;
      }
      clearVisitId(vid);
      applyState(json, { newTokenIndex: json.new_token_index });
      const folded = Number(json.fold_count || 0);
      const suffix = folded > 0 ? ` · ${folded} folded` : '';
      settleMotion();
      setStatus(`visible visit qualified${suffix}${quotaText(json.quota)}`);
      const remaining = quotaRemaining(json.quota);
      setContinueVisible(remaining === null || remaining > 0);
      return json;
    } catch (err) {
      blockMotion();
      setStatus('upstream unreachable');
      setContinueVisible(false);
      return null;
    } finally {
      qualifying = false;
    }
  }

  // Track cumulative *visible* time. We only count time while the page is the
  // visible foreground document; tab-switching pauses the dwell clock.
  let accepting = false;
  let cumulativeVisibleMs = 0;
  let lastVisibleStart = null;
  let frame = null;
  let dwellTimeout = null;

  function nowMs() { return performance.now(); }

  function visibleElapsedMs() {
    let visible = cumulativeVisibleMs;
    if (lastVisibleStart !== null) visible += nowMs() - lastVisibleStart;
    return visible;
  }

  function stopDwellTimer() {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    if (dwellTimeout) {
      clearTimeout(dwellTimeout);
      dwellTimeout = null;
    }
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      if (lastVisibleStart === null) lastVisibleStart = nowMs();
    } else {
      if (lastVisibleStart !== null) {
        cumulativeVisibleMs += nowMs() - lastVisibleStart;
        lastVisibleStart = null;
      }
    }
  }

  function tick() {
    if (!accepting) return;
    const visible = visibleElapsedMs();
    setMotionProgress(Math.min(visible / DWELL_MS, 1));
    setReadout((Math.min(visible, DWELL_MS) / 1000).toFixed(1) + ' s');
    if (visible >= DWELL_MS && document.visibilityState === 'visible') {
      accepting = false;
      stopDwellTimer();
      qualify();
      return;
    }
  }

  function queueTick() {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      tick();
      if (accepting && dwellTimeout) queueTick();
    });
  }

  function startVisibleDwell() {
    setContinueVisible(false);
    accepting = true;
    cumulativeVisibleMs = 0;
    lastVisibleStart = document.visibilityState === 'visible' ? nowMs() : null;
    setMotionProgress(0);
    setMotionPhase('accepting');
    setStatus('accepting visible visit');
    setReadout('0.0 s');
    document.addEventListener('visibilitychange', onVisibilityChange);
    // bound the dwell wait so we don't churn forever on a backgrounded tab
    dwellTimeout = setTimeout(() => {
      if (accepting) {
        accepting = false;
        stopDwellTimer();
        settleMotion(Math.min(visibleElapsedMs() / DWELL_MS, 1));
        setStatus('accepting paused');
        setContinueVisible(true);
      }
    }, 5 * 60 * 1000);
    queueTick();
  }

  async function continueVisibleVisit() {
    if (accepting || qualifying) return;
    setContinueVisible(false);
    setMotionProgress(0);
    setMotionPhase('loading');
    setStatus('checking session');
    const state = await fetchState({ sessionScoped: true });
    if (!state) return;
    if (quotaExhausted(state)) {
      blockMotion();
      setStatus(`visit withheld · hourly quota reached${quotaRetryText(state.quota)}`);
      setContinueVisible(false);
      return;
    }
    await qualify();
  }

  if (continueBtn) {
    continueBtn.addEventListener('click', continueVisibleVisit);
  }

  if (pagePrevBtn) pagePrevBtn.addEventListener('click', () => pageBy(-1));
  if (pageNextBtn) pageNextBtn.addEventListener('click', () => pageBy(1));
  if (viewToggleBtn) {
    viewToggleBtn.addEventListener('click', () => {
      switchViewMode(viewMode === 'paged' ? 'flow' : 'paged', {
        persist: true,
        forceLatest: true,
        animate: true,
      });
    });
  }

  function editableKeyTarget(target) {
    if (!(target instanceof Element)) return false;
    const tag = target.tagName.toLowerCase();
    return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  document.addEventListener('keydown', (e) => {
    if (viewMode !== 'paged' || colophonDlg?.open || editableKeyTarget(e.target)) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      pageBy(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      pageBy(1);
    }
  });

  window.addEventListener('resize', () => queuePageSync());
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => queuePageSync());
  }
  if (bodyFrameEl && 'ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(() => queuePageSync());
    resizeObserver.observe(bodyFrameEl);
  }
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => queuePageSync({ forceLatest: true })).catch(() => {});
  }
  setViewMode(viewMode, { forceLatest: true });

  const fixtureState = buildFixtureState();
  if (fixtureState) {
    applyState(fixtureState);
    settleMotion(1);
    setStatus(`fixture · ${fixtureState.body.length.toLocaleString('en-US')} tokens · seed ${fixtureState.fixture.seed}`);
    setContinueVisible(false);
    return;
  }

  // ── live updates ──────────────────────────────────────────────────────────
  // The body is shared: other visitors mutate it while this page is open. A
  // WebSocket pushes every change instantly; if it cannot connect, polling
  // takes over so the page still auto-updates. The DO sends a full snapshot on
  // every (re)connect, so a disconnect can never drop a token.
  const WS_URL = (() => {
    try {
      const u = new URL(`${API_BASE}/api/corpus/socket`);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return u.toString();
    } catch (_) {
      return null;
    }
  })();

  let socket = null;
  let socketPing = null;
  let reconnectTimer = null;
  let reconnectDelay = 800;
  let socketFailures = 0;
  const RECONNECT_MAX_MS = 15000;

  let polling = false;
  let pollTimer = null;
  const POLL_VISIBLE_MS = 6000;
  const POLL_HIDDEN_MS = 30000;

  async function pollOnce() {
    try {
      const resp = await fetch(`${API_BASE}/api/corpus/state`, { credentials: 'omit' });
      if (resp.ok) applyState(await resp.json());
    } catch (_) {}
  }

  function queuePoll() {
    if (!polling) return;
    const delay = document.visibilityState === 'hidden' ? POLL_HIDDEN_MS : POLL_VISIBLE_MS;
    pollTimer = setTimeout(async () => {
      pollTimer = null;
      if (!polling) return;
      await pollOnce();
      queuePoll();
    }, delay);
  }

  function startPolling() {
    if (polling) return;
    polling = true;
    queuePoll();
  }

  function stopPolling() {
    polling = false;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectSocket();
    }, reconnectDelay);
    reconnectDelay = Math.min(Math.round(reconnectDelay * 1.7), RECONNECT_MAX_MS);
  }

  function connectSocket() {
    if (!WS_URL) { startPolling(); return; }
    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch (_) {
      socketFailures += 1;
      if (socketFailures >= 2) startPolling();
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.addEventListener('open', () => {
      reconnectDelay = 800;
      socketFailures = 0;
      stopPolling();
      if (socketPing) clearInterval(socketPing);
      socketPing = setInterval(() => {
        try { if (ws.readyState === 1) ws.send('ping'); } catch (_) {}
      }, 30000);
    });
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      applyState(msg);
    });
    ws.addEventListener('close', () => {
      if (socketPing) { clearInterval(socketPing); socketPing = null; }
      if (socket === ws) socket = null;
      socketFailures += 1;
      if (socketFailures >= 2) startPolling();
      scheduleReconnect();
    });
    ws.addEventListener('error', () => {
      try { ws.close(); } catch (_) {}
    });
  }

  // When the tab returns to the foreground during a polling fallback, refresh
  // immediately rather than waiting out the interval.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && polling) pollOnce();
  });

  setMotionProgress(0);
  setMotionPhase('loading');
  setStatus('loading body');
  setAcceptedCount(null);
  setContinueVisible(false);
  connectSocket();
  fetchState({ sessionScoped: true }).then((state) => {
    if (!state) return;
    if (quotaExhausted(state)) {
      blockMotion();
      setStatus(`visit withheld · hourly quota reached${quotaRetryText(state.quota)}`);
      setContinueVisible(false);
      return;
    }
    startVisibleDwell();
  });
})();
