(() => {
  'use strict';

  // The work mutates only when a visit is *visible* for at least DWELL_MS and
  // the same browser session still has quota in the server-side rolling window.
  const PROD_API = 'https://seb-feed.cbassuarez.workers.dev';
  const params = new URLSearchParams(location.search);
  const API_BASE = (params.get('api') || PROD_API).replace(/\/+$/, '');

  const DWELL_MS = 2000;
  const SESSION_KEY = 'bfv:session-v1';

  const bodyEl = document.getElementById('bfv-body');
  const fringeEl = document.getElementById('bfv-fringe');
  const statusEl = document.getElementById('bfv-status');
  const motionRoot = document.getElementById('bfv-motion-root');
  const readoutEl = document.getElementById('bfv-readout');
  const countEl = document.getElementById('bfv-count');
  const presenceEl = document.getElementById('bfv-presence');
  const continueBtn = document.getElementById('bfv-continue');

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
  const HUG_LEFT = new Set(['.', ',', ';']);

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
      span.textContent = tok.token;
      bodyEl.appendChild(span);
    });
    fringeEl.textContent = typeof state.fringe === 'string' ? state.fringe : '';
  }

  function quotaExhausted(state) {
    const remaining = quotaRemaining(state?.quota);
    return remaining !== null && remaining <= 0;
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
      }
      settleMotion(0);
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

  async function qualify() {
    const sid = sessionId();
    setContinueVisible(false);
    setMotionProgress(1);
    setMotionPhase('qualifying');
    setReadout('');
    try {
      const resp = await fetch(`${API_BASE}/api/corpus/qualify`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sid }),
      });
      if (resp.status === 429) {
        blockMotion();
        setStatus('rate-limited');
        setContinueVisible(false);
        return;
      }
      if (!resp.ok) {
        blockMotion();
        setStatus('upstream silent');
        setContinueVisible(false);
        return;
      }
      const json = await resp.json();
      updateQuota(json.quota);
      if (json.skipped === 'cooldown') {
        blockMotion();
        setStatus(`visit withheld · hourly quota reached${quotaRetryText(json.quota)}`);
        applyState(json);
        setContinueVisible(false);
        return;
      }
      if (json.skipped === 'bot') {
        blockMotion();
        setStatus('machine mark withheld · deposited to fringe');
        applyState(json);
        setContinueVisible(false);
        return;
      }
      applyState(json, { newTokenIndex: json.new_token_index });
      const folded = Number(json.fold_count || 0);
      const suffix = folded > 0 ? ` · ${folded} folded` : '';
      settleMotion();
      setStatus(`visible visit qualified${suffix}${quotaText(json.quota)}`);
      const remaining = quotaRemaining(json.quota);
      setContinueVisible(remaining === null || remaining > 0);
    } catch (err) {
      blockMotion();
      setStatus('upstream unreachable');
      setContinueVisible(false);
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
    if (accepting) return;
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
    startVisibleDwell();
  }

  if (continueBtn) {
    continueBtn.addEventListener('click', continueVisibleVisit);
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
