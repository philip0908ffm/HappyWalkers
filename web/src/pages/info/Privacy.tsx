import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { BlockBody, PlaceholderNotice, RichText, useInfoList, type InfoBlock } from './InfoParts';

/** Datenschutzerklärung in einfacher Sprache (Muster mit Platzhaltern für den Betreiber). */
export default function Privacy() {
  const { t } = useTranslation('info');
  const short = useInfoList<string>('privacy.short');
  const sections = useInfoList<InfoBlock>('privacy.sections');

  return (
    <div className="info-page">
      <PageHeader title={t('privacy.title')} lead={t('privacy.lead')} />
      <PlaceholderNotice />

      <section className="card" aria-labelledby="ds-short">
        <h2 id="ds-short">{t('privacy.shortTitle')}</h2>
        <ul className="info-check-list">
          {short.map((s, i) => (
            <li key={i}>
              <Icon name="check" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
        <p>
          <Link to="/wer-sieht-was">
            <Icon name="eye" className="inline-icon" /> {t('links.whoSeesWhat')}
          </Link>
        </p>
      </section>

      <nav className="info-toc card" aria-labelledby="ds-toc">
        <h2 id="ds-toc">{t('privacy.tocTitle')}</h2>
        <ol>
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.title?.replace(/^\d+\.\s*/, '')}</a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((s) => (
        <section key={s.id} aria-labelledby={s.id}>
          <h2 id={s.id} tabIndex={-1}>
            {s.title}
          </h2>
          <BlockBody block={s}>
            {s.id === 'rechte' ? (
              <div className="btn-row">
                <Link className="btn btn--secondary" to="/profil/einstellungen#s-data">
                  <Icon name="download" /> {t('links.export')}
                </Link>
                <Link className="btn btn--secondary" to="/profil/einstellungen">
                  <Icon name="settings" /> {t('links.settings')}
                </Link>
              </div>
            ) : null}
          </BlockBody>
        </section>
      ))}

      <p>
        <RichText text={t('updated')} />
      </p>
    </div>
  );
}
