import { REGION_BADGE_PREFIX } from '@gehmeinsam/shared';
import { useTranslation } from 'react-i18next';

/** Name und Ein-Satz-Beschreibung eines Abzeichens (auch regionale Wappen „region:<Landkreis>“). */
export function useBadgeText() {
  const { t } = useTranslation('badges');
  const isRegion = (key: string) => key.startsWith(REGION_BADGE_PREFIX);
  const regionLabel = (key: string, label?: string | null) => label ?? key.slice(REGION_BADGE_PREFIX.length);
  return {
    name: (key: string, label?: string | null) =>
      isRegion(key) ? t('names.region', { label: regionLabel(key, label) }) : t(`names.${key}`, { defaultValue: key }),
    description: (key: string, label?: string | null) =>
      isRegion(key) ? t('descriptions.region', { label: regionLabel(key, label) }) : t(`descriptions.${key}`, { defaultValue: '' }),
    tier: (tier: number) => t(`tier.${tier}`),
  };
}
