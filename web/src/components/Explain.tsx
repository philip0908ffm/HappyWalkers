import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/**
 * Erklärung zum Anklicken für Fachbegriffe (kein Hover nötig, per Tastatur bedienbar).
 * <Explain term="Tempo">So schnell wird ungefähr gegangen …</Explain>
 */
export function Explain({ term, children }: { term: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { t } = useTranslation();
  return (
    <span className="explain">
      <button
        type="button"
        className="explain__button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="help" />
        <span className="visually-hidden">{t('explain.whatIs', { term })}</span>
      </button>
      {open ? (
        <span id={id} className="explain__text">
          {children}
        </span>
      ) : (
        <span id={id} hidden />
      )}
    </span>
  );
}
