import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { qk, walksApi } from '../../api/walks';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { TempoBadge } from '../../components/Tempo';
import { formatDate, formatDuration, formatKm, formatTime } from '../../lib/format';
import '../../styles/print.css';

/** Druckansicht eines Walks (ohne Navigation): Zettel für den Kühlschrank. */
export default function WalkPrint() {
  const { id = '' } = useParams();
  const { t } = useTranslation('walks');
  const q = useQuery({ queryKey: qk.walk(id), queryFn: () => walksApi.get(id) });
  const walk = q.data;

  useEffect(() => {
    if (walk) document.title = `${walk.title} – ${t('common:app.name')}`;
  }, [walk, t]);

  return (
    <main className="print-page" id="inhalt">
      <div className="print-toolbar no-print">
        <Link className="btn btn--secondary" to={`/walks/${id}`}>
          <Icon name="arrowLeft" /> {t('print.back')}
        </Link>
        <button type="button" className="btn btn--large" onClick={() => window.print()} disabled={!walk}>
          <Icon name="print" /> {t('print.print')}
        </button>
      </div>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <LoadError error={q.error} onRetry={() => q.refetch()} /> : null}
      {walk ? (
        <article className="print-sheet">
          <p className="print-sheet__brand">{t('common:app.name')}</p>
          <h1>{walk.title}</h1>
          {walk.group ? <p className="print-sheet__sub">{walk.group.name}</p> : null}
          {walk.status === 'cancelled' ? <p className="print-sheet__cancelled">{t('detail.cancelledTitle')}</p> : null}
          <dl className="print-facts">
            <div>
              <dt>{t('detail.when')}</dt>
              <dd>
                {formatDate(walk.startsAt)}, <strong>{formatTime(walk.startsAt)}</strong>
              </dd>
            </div>
            <div>
              <dt>{t('detail.duration')}</dt>
              <dd>{formatDuration(walk.durationMinutes)}</dd>
            </div>
            {walk.distanceKm != null ? (
              <div>
                <dt>{t('detail.distance')}</dt>
                <dd>{t('common:units.km', { value: formatKm(walk.distanceKm) })}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t('common:tempo.label')}</dt>
              <dd>
                <TempoBadge tempo={walk.tempo} /> – {t(`common:tempo.${walk.tempo}_hint`)}
              </dd>
            </div>
            <div>
              <dt>{t('detail.meetingPoint')}</dt>
              <dd>
                {walk.kind === 'distance' ? (
                  t('detail.distanceText')
                ) : walk.meetingPoint ? (
                  <>
                    {walk.meetingPoint.name ? <strong>{walk.meetingPoint.name}</strong> : null}
                    {walk.meetingPoint.address ? <span className="print-block">{walk.meetingPoint.address}</span> : null}
                    {walk.meetingPoint.description ? <span className="print-block">{walk.meetingPoint.description}</span> : null}
                  </>
                ) : (
                  [walk.city, walk.district].filter(Boolean).join(', ') || t('detail.meetingPointHidden')
                )}
              </dd>
            </div>
            {walk.createdBy ? (
              <div>
                <dt>{t('detail.lead')}</dt>
                <dd>{walk.createdBy.displayName}</dd>
              </div>
            ) : null}
          </dl>
          {walk.description ? <p className="pre-line">{walk.description}</p> : null}
          <p className="print-sheet__footer">{t('print.footer', { url: `${window.location.origin}/walks/${walk.id}` })}</p>
        </article>
      ) : null}
    </main>
  );
}
