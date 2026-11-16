import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { BlockBody, PlaceholderNotice, useInfoList, type InfoBlock } from './InfoParts';

interface Source {
  name: string;
  credit: string;
  license: string;
  url: string;
}

/** Impressum (Muster nach § 5 DDG) und Quellenangaben für freie Daten und Werke. */
export default function Imprint() {
  const { t } = useTranslation('info');
  const sections = useInfoList<InfoBlock>('imprint.sections');
  const sources = useInfoList<Source>('imprint.sources');

  return (
    <div className="info-page">
      <PageHeader title={t('imprint.title')} lead={t('imprint.lead')} />
      <PlaceholderNotice />

      {sections.map((s) => (
        <section key={s.id} aria-labelledby={`imp-${s.id}`}>
          <h2 id={`imp-${s.id}`}>{s.title}</h2>
          <BlockBody block={s} />
        </section>
      ))}

      <section className="card" aria-labelledby="imp-sources">
        <h2 id="imp-sources">{t('imprint.sourcesTitle')}</h2>
        <p>{t('imprint.sourcesLead')}</p>
        <ul className="info-sources">
          {sources.map((src) => (
            <li key={src.name}>
              <strong>{src.name}</strong>
              <br />
              {src.credit}
              <br />
              {t('imprint.licenseLabel')}: {src.license}
              <br />
              <a href={src.url}>
                {t('imprint.openLink')}: {src.url.replace(/^https:\/\//, '').replace(/\/$/, '')}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
