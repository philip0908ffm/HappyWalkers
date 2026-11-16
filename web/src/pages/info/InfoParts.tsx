import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import './info.css';

/** Ein Textblock aus info.json (Abschnitt der Datenschutzerklärung, Frage der Hilfe …). */
export interface InfoBlock {
  id: string;
  title?: string;
  q?: string;
  paras?: string[];
  items?: string[];
  steps?: string[];
  after?: string[];
}

/** Liest eine Liste (returnObjects) aus der Übersetzung – leer, falls der Schlüssel fehlt. */
export function useInfoList<T>(key: string, values?: Record<string, unknown>): T[] {
  const { t } = useTranslation('info');
  const v = t(key, { returnObjects: true, ...values }) as unknown;
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Text mit Zeilenumbrüchen; [Platzhalter] werden deutlich markiert. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {line.split(/(\[[^\]]+\])/).map((part, j) =>
            /^\[[^\]]+\]$/.test(part) ? (
              <mark key={j} className="info-placeholder">
                {part}
              </mark>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
        </Fragment>
      ))}
    </>
  );
}

/** Inhalt eines Blocks: Absätze, Aufzählung, nummerierte Schritte, Schlussabsätze. */
export function BlockBody({ block, children }: { block: InfoBlock; children?: ReactNode }) {
  return (
    <>
      {block.paras?.map((p, i) => (
        <p key={`p${i}`}>
          <RichText text={p} />
        </p>
      ))}
      {block.items?.length ? (
        <ul>
          {block.items.map((p, i) => (
            <li key={i}>
              <RichText text={p} />
            </li>
          ))}
        </ul>
      ) : null}
      {block.steps?.length ? (
        <ol>
          {block.steps.map((p, i) => (
            <li key={i}>
              <RichText text={p} />
            </li>
          ))}
        </ol>
      ) : null}
      {block.after?.map((p, i) => (
        <p key={`a${i}`}>
          <RichText text={p} />
        </p>
      ))}
      {children}
    </>
  );
}

/** Hinweis „Muster mit Platzhaltern“ für Datenschutz und Impressum. */
export function PlaceholderNotice() {
  const { t } = useTranslation('info');
  return (
    <div className="notice notice--warning">
      <Icon name="warning" />
      <p>
        <RichText text={t('placeholderNote')} />
      </p>
    </div>
  );
}
