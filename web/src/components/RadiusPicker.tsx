import { SEARCH_RADII_KM } from '@gehmeinsam/shared';
import { useTranslation } from 'react-i18next';

/** Umkreis-Auswahl (5 / 15 / 30 / 50 km) als große Auswahlknöpfe. */
export function RadiusPicker({
  value,
  onChange,
  name = 'radius',
  options = SEARCH_RADII_KM,
}: {
  value: number;
  onChange: (km: number) => void;
  name?: string;
  options?: readonly number[];
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="field">
      <legend>{t('search.radius')}</legend>
      <div className="choice-list choice-list--row choice-list--compact">
        {options.map((km) => (
          <label key={km} className="choice">
            <input type="radio" name={name} checked={value === km} onChange={() => onChange(km)} />
            {t('search.radiusKm', { km })}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
