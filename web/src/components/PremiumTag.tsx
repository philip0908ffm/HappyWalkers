import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/** Kennzeichen „Premium“ – steht VOR kostenpflichtigen Funktionen, damit niemand überrascht wird. */
export function PremiumTag({ text }: { text?: string }) {
  const { t } = useTranslation();
  return (
    <span className="badge-pill badge-pill--premium">
      <Icon name="star" /> {text ?? t('premium.label')}
    </span>
  );
}
