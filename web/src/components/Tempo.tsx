import { TEMPOS, type Tempo } from '@happywalkers/shared';
import { useTranslation } from 'react-i18next';
import { Explain } from './Explain';

/**
 * Tempo-Symbol: 1, 2 oder 3 Pfeilspitzen – so ist das Tempo auch ohne Farbe erkennbar.
 * Immer zusammen mit dem Text verwenden.
 */
export function TempoSymbol({ tempo }: { tempo: Tempo }) {
  const n = tempo === 'gemuetlich' ? 1 : tempo === 'zuegig' ? 2 : 3;
  return (
    <svg className="tempo-symbol" viewBox="0 0 30 16" aria-hidden="true" focusable="false">
      {Array.from({ length: 3 }, (_, i) => (
        <path
          key={i}
          d={`M${3 + i * 9} 3l6 5-6 5`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={i < n ? 1 : 0.18}
        />
      ))}
    </svg>
  );
}

/** Tempo-Anzeige: Symbol + Farbe + Text („Tempo: zügig“). */
export function TempoBadge({ tempo, withLabel = false }: { tempo: Tempo; withLabel?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={`tempo-badge tempo-badge--${tempo}`}>
      <TempoSymbol tempo={tempo} />
      <span>
        {withLabel ? <span className="tempo-badge__label">{t('tempo.label')}: </span> : <span className="visually-hidden">{t('tempo.label')}: </span>}
        {t(`tempo.${tempo}`)}
      </span>
    </span>
  );
}

/**
 * Tempo-Auswahl als große Kacheln mit Erklärung (Radio-Gruppe, per Tastatur mit Pfeiltasten).
 * `allowAny` ergänzt „Egal“ (für Suchfilter, Wert `''`).
 */
export function TempoPicker({
  value,
  onChange,
  name,
  legend,
  allowAny,
  compact,
}: {
  value: Tempo | '';
  onChange: (t: Tempo | '') => void;
  name: string;
  legend?: string;
  allowAny?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const options: (Tempo | '')[] = allowAny ? ['', ...TEMPOS] : [...TEMPOS];
  return (
    <fieldset className="field">
      <legend>
        {legend ?? t('tempo.label')} <Explain term={t('tempo.label')}>{t('tempo.explain')}</Explain>
      </legend>
      <div className={`choice-list ${compact ? 'choice-list--row tempo-compact' : 'tempo-picker'}`}>
        {options.map((o) => (
          <label key={o || 'any'} className={`choice tempo-choice ${o ? `tempo-choice--${o}` : ''}`}>
            <input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} />
            <span className="choice__text">
              <strong className="tempo-choice__title">
                {o ? <TempoSymbol tempo={o} /> : null}
                {o ? t(`tempo.${o}`) : t('tempo.any')}
              </strong>
              {!compact && o ? <span>{t(`tempo.${o}_hint`)}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
