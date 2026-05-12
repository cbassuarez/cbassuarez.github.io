import { useEffect, useMemo, useState } from 'react';
import { fetchLiveFrame } from './tmaydApi';
import { buildCacheBustedUrl, formatTmaydDateTime, safeStatusLabel } from './tmaydUtils';

function pollIntervalForStatus(status) {
  switch (status) {
    case 'printing':
    case 'capturing':
      return 12000;
    case 'idle':
      return 30000;
    case 'reset_required':
      return 45000;
    case 'inactive':
    case 'offline':
    case 'maintenance':
    default:
      return 60000;
  }
}

export default function TmaydLiveFrame() {
  const [frame, setFrame] = useState({
    status: 'inactive',
    imageUrl: '',
    observedAt: '',
    width: 0,
    height: 0,
    caption: ''
  });
  const [isMock, setIsMock] = useState(false);
  const [errorKind, setErrorKind] = useState(null);
  const [cacheToken, setCacheToken] = useState('0');

  useEffect(() => {
    let cancelled = false;
    let timerId = null;

    const tick = async () => {
      const result = await fetchLiveFrame();
      if (cancelled) {
        return;
      }

      setFrame(result.data);
      setIsMock(Boolean(result.mock));
      setErrorKind(result.ok ? null : result.errorKind || 'unknown');
      setCacheToken(String(Date.now()));

      const baseDelay = pollIntervalForStatus(result.data?.status);
      const delay = document.visibilityState === 'hidden' ? Math.max(baseDelay, 90000) : baseDelay;
      timerId = window.setTimeout(tick, delay);
    };

    tick();

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  const shouldShowOffline = useMemo(() => {
    const status = frame?.status || 'inactive';
    return !frame?.imageUrl || status === 'inactive' || status === 'offline' || status === 'maintenance';
  }, [frame]);

  return (
    <section aria-label="Live camera-gate frame">
      <div className="tmayd-section-label">Live · Camera gate</div>

      <div className="tmayd-status">
        <div className="tmayd-status__row">
          <span className="tmayd-status__key">state</span>
          <span className="tmayd-status__leader" aria-hidden="true" />
          <span className="tmayd-status__value">
            {safeStatusLabel(frame.status)}
            {isMock ? <span className="tmayd-tag tmayd-tag--warn">mock</span> : null}
            {errorKind ? <span className="tmayd-tag tmayd-tag--warn">offline</span> : null}
          </span>
        </div>
        {frame?.observedAt ? (
          <div className="tmayd-status__row">
            <span className="tmayd-status__key">observed</span>
            <span className="tmayd-status__leader" aria-hidden="true" />
            <span className="tmayd-status__value">{formatTmaydDateTime(frame.observedAt)}</span>
          </div>
        ) : null}
      </div>

      {shouldShowOffline ? (
        <p className="tmayd-copy" style={{ marginTop: 12 }}>
          The apparatus is not currently live. The archive will begin when the machine is activated.
        </p>
      ) : (
        <figure className="tmayd-figure">
          <img
            src={buildCacheBustedUrl(frame.imageUrl, cacheToken)}
            alt="Current camera-gate frame from the Tell Me About Your Day apparatus."
          />
          <figcaption className="tmayd-figure__caption">
            {frame.caption || 'Public camera-gate frame.'}
          </figcaption>
        </figure>
      )}
    </section>
  );
}
