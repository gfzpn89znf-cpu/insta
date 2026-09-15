import type { ReactNode } from 'react';

/**
 * Kopfzeile fuer alle Unterseiten. Der Zurueck-Pfeil liegt immer an
 * derselben Stelle - links oben, mit genug Flaeche fuer den Daumen.
 */
export default function ScreenHeader({
  title,
  onBack,
  right,
  subtitle,
}: {
  title: ReactNode;
  onBack: () => void;
  right?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="screen-head">
      <button className="back-btn" onClick={onBack} aria-label="Zurueck">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="screen-title">
        <div className="screen-title-main">{title}</div>
        {subtitle && <div className="screen-title-sub">{subtitle}</div>}
      </div>
      <div className="screen-right">{right}</div>
    </header>
  );
}
