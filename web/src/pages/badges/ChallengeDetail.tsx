import '../../styles/pages-e.css';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Challenge, LeaderboardRow } from '../../api/types-e';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useMe';
import { ConfirmDialogE } from '../profile/parts/ConfirmDialogE';
import { ChallengeProgress, useChallengeText } from './challengeParts';

export default function ChallengeDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation('badges');
  const { data: me } = useMe();
  const ct = useChallengeText();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const q = useQuery({
    queryKey: ['challenges', id],
    queryFn: () => api.get<{ challenge: Challenge; leaderboard: LeaderboardRow[] }>(`/challenges/${id}`),
  });
  const join = useAction({
    fn: () => api.post(`/challenges/${id}/join`),
    success: () => t('challenge.joined', { title: q.data?.challenge.title ?? '' }),
    invalidate: [['challenges']],
  });
  const leave = useAction({
    fn: () => api.del(`/challenges/${id}/join`),
    success: t('challenge.left'),
    invalidate: [['challenges']],
    onSuccess: () => setConfirmLeave(false),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <LoadError error={q.error} onRetry={() => q.refetch()} />;
  const { challenge: c, leaderboard } = q.data;
  const ended = new Date(c.endsAt).getTime() < Date.now();
  const hidden = me?.settings.leaderboardMode === 'hidden';

  return (
    <div className="page-e">
      <p>
        <Link to="/abzeichen#ch-h">
          <Icon name="arrowLeft" className="inline-icon" /> {t('challenge.back')}
        </Link>
      </p>
      <PageHeader title={c.title} lead={c.summary} />

      <section className="card stack" aria-labelledby="about-h">
        <h2 id="about-h">{t('challenge.aboutTitle')}</h2>
        <p>{t(`challenge.type_${c.type}`, { target: ct.value(c, c.target) })}</p>
        <ul className="facts-list-e">
          <li>
            <Icon name="calendar" className="inline-icon" /> {ct.period(c)}
          </li>
          <li>
            <Icon name="pin" className="inline-icon" /> {ct.scope(c)}
          </li>
          <li>
            <Icon name="star" className="inline-icon" /> {t('challenge.pointsLong', { count: c.points })}
          </li>
          <li>
            <Icon name="people2" className="inline-icon" /> {t('challenge.participants', { count: c.participantCount })}
          </li>
        </ul>
        <p className="field__hint">{t('challenge.countsHint')}</p>
        {c.joined ? (
          <>
            <ChallengeProgress challenge={c} />
            {c.completedAt ? (
              <p className="notice notice--success">
                <Icon name="trophy" /> {t('challenge.completed')}
              </p>
            ) : null}
            {!ended ? (
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmLeave(true)}>
                {t('challenge.leave')}
              </button>
            ) : null}
          </>
        ) : ended ? (
          <p className="notice notice--info">
            <Icon name="info" /> {t('challenge.endedInfo')}
          </p>
        ) : (
          <button type="button" className="btn btn--large" disabled={join.isPending} onClick={() => join.mutate(undefined)}>
            <Icon name="plus" /> {join.isPending ? t('common:status.saving') : t('challenge.join')}
          </button>
        )}
      </section>

      <section className="card stack" aria-labelledby="rank-h">
        <h2 id="rank-h">{t('challenge.rankingTitle')}</h2>
        <p>{t('challenge.rankingIntro')}</p>
        {leaderboard.length ? (
          <div className="table-wrap">
            <table className="data ranking-e">
              <caption className="visually-hidden">{t('challenge.rankingCaption', { title: c.title })}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('challenge.colRank')}</th>
                  <th scope="col">{t('challenge.colName')}</th>
                  <th scope="col">{t('challenge.colProgress')}</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r) => (
                  <tr key={`${r.rank}-${r.name}-${r.isMe}`} className={r.isMe ? 'ranking-e__me' : undefined} aria-current={r.isMe ? 'true' : undefined}>
                    <td>{t('challenge.rank', { rank: r.rank })}</td>
                    <th scope="row">
                      {r.name}
                      {r.isMe ? <strong className="ranking-e__you"> {t('challenge.you')}</strong> : null}
                    </th>
                    <td>{ct.value(c, r.progress)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-text">{t('challenge.rankingEmpty')}</p>
        )}
        <p className="notice notice--info">
          <Icon name="eye" />
          <span>
            {hidden ? t('challenge.anonymousOn') : t('challenge.anonymousHint')}{' '}
            <Link to="/profil/einstellungen">{t('challenge.toSettings')}</Link>
          </span>
        </p>
      </section>

      <ConfirmDialogE
        open={confirmLeave}
        title={t('challenge.leaveTitle')}
        confirmLabel={t('challenge.leaveConfirm')}
        pending={leave.isPending}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => leave.mutate(undefined)}
      >
        <p>{t('challenge.leaveText')}</p>
      </ConfirmDialogE>
    </div>
  );
}
