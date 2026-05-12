import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { submitTmaydMessage } from './tmaydApi';

const MAX_CHARS = 700;
const MIN_CHARS = 3;
const URL_PATTERN = /(https?:\/\/|www\.)/i;

const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SCRIPT_TIMEOUT_MS = 8000;

let turnstileScriptPromise = null;

export function resetTurnstileScriptCache() {
  turnstileScriptPromise = null;
}

export function loadTurnstileScript() {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }
  const promise = new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('turnstile_script_timeout'));
    }, TURNSTILE_SCRIPT_TIMEOUT_MS);

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn(value);
    };
    const onSuccess = () => finish(resolve, window.turnstile || null);
    const onFail = () => finish(reject, new Error('turnstile_script_failed'));

    const existing = document.querySelector(`script[src^="${TURNSTILE_SCRIPT_SRC.split('?')[0]}"]`);
    if (existing) {
      existing.addEventListener('load', onSuccess);
      existing.addEventListener('error', onFail);
      return;
    }
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = onSuccess;
    script.onerror = onFail;
    document.head.appendChild(script);
  }).catch((err) => {
    turnstileScriptPromise = null;
    throw err;
  });
  turnstileScriptPromise = promise;
  return promise;
}

export default function TmaydSubmissionForm({ intakeOpen = true, statusMessage = '' }) {
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState({ tone: 'neutral', message: '' });
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileError, setTurnstileError] = useState('');
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const tokenRef = useRef('');
  const containerDomId = useId().replace(/[:]/g, '_') + '_turnstile';

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

  function retryTurnstile() {
    try {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    } catch {
      // best effort
    }
    widgetIdRef.current = null;
    tokenRef.current = '';
    setTurnstileReady(false);
    setTurnstileError('');
    resetTurnstileScriptCache();
    setTurnstileAttempt((n) => n + 1);
  }

  useEffect(() => {
    let cancelled = false;
    if (!siteKey) {
      setTurnstileReady(true); // dev/mock mode — server may also bypass
      return () => {};
    }
    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !turnstile || !containerRef.current) return;
        try {
          widgetIdRef.current = turnstile.render(containerRef.current, {
            sitekey: siteKey,
            appearance: 'always',
            callback: (token) => {
              tokenRef.current = token || '';
              setTurnstileReady(true);
              setTurnstileError('');
            },
            'expired-callback': () => {
              tokenRef.current = '';
              setTurnstileReady(false);
            },
            'error-callback': () => {
              setTurnstileReady(false);
              setTurnstileError('Verification widget failed to load.');
            },
            'timeout-callback': () => {
              setTurnstileReady(false);
              setTurnstileError('Verification timed out. Please retry.');
            }
          });
        } catch {
          setTurnstileError('Verification widget failed to load.');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setTurnstileError('Verification widget failed to load.');
      });
    return () => {
      cancelled = true;
      try {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch {
        // best effort
      }
    };
  }, [siteKey, turnstileAttempt]);

  const charsUsed = text.length;

  const validationError = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.length < MIN_CHARS) {
      return `Please enter at least ${MIN_CHARS} characters.`;
    }
    if (trimmed.length > MAX_CHARS) {
      return `Please keep your message to ${MAX_CHARS} characters or fewer.`;
    }
    if (URL_PATTERN.test(trimmed)) {
      return 'Please remove URLs and submit plain text only.';
    }
    return null;
  }, [text]);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = text.trim();

    if (trimmed.length < MIN_CHARS) {
      setResult({ tone: 'error', message: `Please enter at least ${MIN_CHARS} characters.` });
      return;
    }
    if (trimmed.length > MAX_CHARS) {
      setResult({ tone: 'error', message: `Please keep your message to ${MAX_CHARS} characters or fewer.` });
      return;
    }
    if (URL_PATTERN.test(trimmed)) {
      setResult({ tone: 'error', message: 'Please remove URLs and submit plain text only.' });
      return;
    }
    if (!consent) {
      setResult({ tone: 'error', message: 'Consent is required before submission.' });
      return;
    }

    if (siteKey && !tokenRef.current) {
      setResult({ tone: 'error', message: 'Please complete the verification widget and try again.' });
      return;
    }

    setPending(true);
    setResult({ tone: 'neutral', message: 'Sending...' });

    try {
      const response = await submitTmaydMessage({
        text: trimmed,
        consent: true,
        turnstileToken: tokenRef.current
      });

      // Refresh Turnstile token regardless of outcome (single-use).
      try {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          tokenRef.current = '';
        }
      } catch {
        // best effort
      }

      if (response.status === 'accepted') {
        setResult({
          tone: 'success',
          message: response.message || 'Your message entered the print queue.',
          code: response.publicCode || ''
        });
        setText('');
        setConsent(false);
        return;
      }

      if (response.status === 'rejected' && response.kind === 'soft') {
        setResult({
          tone: 'error',
          message: response.message || 'This message includes identifying information. Please submit a non-identifying version.'
        });
        return;
      }

      if (response.status === 'rejected') {
        setResult({
          tone: 'error',
          message: response.message || 'This message cannot be accepted. Please submit a non-identifying reflection about your day.'
        });
        return;
      }

      if (response.status === 'rate_limited') {
        setResult({ tone: 'error', message: response.message || 'Too many submissions. Please try again later.' });
        return;
      }

      setResult({
        tone: 'error',
        message: response.message || 'The machine is temporarily not accepting messages. Please try again later.'
      });
    } catch {
      setResult({ tone: 'error', message: 'The machine is temporarily not accepting messages. Please try again later.' });
    } finally {
      setPending(false);
    }
  }

  const formDisabled = pending || !intakeOpen;

  const resultClass =
    result.tone === 'success'
      ? 'tmayd-result tmayd-result--accepted'
      : result.tone === 'error'
        ? 'tmayd-result tmayd-result--notice'
        : 'tmayd-result';
  const resultHeader =
    result.tone === 'success'
      ? 'status · accepted'
      : result.tone === 'error'
        ? 'status · notice'
        : 'status';

  return (
    <section className="tmayd-form" aria-label="Submission">
      <div className="tmayd-section-label">Submission</div>

      {!intakeOpen ? (
        <div className="tmayd-notice">
          <span className="tmayd-notice__label">§ Intake closed</span>
          {statusMessage || 'The machine is not currently accepting messages.'}
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <div className="tmayd-form__row">
          <label className="tmayd-form__label" htmlFor="tmayd-message">
            Message
          </label>
          <textarea
            id="tmayd-message"
            className="tmayd-form__textarea"
            name="message"
            rows="8"
            maxLength={MAX_CHARS}
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={formDisabled}
            placeholder="a small public trace of your day…"
            required
          />
          <span className="tmayd-form__counter">
            {charsUsed} / {MAX_CHARS}
          </span>
          {validationError ? (
            <p className="tmayd-form__validation">{validationError}</p>
          ) : null}
        </div>

        <div className="tmayd-form__row">
          <label className="tmayd-consent" htmlFor="tmayd-consent">
            <input
              id="tmayd-consent"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={formDisabled}
              required
            />
            <span className="tmayd-consent__box" aria-hidden="true" />
            <span className="tmayd-consent__label">
              I consent to public archival display if accepted.
            </span>
          </label>
        </div>

        {siteKey ? (
          <div className="tmayd-form__row tmayd-verify">
            <span className="tmayd-verify__label">Verification</span>
            <div
              id={containerDomId}
              ref={containerRef}
              aria-label="Verification widget"
            />
            {turnstileError ? (
              <div>
                <span className="tmayd-verify__error">{turnstileError}</span>
                <button
                  type="button"
                  className="tmayd-button tmayd-button--ghost"
                  onClick={retryTurnstile}
                  disabled={pending}
                >
                  retry verification
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          type="submit"
          className="tmayd-button tmayd-button--full"
          disabled={formDisabled || (siteKey ? !turnstileReady : false)}
        >
          {pending ? 'sending…' : 'send to the machine'}
        </button>
      </form>

      {result.message ? (
        <div className={resultClass} role="status">
          <div className="tmayd-result__header">{resultHeader}</div>
          <div className="tmayd-result__body">
            {result.message}
            {result.code ? (
              <span className="tmayd-result__pill">{result.code}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
