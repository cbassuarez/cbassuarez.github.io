import { useEffect, useRef, useState } from 'react';
import { fetchTmaydStatus, getApiBase } from './tmaydApi';
import { loadTurnstileScript, resetTurnstileScriptCache } from './TmaydSubmissionForm';

const TURNSTILE_TOKEN_TIMEOUT_MS = 15000;

const CHECK_DEFS = [
  { id: 'browser', label: 'Browser environment ready' },
  { id: 'apiBase', label: 'API base URL configured' },
  { id: 'status', label: '/api/tmayd/status reachable' },
  { id: 'intake', label: 'Intake currently open' },
  { id: 'siteKey', label: 'Turnstile site key configured' },
  { id: 'script', label: 'Turnstile script loads' },
  { id: 'widget', label: 'Turnstile widget produces a token' }
];

function initialChecks() {
  return CHECK_DEFS.map((def) => ({ ...def, state: 'pending', detail: '' }));
}

export default function TmaydPreflight() {
  const [checks, setChecks] = useState(initialChecks);
  const [runCount, setRunCount] = useState(0);
  const [running, setRunning] = useState(false);
  const widgetIdRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    function update(id, patch) {
      if (cancelled) return;
      setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    }

    async function run() {
      setRunning(true);

      // browser
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        update('browser', { state: 'fail', detail: 'No window/document available.' });
        setRunning(false);
        return;
      }
      const online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
      update('browser', {
        state: online ? 'ok' : 'warn',
        detail: online ? '' : 'navigator.onLine reports offline.'
      });

      // apiBase
      const apiBase = getApiBase();
      if (!apiBase) {
        update('apiBase', { state: 'fail', detail: 'VITE_TMYD_API_BASE is not set.' });
      } else {
        update('apiBase', { state: 'ok', detail: apiBase });
      }

      // status endpoint
      const statusResult = await fetchTmaydStatus();
      if (!statusResult.ok) {
        update('status', { state: 'fail', detail: `errorKind: ${statusResult.errorKind || 'unknown'}` });
        update('intake', { state: 'fail', detail: 'Skipped: status endpoint unavailable.' });
      } else {
        const apparatusStatus = statusResult.data?.status || 'unknown';
        const note = statusResult.mock ? 'mock data (no API configured)' : `status=${apparatusStatus}`;
        update('status', { state: statusResult.mock ? 'warn' : 'ok', detail: note });
        if (statusResult.data?.intakeOpen) {
          update('intake', { state: 'ok', detail: '' });
        } else {
          update('intake', {
            state: 'fail',
            detail: statusResult.data?.message || 'intakeOpen=false'
          });
        }
      }

      // siteKey
      const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
      if (!siteKey) {
        update('siteKey', { state: 'fail', detail: 'VITE_TURNSTILE_SITE_KEY is not set.' });
        update('script', { state: 'fail', detail: 'Skipped: no site key.' });
        update('widget', { state: 'fail', detail: 'Skipped: no site key.' });
        setRunning(false);
        return;
      }
      update('siteKey', { state: 'ok', detail: `${siteKey.slice(0, 8)}…` });

      // script
      resetTurnstileScriptCache();
      let turnstile = null;
      try {
        turnstile = await loadTurnstileScript();
      } catch (err) {
        update('script', { state: 'fail', detail: err?.message || 'load failed' });
        update('widget', { state: 'fail', detail: 'Skipped: script did not load.' });
        setRunning(false);
        return;
      }
      if (!turnstile) {
        update('script', { state: 'fail', detail: 'window.turnstile missing after load.' });
        update('widget', { state: 'fail', detail: 'Skipped: turnstile global unavailable.' });
        setRunning(false);
        return;
      }
      update('script', { state: 'ok', detail: '' });

      // widget render + token
      if (!containerRef.current) {
        update('widget', { state: 'fail', detail: 'No container element.' });
        setRunning(false);
        return;
      }

      const tokenPromise = new Promise((resolve) => {
        let settled = false;
        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve({ ok: false, detail: `No token within ${TURNSTILE_TOKEN_TIMEOUT_MS}ms.` });
        }, TURNSTILE_TOKEN_TIMEOUT_MS);
        try {
          widgetIdRef.current = turnstile.render(containerRef.current, {
            sitekey: siteKey,
            appearance: 'always',
            callback: (token) => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timer);
              resolve({ ok: Boolean(token), detail: token ? `token len=${token.length}` : 'empty token' });
            },
            'error-callback': () => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timer);
              resolve({ ok: false, detail: 'error-callback fired.' });
            },
            'timeout-callback': () => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timer);
              resolve({ ok: false, detail: 'timeout-callback fired.' });
            }
          });
        } catch (err) {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve({ ok: false, detail: err?.message || 'render threw' });
        }
      });

      const widgetResult = await tokenPromise;
      if (cancelled) return;
      update('widget', {
        state: widgetResult.ok ? 'ok' : 'fail',
        detail: widgetResult.detail
      });
      setRunning(false);
    }

    run();

    return () => {
      cancelled = true;
      try {
        if (widgetIdRef.current && typeof window !== 'undefined' && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch {
        // best effort
      }
      widgetIdRef.current = null;
    };
  }, [runCount]);

  const total = checks.length;
  const passed = checks.filter((c) => c.state === 'ok').length;
  const failed = checks.filter((c) => c.state === 'fail').length;
  const allDone = !running && checks.every((c) => c.state !== 'pending');
  const overall = !allDone
    ? 'running'
    : failed === 0
      ? 'all checks passed'
      : `${failed} of ${total} failed`;

  function rerun() {
    resetTurnstileScriptCache();
    try {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    } catch {
      // best effort
    }
    widgetIdRef.current = null;
    setChecks(initialChecks());
    setRunCount((n) => n + 1);
  }

  function symbol(state) {
    if (state === 'ok') return '[OK]';
    if (state === 'fail') return '[FAIL]';
    if (state === 'warn') return '[WARN]';
    return '[...]';
  }

  const overallTone =
    !allDone ? '' : failed === 0 ? 'tmayd-tag--ok' : 'tmayd-tag--warn';

  return (
    <section aria-label="Pre-flight checks">
      <div className="tmayd-section-label">Pre-flight</div>
      <p className="tmayd-copy">
        Live check of the submission path. Run before doors open. No messages are submitted.
      </p>
      <p>
        <span className="tmayd-mono" style={{ fontSize: '0.84rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          result · {overall} ({passed}/{total})
        </span>
        {overallTone ? <span className={`tmayd-tag ${overallTone}`}>{failed === 0 ? 'pass' : 'fail'}</span> : null}
        {' '}
        <button
          type="button"
          className="tmayd-button tmayd-button--ghost"
          onClick={rerun}
          disabled={running}
        >
          rerun checks
        </button>
      </p>
      <ul className="tmayd-checks">
        {checks.map((check) => (
          <li key={check.id}>
            <span className={`tmayd-checks__symbol tmayd-checks__symbol--${check.state}`}>
              {symbol(check.state)}
            </span>
            <span className="tmayd-checks__label">{check.label}</span>
            {check.detail ? (
              <span className="tmayd-checks__detail">— {check.detail}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="tmayd-section-label" style={{ marginTop: 18 }}>
        Live token render
      </div>
      <div
        ref={containerRef}
        aria-label="Verification widget (preflight)"
        style={{ marginTop: 8 }}
      />
    </section>
  );
}
