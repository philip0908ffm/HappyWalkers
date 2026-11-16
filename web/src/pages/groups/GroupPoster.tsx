import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { groupsApi } from '../../api/walks';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { timeOfDayLabel, weekdayName } from '../../lib/dates';
import { formatDate, formatTime } from '../../lib/format';
import '../../styles/print.css';

/**
 * Druckbarer A4-Aushang (Bäckerei, Apotheke, Gemeindehaus): großer Name, Einladung,
 * Termine, QR-Code und Einladungscode. Ohne Navigation.
 */
export default function GroupPoster() {
  const { id = '' } = useParams();
  const { t } = useTranslation('groups');
  const q = useQuery({ queryKey: ['groups', id, 'poster'], queryFn: () => groupsApi.poster(id) });
  const p = q.data;

  useEffect(() => {
    document.title = `${t('poster.docTitle')}${p ? ` – ${p.group.name}` : ''} – ${t('common:app.name')}`;
  }, [p, t]);

  const site = p ? new URL(p.url).host : window.location.host;
  const activeSeries = p?.series.filter((s) => s.active) ?? [];

  return (
    <main className="print-page" id="inhalt">
      <div className="print-toolbar no-print">
        <Link className="btn btn--secondary" to={`/gruppen/${id}`}>
          <Icon name="arrowLeft" /> {t('poster.back')}
        </Link>
        <button type="button" className="btn btn--large" onClick={() => window.print()} disabled={!p}>
          <Icon name="print" /> {t('poster.print')}
        </button>
        <p className="print-toolbar__hint">{t('poster.hint')}</p>
      </div>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <LoadError error={q.error} onRetry={() => q.refetch()} /> : null}
      {p ? (
        <article className="poster">
          <p className="poster__kicker">{t('poster.kicker')}</p>
          <h1 className="poster__name">{p.group.name}</h1>
          <p className="poster__city">{p.group.city}</p>
          {p.group.description ? <p className="poster__desc">{p.group.description}</p> : null}

          {activeSeries.length || p.nextWalks.length ? (
            <section className="poster__when">
              <h2>{t('poster.when')}</h2>
              <ul>
                {activeSeries.map((s) => (
                  <li key={s.id}>
                    <strong>{t('detail.seriesWhen', { weekday: weekdayName(s.weekday), time: timeOfDayLabel(s.timeOfDay) })}</strong> – {s.title} (
                    {t(`common:tempo.${s.tempo}`)})
                  </li>
                ))}
                {activeSeries.length === 0
                  ? p.nextWalks.slice(0, 4).map((w) => (
                      <li key={w.id}>
                        <strong>
                          {formatDate(w.startsAt)}, {formatTime(w.startsAt)}
                        </strong>{' '}
                        – {w.title}
                      </li>
                    ))
                  : null}
              </ul>
            </section>
          ) : null}

          <section className="poster__join">
            <div className="poster__qr" role="img" aria-label={t('poster.qrAlt')} dangerouslySetInnerHTML={{ __html: p.qrSvg }} />
            <div className="poster__how">
              <h2>{t('poster.howTitle')}</h2>
              <ol>
                <li>{t('poster.step1')}</li>
                <li>
                  {t('poster.step2', { site })}
                  <span className="poster__code">{p.code}</span>
                </li>
              </ol>
              <p className="poster__free">{t('poster.free')}</p>
            </div>
          </section>
          <p className="poster__footer">
            {t('common:app.name')} · {site}
          </p>
        </article>
      ) : null}
    </main>
  );
}
