import { useEffect, useState } from 'react';
import TmaydCycleStatus from './TmaydCycleStatus';
import TmaydDayLanding from './TmaydDayLanding';
import TmaydLiveFrame from './TmaydLiveFrame';
import TmaydOpsPlaybook from './TmaydOpsPlaybook';
import TmaydPageShell from './TmaydPageShell';
import TmaydPreflight from './TmaydPreflight';
import TmaydReelViewer from './TmaydReelViewer';
import TmaydStatusPanel from './TmaydStatusPanel';
import TmaydSubmissionForm from './TmaydSubmissionForm';
import { fetchTmaydStatus } from './tmaydApi';
import { isValidArchiveDate } from './tmaydUtils';

const BASE_ROUTE = '/labs/tell-me-about-your-day';

function parseRoute(pathname) {
  const result = {
    initialDate: '',
    highlightPublicCode: '',
    notice: '',
    isLive: false,
    isReel: false,
    isOps: false,
    isDay: false
  };

  if (!pathname.startsWith(BASE_ROUTE)) {
    return result;
  }

  if (pathname === BASE_ROUTE || pathname === `${BASE_ROUTE}/`) {
    return result;
  }

  if (
    pathname === `${BASE_ROUTE}/ops` ||
    pathname === `${BASE_ROUTE}/ops/` ||
    pathname === `${BASE_ROUTE}/preflight` ||
    pathname === `${BASE_ROUTE}/preflight/`
  ) {
    result.isOps = true;
    return result;
  }

  if (
    pathname === `${BASE_ROUTE}/live` ||
    pathname === `${BASE_ROUTE}/live/`
  ) {
    result.isLive = true;
    return result;
  }

  if (
    pathname === `${BASE_ROUTE}/reel` ||
    pathname === `${BASE_ROUTE}/reel/`
  ) {
    result.isReel = true;
    return result;
  }

  const reelMatch = pathname.match(/^\/labs\/tell-me-about-your-day\/reel\/(\d{4}-\d{2}-\d{2})\/?$/);
  if (reelMatch) {
    const date = reelMatch[1];
    result.isReel = true;
    if (isValidArchiveDate(date)) {
      result.initialDate = date;
    } else {
      result.notice = 'Requested reel date is invalid. Showing main archive view.';
    }
    return result;
  }

  const dayMatch = pathname.match(/^\/labs\/tell-me-about-your-day\/day\/(DAY-\d{8}-\d{4,})\/?$/);
  if (dayMatch) {
    const code = dayMatch[1];
    // Until the camera phase is wired, /day/{code} renders a simple
    // "record received, not archived yet" landing rather than the full
    // microfiche reel viewer. When archived frames exist, this branch
    // will fall through to the reel viewer highlighted on the code.
    result.isDay = true;
    result.highlightPublicCode = code;
    const m = code.match(/^DAY-(\d{4})(\d{2})(\d{2})-\d{4,}$/);
    if (m) {
      result.initialDate = `${m[1]}-${m[2]}-${m[3]}`;
    }
    return result;
  }

  result.notice = 'Requested TMAYD subroute is not available yet. Showing intake.';
  return result;
}

export default function TmaydLabsPage({ pathname }) {
  const routeState = parseRoute(pathname || BASE_ROUTE);
  const [status, setStatus] = useState({
    status: 'inactive',
    intakeOpen: false,
    printingOpen: false,
    archiveOpen: true,
    lastHeartbeatAt: '',
    message: ''
  });
  const [statusIsMock, setStatusIsMock] = useState(false);
  const [statusError, setStatusError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timerId = null;

    const tick = async () => {
      const result = await fetchTmaydStatus();
      if (cancelled) {
        return;
      }

      setStatus(result.data);
      setStatusIsMock(Boolean(result.mock));
      setStatusError(result.ok ? null : result.errorKind || 'unknown');

      const delay = document.visibilityState === 'hidden' ? 90000 : 30000;
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

  // Lock outer (html/body) scroll while TMAYD is mounted — the receipt is
  // the only scroll surface.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  function handleJumpToSubmit() {
    const target = document.getElementById('submit');
    if (!target) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({
      behavior: prefersReduced ? 'auto' : 'smooth',
      block: 'start'
    });
  }

  if (routeState.isOps) {
    return (
      <TmaydPageShell variant="ops">
        <TmaydStatusPanel status={status} isMock={statusIsMock} errorKind={statusError} />
        <hr className="tmayd-rule" />
        <TmaydPreflight />
        <hr className="tmayd-rule" />
        <TmaydOpsPlaybook />
      </TmaydPageShell>
    );
  }

  if (routeState.isLive) {
    return (
      <TmaydPageShell variant="live">
        <TmaydStatusPanel status={status} isMock={statusIsMock} errorKind={statusError} />
        <hr className="tmayd-rule" />
        <TmaydLiveFrame />
      </TmaydPageShell>
    );
  }

  if (routeState.isDay) {
    return (
      <TmaydPageShell variant="day" codeOverride={routeState.highlightPublicCode}>
        <TmaydDayLanding
          publicCode={routeState.highlightPublicCode}
          dateLabel={routeState.initialDate}
        />
      </TmaydPageShell>
    );
  }

  if (routeState.isReel) {
    return (
      <TmaydPageShell variant="reel">
        <TmaydStatusPanel status={status} isMock={statusIsMock} errorKind={statusError} />
        <hr className="tmayd-rule" />
        <TmaydReelViewer
          initialDate={routeState.initialDate}
          highlightPublicCode={routeState.highlightPublicCode}
        />
      </TmaydPageShell>
    );
  }

  return (
    <TmaydPageShell variant="landing">
      <section className="tmayd-copy">
        <p>
          Tell Me About Your Day is a public text intake and thermal-paper archive.
          Messages submitted here may be screened, printed by a local thermal printer,
          photographed as they pass through a small camera gate, and accumulated as a
          physical strip inside the apparatus.
        </p>

        <div className="tmayd-notice">
          <span className="tmayd-notice__label">§ Notice</span>
          This is a public artwork, not a private diary. Do not submit emergencies,
          threats, confessions, allegations, names, addresses, phone numbers, legal claims,
          medical details, or private information. Accepted messages may be physically printed,
          photographed, archived, displayed online, or exhibited.
        </div>

        {routeState.notice ? (
          <p className="tmayd-section-label">{routeState.notice}</p>
        ) : null}

        <p className="tmayd-jump">
          <button
            type="button"
            className="tmayd-button tmayd-button--jump"
            onClick={handleJumpToSubmit}
          >
            submit ↓
          </button>
        </p>
      </section>

      <hr className="tmayd-rule" />

      <TmaydCycleStatus status={status} isMock={statusIsMock} errorKind={statusError} />

      <hr className="tmayd-rule" />

      <div id="submit" />
      <TmaydSubmissionForm
        intakeOpen={Boolean(status?.intakeOpen)}
        statusMessage={status?.message || ''}
      />
    </TmaydPageShell>
  );
}
