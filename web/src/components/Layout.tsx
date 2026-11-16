import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

/** Logo */
function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="#1d5c3f" />
      <circle cx="24" cy="18" r="6" fill="#ffd27a" />
      <circle cx="42" cy="18" r="6" fill="#fff" />
      <path d="M24 26v14l-6 12M24 40l6 12M42 26v14l-6 12M42 40l6 12" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

const NAV: { to: string; key: string; icon: IconName; end?: boolean }[] = [
  { to: '/', key: 'nav.start', icon: 'home', end: true },
  { to: '/walks', key: 'nav.walks', icon: 'walk' },
  { to: '/gruppen', key: 'nav.groups', icon: 'group' },
  { to: '/abzeichen', key: 'nav.badges', icon: 'badge' },
  { to: '/profil', key: 'nav.profile', icon: 'user' },
];

/**
 * Seitenrahmen: Sprunglink, feste Hauptnavigation (5 Punkte, Symbol + Text), Inhalt, Fußzeile.
 * Bei Seitenwechsel wird der Fokus auf den Hauptinhalt gesetzt (Screenreader hören die neue Seite).
 */
export function Layout() {
  const { t } = useTranslation();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const lastPath = useRef(location.pathname);

  useEffect(() => {
    // nur bei echtem Seitenwechsel (nicht beim ersten Laden)
    if (lastPath.current === location.pathname) return;
    lastPath.current = location.pathname;
    mainRef.current?.focus();
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#inhalt">
        {t('nav.skipToContent')}
      </a>
      <header className="app-header">
        <div className="app-header__inner">
          <Link to="/" className="app-logo">
            <Logo />
            <span>{t('app.name')}</span>
          </Link>
          <nav className="app-nav" aria-label={t('nav.label')}>
            <ul>
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.end}>
                    <Icon name={item.icon} />
                    <span>{t(item.key)}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main id="inhalt" className="app-main" ref={mainRef} tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="app-footer no-print">
        <ul>
          <li>
            <Link to="/hilfe">{t('footer.help')}</Link>
          </li>
          <li>
            <Link to="/wer-sieht-was">{t('footer.whoSeesWhat')}</Link>
          </li>
          <li>
            <Link to="/datenschutz">{t('footer.privacy')}</Link>
          </li>
          <li>
            <Link to="/impressum">{t('footer.imprint')}</Link>
          </li>
          <li>
            <Link to="/premium">{t('footer.premium')}</Link>
          </li>
        </ul>
      </footer>
    </div>
  );
}
