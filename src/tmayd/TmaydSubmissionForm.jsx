import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { submitTmaydMessage } from './tmaydApi';

const MAX_CHARS = 700;
const MIN_CHARS = 3;
const URL_PATTERN = /(https?:\/\/|www\.)/i;

const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let turnstileScriptPromise = null;

function loadTurnstileScript() {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src^="${TURNSTILE_SCRIPT_SRC.split('?')[0]}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.turnstile || null));
      existing.addEventListener('error', () => reject(new Error('turnstile_script_failed')));
      return;
    }
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.turnstile || null);
    script.onerror = () => reject(new Error('turnstile_script_failed'));
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

export default function TmaydSubmissionForm({ intakeOpen = true, statusMessage = '' }) {
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState({ tone: 'neutral', message: '' });
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileError, setTurnstileError] = useState('');
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const tokenRef = useRef('');
  const containerDomId = useId().replace(/[:]/g, '_') + '_turnstile';

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

  useEffect(() => {
    let cancelled = false;
    if (!siteKey) {
      setTurnstileReady(true); // dev/mock mode — server may also bypass
      return () => {};
    }
    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !turnstile || !containerRef.current) return;
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
          },
          'error-callback': () => {
            setTurnstileError('Verification widget failed to load.');
          }
        });
      })
      .catch(() => {
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
  }, [siteKey]);

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
        const codeSuffix = response.publicCode ? ` (${response.publicCode})` : '';
        setResult({ tone: 'success', message: `${response.message || 'Your message entered the print queue.'}${codeSuffix}` });
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

  return (
    <section>
      <h2>Submission form</h2>
      <p>
        Write a small public trace of your day. Do not submit emergencies, threats, confessions, allegations,
        names, addresses, phone numbers, legal claims, medical details, or private information. This is an artwork,
        not a private diary or reporting channel.
      </p>
      {!intakeOpen ? (
        <p>
          <strong>Intake currently closed.</strong> {statusMessage || 'The machine is not currently accepting messages.'}
        </p>
      ) : null}
      <form onSubmit={handleSubmit}>
        <p>
          <label htmlFor="tmayd-message">Message</label>
          <br />
          <textarea
            id="tmayd-message"
            name="message"
            rows="8"
            cols="64"
            maxLength={MAX_CHARS}
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={formDisabled}
            required
          />
        </p>
        <p>
          <small>{charsUsed} / {MAX_CHARS}</small>
        </p>
        {validationError ? <p><small>{validationError}</small></p> : null}
        <p>
          <label htmlFor="tmayd-consent">
            <input
              id="tmayd-consent"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={formDisabled}
              required
            />{' '}
            I consent to public archival display if accepted.
          </label>
        </p>
        {siteKey ? (
          <p>
            <div id={containerDomId} ref={containerRef} aria-label="Verification widget" />
            {turnstileError ? <small>{turnstileError}</small> : null}
          </p>
        ) : null}
        <p>
          <button
            type="submit"
            disabled={formDisabled || (siteKey ? !turnstileReady : false)}
          >
            {pending ? 'sending...' : 'send to the machine'}
          </button>
        </p>
      </form>
      {result.message ? (
        <p role="status">
          <strong>{result.tone === 'success' ? 'status: accepted' : result.tone === 'error' ? 'status: notice' : 'status:'}</strong>{' '}
          {result.message}
        </p>
      ) : null}
    </section>
  );
}
