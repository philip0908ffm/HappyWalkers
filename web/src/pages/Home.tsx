import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { useMe } from '../hooks/useMe';

/** Startseite – Platzhalter, wird im Arbeitspaket „Start & Soziales“ ausgebaut. */
export default function Home() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  return (
    <>
      <PageHeader title={me ? `Hallo ${me.displayName}` : t('app.name')} lead={t('app.tagline')} />
      {!me ? (
        <Link className="btn btn--large" to="/anmelden">
          Anmelden
        </Link>
      ) : null}
    </>
  );
}
