import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../hooks/useErrorMessage';
import { Icon } from './Icon';

export function Loading() {
  const { t } = useTranslation();
  return (
    <p className="loading" role="status">
      {t('status.loading')}
    </p>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = useErrorMessage();
  const { t } = useTranslation();
  return (
    <div className="notice notice--error" role="alert">
      <Icon name="warning" />
      <div>
        <p>{msg(error)}</p>
        {onRetry ? (
          <button type="button" className="btn btn--secondary" onClick={onRetry}>
            {t('actions.retry')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
