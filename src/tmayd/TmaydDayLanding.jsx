const BASE_ROUTE = '/labs/tell-me-about-your-day';

export default function TmaydDayLanding({ publicCode = '', dateLabel = '' }) {
  return (
    <section className="tmayd-copy">
      <div className="tmayd-notice">
        <span className="tmayd-notice__label">§ Not ready yet</span>
        Your message landed in the apparatus
        {dateLabel ? <> on <strong>{dateLabel}</strong></> : null}
        {publicCode ? <> as <strong>{publicCode}</strong></> : null}
        . The photographic archive isn’t wired yet, so there’s nothing
        to display here until the camera phase comes online.
      </div>

      <div className="tmayd-day-actions">
        <a href={BASE_ROUTE} className="tmayd-button tmayd-button--full">
          submit another →
        </a>
        <a href={`${BASE_ROUTE}/live`} className="tmayd-button tmayd-button--full tmayd-button--ghost">
          watch live →
        </a>
      </div>
    </section>
  );
}
