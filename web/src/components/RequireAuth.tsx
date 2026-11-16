import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { useMe } from '../hooks/useMe';

/** Leitet nicht angemeldete Personen zur Anmeldung und neue Personen zum Ausfüllen des Profils. */
export function RequireAuth({ children, allowNotOnboarded }: { children: ReactNode; allowNotOnboarded?: boolean }) {
  const { data: me, isLoading } = useMe();
  const location = useLocation();
  const { t } = useTranslation();
  if (isLoading) return <p className="loading">{t('status.loading')}</p>;
  if (!me) return <Navigate to={`/anmelden?weiter=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!me.onboarded && !allowNotOnboarded)
    return <Navigate to={`/willkommen?weiter=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}
