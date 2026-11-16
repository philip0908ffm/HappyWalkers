import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('errors.not_found')} />
      <Link className="btn" to="/">
        {t('nav.start')}
      </Link>
    </>
  );
}
