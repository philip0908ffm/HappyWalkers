import '../../styles/pages-e.css';
import { badgeDefinition } from '@gehmeinsam/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { PublicProfile } from '../../api/types-e';
import { BadgeEmblem } from '../../components/BadgeEmblem';
import { Explain } from '../../components/Explain';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useMe';
import { formatKm } from '../../lib/format';
import { useBadgeText } from '../badges/badgeText';
import { ConfirmDialogE } from './parts/ConfirmDialogE';
import { PersonAvatar } from './parts/PersonAvatar';
import { PostListE } from './parts/PostListE';
import { ReportDialog } from './parts/ReportDialog';

export default function PersonPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation('people');
  const bt = useBadgeText();
  const { data: me } = useMe();
  const [dialog, setDialog] = useState<'unfollow' | 'block' | 'report' | null>(null);
  const q = useQuery({
    queryKey: ['users', id],
    queryFn: () => api.get<{ profile: PublicProfile }>(`/users/${id}`).then((r) => r.profile),
    enabled: !!id && id !== me?.id,
  });

  const follow = useAction({
    fn: () => api.post<{ followStatus: string }>(`/users/${id}/follow`),
    success: () => t('person.followRequested', { name: q.data?.displayName ?? '' }),
    invalidate: [['users', id], ['follows']],
  });
  const unfollow = useAction({
    fn: () => api.del(`/users/${id}/follow`),
    success: () => (q.data?.followStatus === 'pending' ? t('person.requestWithdrawn') : t('contacts.unfollowed', { name: q.data?.displayName ?? '' })),
    invalidate: [['users', id], ['follows']],
    onSuccess: () => setDialog(null),
  });
  const block = useAction({
    fn: () => api.post(`/users/${id}/block`),
    success: () => t('block.blocked', { name: q.data?.displayName ?? '' }),
    invalidate: [['users', id], ['follows'], ['blocks'], ['feed']],
    onSuccess: () => setDialog(null),
  });
  const unblock = useAction({
    fn: () => api.del(`/users/${id}/block`),
    success: () => t('block.unblocked', { name: q.data?.displayName ?? '' }),
    invalidate: [['users', id], ['blocks']],
  });

  if (me && id === me.id) return <Navigate to="/profil" replace />;
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <LoadError error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;

  return (
    <div className="page-e">
      <div className="person-head-e">
        <PersonAvatar name={p.displayName} url={p.avatarUrl} large />
        <div>
          <PageHeader title={p.displayName} lead={p.canSeeDetails && p.city ? t('person.from', { city: p.city }) : undefined} />
        </div>
      </div>

      {p.isBlocked ? (
        <section className="card stack" aria-labelledby="blocked-h">
          <h2 id="blocked-h">{t('person.blockedTitle')}</h2>
          <p>{t('person.blockedText')}</p>
          <button type="button" className="btn btn--secondary" disabled={unblock.isPending} onClick={() => unblock.mutate(undefined)}>
            {t('common:actions.unblock')}
          </button>
        </section>
      ) : (
        <>
          <section className="card stack" aria-labelledby="contact-h">
            <h2 id="contact-h">{t('person.contactTitle')}</h2>
            {p.followsMe ? <p>{t('person.followsMe', { name: p.displayName })}</p> : null}
            {p.followStatus === 'none' ? (
              <>
                <p>
                  {t('person.followExplain', { name: p.displayName })}{' '}
                  <Explain term={t('person.followTerm')}>{t('person.followTermExplain')}</Explain>
                </p>
                <button type="button" className="btn" disabled={follow.isPending} onClick={() => follow.mutate(undefined)}>
                  <Icon name="plus" /> {follow.isPending ? t('common:status.sending') : t('person.follow')}
                </button>
              </>
            ) : p.followStatus === 'pending' ? (
              <>
                <p className="notice notice--info">
                  <Icon name="clock" /> {t('person.pending', { name: p.displayName })}
                </p>
                <button type="button" className="btn btn--secondary" disabled={unfollow.isPending} onClick={() => unfollow.mutate(undefined)}>
                  {t('person.withdraw')}
                </button>
              </>
            ) : (
              <>
                <p className="notice notice--success">
                  <Icon name="check" /> {t('person.following', { name: p.displayName })}
                </p>
                <button type="button" className="btn btn--ghost" onClick={() => setDialog('unfollow')}>
                  {t('contacts.unfollow')}
                </button>
              </>
            )}
            {p.sharedGroups.length ? (
              <p>
                {t('person.sharedGroups')}{' '}
                {p.sharedGroups.map((g, i) => (
                  <span key={g.id}>
                    {i > 0 ? ', ' : ''}
                    <Link to={`/gruppen/${g.id}`}>{g.name}</Link>
                  </span>
                ))}
              </p>
            ) : null}
          </section>

          {p.canSeeDetails ? (
            <section className="card stack" aria-labelledby="about-h">
              <h2 id="about-h">{t('person.aboutTitle', { name: p.displayName })}</h2>
              {p.bio ? <p className="note-e">{p.bio}</p> : null}
              {p.stats ? (
                <ul className="stat-tiles plain-list">
                  <li className="stat-tile">
                    <span className="stat-tile__value">{p.stats.walks}</span>
                    <span className="stat-tile__label">{t('profile.statWalks', { count: p.stats.walks })}</span>
                  </li>
                  <li className="stat-tile">
                    <span className="stat-tile__value">{formatKm(p.stats.km)}</span>
                    <span className="stat-tile__label">{t('profile.statKm')}</span>
                  </li>
                </ul>
              ) : null}
              {p.badges?.length ? (
                <>
                  <h3>{t('person.badgesTitle')}</h3>
                  <ul className="mini-badges plain-list">
                    {p.badges.map((b) => {
                      const def = badgeDefinition(b.key);
                      return (
                        <li key={b.key}>
                          <BadgeEmblem kind={b.kind ?? def?.kind ?? 'distance'} tier={b.tier ?? def?.tier ?? 1} size={72} />
                          <span>{bt.name(b.key, b.label)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
            </section>
          ) : (
            <p className="notice notice--info">
              <Icon name="lock" /> {t('person.private', { name: p.displayName })}
            </p>
          )}

          <section className="section-e" aria-labelledby="posts-h">
            <h2 id="posts-h">{t('person.postsTitle', { name: p.displayName })}</h2>
            <PostListE filter={{ userId: p.id }} emptyText={t('person.postsEmpty')} />
          </section>
        </>
      )}

      <section className="card stack section-e" aria-labelledby="safety-h">
        <h2 id="safety-h">{t('person.safetyTitle')}</h2>
        <p>{t('person.safetyIntro')}</p>
        <div className="btn-row">
          {!p.isBlocked ? (
            <button type="button" className="btn btn--secondary" onClick={() => setDialog('block')}>
              <Icon name="block" /> {t('common:actions.block')}
            </button>
          ) : null}
          <button type="button" className="btn btn--secondary" onClick={() => setDialog('report')}>
            <Icon name="flag" /> {t('common:actions.report')}
          </button>
        </div>
      </section>

      <ConfirmDialogE
        open={dialog === 'unfollow'}
        title={t('contacts.unfollowTitle', { name: p.displayName })}
        confirmLabel={t('contacts.unfollowConfirm')}
        pending={unfollow.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => unfollow.mutate(undefined)}
      >
        <p>{t('contacts.unfollowText', { name: p.displayName })}</p>
      </ConfirmDialogE>
      <ConfirmDialogE
        open={dialog === 'block'}
        title={t('block.title', { name: p.displayName })}
        confirmLabel={t('block.confirm')}
        danger
        pending={block.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => block.mutate(undefined)}
      >
        <ul>
          <li>{t('block.effect1')}</li>
          <li>{t('block.effect2')}</li>
          <li>{t('block.effect3')}</li>
        </ul>
      </ConfirmDialogE>
      <ReportDialog open={dialog === 'report'} onClose={() => setDialog(null)} targetType="user" targetId={p.id} name={p.displayName} />
    </div>
  );
}
