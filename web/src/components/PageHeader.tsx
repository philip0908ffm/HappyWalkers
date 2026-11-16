import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** Seitenüberschrift (h1) + Seitentitel im Browser-Tab. */
export function PageHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = `${title} – ${t('app.name')}`;
  }, [title, t]);
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {lead ? <p className="page-header__lead">{lead}</p> : null}
      {actions ? <div className="page-header__actions btn-row">{actions}</div> : null}
    </header>
  );
}
