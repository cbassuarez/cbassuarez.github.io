import './tmayd.css';

const BASE_ROUTE = '/labs/tell-me-about-your-day';

function todayCompact() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function variantMeta(variant, codeOverride) {
  const today = todayCompact();
  switch (variant) {
    case 'live':
      return {
        eyebrow: 'LIVE · CAMERA GATE',
        code: codeOverride || `STREAM · ${today}`
      };
    case 'reel':
      return {
        eyebrow: 'REEL · ARCHIVE',
        code: codeOverride || `REEL · ${today}`
      };
    case 'ops':
      return {
        eyebrow: 'OPERATOR · OPS',
        code: codeOverride || `OPS · ${today}`
      };
    case 'landing':
    default:
      return {
        eyebrow: `INTAKE · ${today}`,
        code: codeOverride || `DAY · ${today} · OPEN FOR MESSAGES`
      };
  }
}

export default function TmaydPageShell({
  variant = 'landing',
  codeOverride = '',
  showNav = true,
  children
}) {
  const meta = variantMeta(variant, codeOverride);
  const today = todayCompact();

  return (
    <div className="tmayd-root">
      <article className="tmayd-receipt">
        <header className="tmayd-header">
          <div className="tmayd-header__eyebrow">{meta.eyebrow}</div>
          <h1 className="tmayd-header__title">Tell me about your day</h1>
          <div className="tmayd-header__code">{meta.code}</div>
          {showNav ? (
            <nav className="tmayd-nav" aria-label="TMAYD navigation">
              <a href={BASE_ROUTE}>intake</a>
              <a href={`${BASE_ROUTE}/live`}>live</a>
              <a href={`${BASE_ROUTE}/reel`}>reel</a>
              <a href="/">home</a>
            </nav>
          ) : null}
        </header>

        {children}

        <footer className="tmayd-footer">
          <div className="tmayd-footer__colophon">
            cbassuarez · receipt {today}
          </div>
        </footer>
      </article>
    </div>
  );
}
