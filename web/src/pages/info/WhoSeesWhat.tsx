import { VISIBILITIES } from '@happywalkers/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { VisibilityHint } from '../../components/VisibilityHint';
import { useInfoList } from './InfoParts';

interface Row {
  what: string;
  who: string;
  change: string;
}

/**
 * „Wer sieht was?“ – verständliche Übersicht der Sichtbarkeitsregeln.
 * Technische Fassung für Entwickler: docs/WER-SIEHT-WAS.md (Regeln in server/src/lib/access.ts).
 */
export default function WhoSeesWhat() {
  const { t } = useTranslation('info');
  const short = useInfoList<string>('who.short');
  const rows = useInfoList<Row>('who.rows');

  return (
    <div className="info-page">
      <PageHeader title={t('who.title')} lead={t('who.lead')} />

      <section className="card" aria-labelledby="wsw-short">
        <h2 id="wsw-short">{t('who.shortTitle')}</h2>
        <ul className="info-check-list">
          {short.map((s, i) => (
            <li key={i}>
              <Icon name="check" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="wsw-legend">
        <h2 id="wsw-legend">{t('who.legendTitle')}</h2>
        <p>{t('who.legendText')}</p>
        <ul className="info-legend">
          {VISIBILITIES.map((v) => (
            <li key={v}>
              <VisibilityHint visibility={v} /> – {t(`who.legend.${v}`)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="wsw-table">
        <h2 id="wsw-table">{t('who.tableTitle')}</h2>
        <div className="table-wrap">
          <table className="data info-table">
            <caption className="visually-hidden">{t('who.tableCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('who.colWhat')}</th>
                <th scope="col">{t('who.colWho')}</th>
                <th scope="col">{t('who.colChange')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.what}>
                  <th scope="row">{r.what}</th>
                  <td data-label={t('who.colWho')}>{r.who}</td>
                  <td data-label={t('who.colChange')}>{r.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack" aria-labelledby="wsw-do">
        <h2 id="wsw-do">{t('who.doTitle')}</h2>
        <p>{t('who.doText')}</p>
        <div className="btn-row">
          <Link className="btn" to="/profil/einstellungen">
            <Icon name="settings" /> {t('links.settings')}
          </Link>
          <Link className="btn btn--secondary" to="/profil/einstellungen#s-data">
            <Icon name="download" /> {t('links.export')}
          </Link>
          <Link className="btn btn--secondary" to="/profil/einstellungen#s-data">
            <Icon name="trash" /> {t('links.delete')}
          </Link>
        </div>
        <p>
          <Link to="/datenschutz">
            <Icon name="lock" className="inline-icon" /> {t('links.privacy')}
          </Link>
        </p>
      </section>
    </div>
  );
}
