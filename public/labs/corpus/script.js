(() => {
  'use strict';

  // The work mutates only when a visit is *visible* for at least DWELL_MS and
  // the same browser session has not contributed within the server cooldown.
  const PROD_API = 'https://seb-feed.cbassuarez.workers.dev';
  const params = new URLSearchParams(location.search);
  const API_BASE = (params.get('api') || PROD_API).replace(/\/+$/, '');

  const DWELL_MS = 2000;
  const PULSE_INTERVAL_MS = 450;
  const PULSE_FRAMES = ['', ' ·', ' ··', ' ···'];
  const SESSION_KEY = 'bfv:session-v1';
  const ATTEMPTED_KEY = 'bfv:attempted-v1';

  const bodyEl = document.getElementById('bfv-body');
  const fringeEl = document.getElementById('bfv-fringe');
  const statusEl = document.getElementById('bfv-status');

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

  let statusPulseTimer = null;
  let statusPulseFrame = 0;

  function writeStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function stopStatusPulse() {
    if (statusPulseTimer) {
      clearInterval(statusPulseTimer);
      statusPulseTimer = null;
    }
    statusPulseFrame = 0;
  }

  function setStatus(text) {
    stopStatusPulse();
    writeStatus(text);
  }

  function startStatusPulse(text) {
    stopStatusPulse();
    writeStatus(text);
    statusPulseTimer = setInterval(() => {
      statusPulseFrame = (statusPulseFrame + 1) % PULSE_FRAMES.length;
      writeStatus(`${text}${PULSE_FRAMES[statusPulseFrame]}`);
    }, PULSE_INTERVAL_MS);
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
    try {
      const resp = await fetch(`${API_BASE}/api/corpus/qualify`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sid }),
      });
      if (resp.status === 429) {
        setStatus('rate-limited');
        return;
      }
      if (!resp.ok) {
        setStatus('upstream silent');
        return;
      }
      const json = await resp.json();
      if (json.skipped === 'cooldown') {
        setStatus('visit withheld · session already recorded');
        render(json);
        return;
      }
      if (json.skipped === 'bot') {
        setStatus('machine mark withheld · deposited to fringe');
        render(json);
        return;
      }
      render(json, { newTokenIndex: json.new_token_index });
      const folded = Number(json.fold_count || 0);
      const suffix = folded > 0 ? ` · ${folded} folded` : '';
      setStatus(`visible visit qualified${suffix}`);
    } catch (err) {
      setStatus('upstream unreachable');
    }
  }

  // Track cumulative *visible* time. We only count time while the page is the
  // visible foreground document; tab-switching pauses the dwell clock.
  let attempted = false;
  try { attempted = sessionStorage.getItem(ATTEMPTED_KEY) === '1'; } catch (_) {}
  let cumulativeVisibleMs = 0;
  let lastVisibleStart = null;
  let timer = null;
  let dwellTimeout = null;

  function nowMs() { return performance.now(); }

  function stopDwellTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
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
    let visible = cumulativeVisibleMs;
    if (lastVisibleStart !== null) visible += nowMs() - lastVisibleStart;
    if (visible >= DWELL_MS && document.visibilityState === 'visible') {
      attempted = true;
      try { sessionStorage.setItem(ATTEMPTED_KEY, '1'); } catch (_) {}
      stopDwellTimer();
      qualify();
      return;
    }
  }

  function startVisibleDwell() {
    cumulativeVisibleMs = 0;
    lastVisibleStart = document.visibilityState === 'visible' ? nowMs() : null;
    startStatusPulse('accepting visible visit');
    document.addEventListener('visibilitychange', onVisibilityChange);
    timer = setInterval(tick, 250);
    // bound the dwell wait so we don't churn forever on a backgrounded tab
    dwellTimeout = setTimeout(() => {
      if (timer && !attempted) {
        stopDwellTimer();
        setStatus('accepting paused · reload to try again');
      }
    }, 5 * 60 * 1000);
    tick();
  }

  startStatusPulse('loading body');
  fetchState().then((state) => {
    if (!state) return;
    if (attempted) {
      setStatus('visit withheld · session already recorded');
      return;
    }
    startVisibleDwell();
  });
})();
