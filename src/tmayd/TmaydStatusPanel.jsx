import { formatTmaydDateTime, safeStatusLabel } from './tmaydUtils';

function StateChip({ on, label }) {
  return (
    <span className={`tmayd-state${on ? ' tmayd-state--on' : ''}`}>
      <span className="tmayd-state__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export default function TmaydStatusPanel({ status, isMock = false, errorKind = null }) {
  const stateLabel = safeStatusLabel(status?.status);
  const heartbeat = status?.lastHeartbeatAt
    ? formatTmaydDateTime(status.lastHeartbeatAt)
    : 'unknown';

  return (
    <section className="tmayd-status" aria-label="Apparatus status">
      <div className="tmayd-section-label">Status</div>

      <div className="tmayd-status__row">
        <span className="tmayd-status__key">state</span>
        <span className="tmayd-status__leader" aria-hidden="true" />
        <span className="tmayd-status__value">
          {stateLabel}
          {isMock ? <span className="tmayd-tag tmayd-tag--warn">mock</span> : null}
          {errorKind ? <span className="tmayd-tag tmayd-tag--warn">offline</span> : null}
        </span>
      </div>

      <div className="tmayd-status__row">
        <span className="tmayd-status__key">heartbeat</span>
        <span className="tmayd-status__leader" aria-hidden="true" />
        <span className="tmayd-status__value">
          {heartbeat}
          {status?.lastHeartbeatAt ? (
            <span className="tmayd-pulse" aria-hidden="true" />
          ) : null}
        </span>
      </div>

      <div className="tmayd-status__states" role="group" aria-label="Apparatus subsystems">
        <StateChip on={Boolean(status?.intakeOpen)} label="intake" />
        <StateChip on={Boolean(status?.printingOpen)} label="printing" />
        <StateChip on={Boolean(status?.archiveOpen)} label="archive" />
      </div>

      {status?.message ? (
        <p className="tmayd-status__row" style={{ display: 'block' }}>
          <span className="tmayd-status__key">note</span>{' '}
          <span className="tmayd-status__value" style={{ textAlign: 'left' }}>
            {status.message}
          </span>
        </p>
      ) : null}
    </section>
  );
}
