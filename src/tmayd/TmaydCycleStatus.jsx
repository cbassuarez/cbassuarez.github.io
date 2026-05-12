import { Fragment, useEffect, useState } from 'react';
import { isStaleHeartbeat, relativeTime } from './tmaydUtils';

const STAGES = [
  { id: 'you', label: 'you' },
  { id: 'print', label: 'print' },
  { id: 'photo', label: 'photo' },
  { id: 'archive', label: 'archive' }
];

const COPY = {
  listening: {
    headline: 'the machine is listening.',
    subline: 'Write a few lines below. The printer will pick them up next.'
  },
  printing: {
    headline: 'the machine is printing.',
    subline: 'A previous message is being printed onto thermal paper. You can still send yours.'
  },
  photographing: {
    headline: 'a page is passing through the camera.',
    subline: 'The printed page is being photographed for today’s reel.'
  },
  paused: {
    headline: 'the machine is paused.',
    subline: 'The operator is attending to the apparatus.'
  },
  offline: {
    headline: 'the machine isn’t reachable right now',
    subline: 'Submissions will resume once the apparatus is back.'
  }
};

function deriveAudienceState({ status, isMock, errorKind }) {
  const s = status?.status || 'inactive';
  const heartIso = status?.lastHeartbeatAt || '';
  const stale = isStaleHeartbeat(heartIso);
  const offline =
    Boolean(isMock) ||
    Boolean(errorKind) ||
    s === 'inactive' ||
    s === 'offline' ||
    stale;

  if (offline) return { kind: 'offline', activeStage: null };
  if (s === 'printing') return { kind: 'printing', activeStage: 'print' };
  if (s === 'capturing') return { kind: 'photographing', activeStage: 'photo' };
  if (!status?.intakeOpen) return { kind: 'paused', activeStage: 'archive' };
  return { kind: 'listening', activeStage: 'you' };
}

export default function TmaydCycleStatus({ status, isMock = false, errorKind = null }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 10000);
    return () => window.clearInterval(id);
  }, []);

  const audience = deriveAudienceState({ status, isMock, errorKind });
  const copy = COPY[audience.kind];
  const overrideSub =
    audience.kind === 'paused' && status?.message ? status.message : null;
  const subline = overrideSub || copy.subline;

  const lastContact =
    audience.kind === 'offline' ? '' : relativeTime(status?.lastHeartbeatAt);

  return (
    <section
      className={`tmayd-cycle${audience.kind === 'offline' ? ' tmayd-cycle--offline' : ''}`}
      aria-label="Apparatus status"
    >
      <p className="tmayd-cycle__headline">{copy.headline}</p>

      <div
        className="tmayd-cycle__diagram"
        role="img"
        aria-label={`Current stage: ${audience.activeStage || 'offline'}`}
      >
        {STAGES.map((stage, index) => {
          const active = stage.id === audience.activeStage;
          return (
            <Fragment key={stage.id}>
              <span
                className={`tmayd-cycle__step${active ? ' tmayd-cycle__step--active' : ''}`}
              >
                <span className="tmayd-cycle__dot" aria-hidden="true" />
                <span className="tmayd-cycle__label">{stage.label}</span>
              </span>
              {index < STAGES.length - 1 ? (
                <span className="tmayd-cycle__connector" aria-hidden="true" />
              ) : null}
            </Fragment>
          );
        })}
      </div>

      <p className="tmayd-cycle__subline">{subline}</p>

      {lastContact ? (
        <p className="tmayd-cycle__heartbeat">last contact · {lastContact}</p>
      ) : null}
    </section>
  );
}
