import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

/** Logo „Weg zur Sonne“: Petrol-Quadrat, gelbe Sonne, weißer Weg, Hügellinie (dekorativ) */
function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill="#0e5149" />
      <circle cx="42" cy="22" r="9" fill="#f5b82e" />
      <path d="M14 54c6-10 20-8 22-16s-6-10-2-15" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M6 46c10-6 20-5 30-2s16 2 22-2" fill="none" stroke="#2f7a6f" strokeWidth="3" strokeLinecap="round" />
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
        <p className="app-footer__brand">{t('app.name')}</p>
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
