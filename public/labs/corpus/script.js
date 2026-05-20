(() => {
  'use strict';

  // The work mutates only when a visit is *visible* for at least DWELL_MS and
  // the same browser session has not contributed within the server cooldown.
  const PROD_API = 'https://seb-feed.cbassuarez.workers.dev';
  const params = new URLSearchParams(location.search);
  const API_BASE = (params.get('api') || PROD_API).replace(/\/+$/, '');

  const DWELL_MS = 2000;
  const SESSION_KEY = 'bfv:session-v1';
  const ATTEMPTED_KEY = 'bfv:attempted-v1';

  const bodyEl = document.getElementById('bfv-body');
  const fringeEl = document.getElementById('bfv-fringe');
  const statusEl = document.getElementById('bfv-status');
  const motionRoot = document.getElementById('bfv-motion-root');

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

  function settleMotion(progress = 1) {
    setMotionProgress(progress);
    setMotionPhase('settled');
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
      return;
    }
    state.body.forEach((tok, i) => {
      const span = document.createElement('span');
      if (tok.role === 'fold_marker') {
        span.className = 'fold-marker';
      }
      if (i === newIndex) {
        span.classList.add('token-new');
      }
      span.textContent = tok.token;
      bodyEl.appendChild(span);
      if (i < state.body.length - 1) {
        bodyEl.appendChild(document.createTextNode(' '));
      }
    });
    fringeEl.textContent = typeof state.fringe === 'string' ? state.fringe : '';
  }

  async function fetchState() {
    try {
      const resp = await fetch(`${API_BASE}/api/corpus/state`, { credentials: 'omit' });
      if (!resp.ok) throw new Error(`state http ${resp.status}`);
      const json = await resp.json();
      render(json);
      return json;
    } catch (err) {
      settleMotion(0);
      setStatus('upstream unreachable');
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

  async function qualify() {
    const sid = sessionId();
    setMotionProgress(1);
    setMotionPhase('qualifying');
    try {
      const resp = await fetch(`${API_BASE}/api/corpus/qualify`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sid }),
      });
      if (resp.status === 429) {
        settleMotion();
        setStatus('rate-limited');
        return;
      }
      if (!resp.ok) {
        settleMotion();
        setStatus('upstream silent');
        return;
      }
      const json = await resp.json();
      if (json.skipped === 'cooldown') {
        settleMotion();
        setStatus('visit withheld · session already recorded');
        render(json);
        return;
      }
      if (json.skipped === 'bot') {
        settleMotion();
        setStatus('machine mark withheld · deposited to fringe');
        render(json);
        return;
      }
      render(json, { newTokenIndex: json.new_token_index });
      const folded = Number(json.fold_count || 0);
      const suffix = folded > 0 ? ` · ${folded} folded` : '';
      settleMotion();
      setStatus(`visible visit qualified${suffix}`);
    } catch (err) {
      settleMotion();
      setStatus('upstream unreachable');
    }
  }

  // Track cumulative *visible* time. We only count time while the page is the
  // visible foreground document; tab-switching pauses the dwell clock.
  let attempted = false;
  try { attempted = sessionStorage.getItem(ATTEMPTED_KEY) === '1'; } catch (_) {}
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
    if (attempted) return;
    const visible = visibleElapsedMs();
    setMotionProgress(Math.min(visible / DWELL_MS, 1));
    if (visible >= DWELL_MS && document.visibilityState === 'visible') {
      attempted = true;
      try { sessionStorage.setItem(ATTEMPTED_KEY, '1'); } catch (_) {}
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
      if (!attempted && dwellTimeout) queueTick();
    });
  }

  function startVisibleDwell() {
    cumulativeVisibleMs = 0;
    lastVisibleStart = document.visibilityState === 'visible' ? nowMs() : null;
    setMotionProgress(0);
    setMotionPhase('accepting');
    setStatus('accepting visible visit');
    document.addEventListener('visibilitychange', onVisibilityChange);
    // bound the dwell wait so we don't churn forever on a backgrounded tab
    dwellTimeout = setTimeout(() => {
      if (!attempted) {
        stopDwellTimer();
        settleMotion(Math.min(visibleElapsedMs() / DWELL_MS, 1));
        setStatus('accepting paused · reload to try again');
      }
    }, 5 * 60 * 1000);
    queueTick();
  }

  setMotionProgress(0);
  setMotionPhase('loading');
  setStatus('loading body');
  fetchState().then((state) => {
    if (!state) return;
    if (attempted) {
      settleMotion();
      setStatus('visit withheld · session already recorded');
      return;
    }
    startVisibleDwell();
  });
})();
