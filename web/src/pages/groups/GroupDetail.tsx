import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { GroupDetail as Group } from '../../api/types-walks';
import { groupsApi, qk } from '../../api/walks';
import { PersonChip } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Explain } from '../../components/Explain';
import { joinPolicyIcon } from '../../components/GroupCard';
import { GroupFeed } from '../../components/GroupFeed';
import { Icon } from '../../components/Icon';
import { InvitePanel } from '../../components/InvitePanel';
import { JoinGroup } from '../../components/JoinGroup';
import { Landscape } from '../../components/Landscape';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { TempoBadge } from '../../components/Tempo';
import { WalkList } from '../../components/WalkCard';
import { useAction } from '../../hooks/useAction';
import { timeOfDayLabel, weekdayName } from '../../lib/dates';
import { formatDuration, formatKm } from '../../lib/format';

export default function GroupDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation('groups');
  const q = useQuery({ queryKey: qk.group(id), queryFn: () => groupsApi.get(id) });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data)
    return (
      <>
        <PageHeader title={t('detail.notFoundTitle')} />
        <LoadError error={q.error} onRetry={() => q.refetch()} />
        <Link to="/gruppen">{t('detail.backToList')}</Link>
      </>
    );
  return <GroupView group={q.data} />;
}

function GroupView({ group }: { group: Group }) {
  const { t } = useTranslation('groups');
  const isMember = group.myMembership?.status === 'active';
  const place = [group.city, group.district && group.district !== group.city ? group.district : null].filter(Boolean).join(', ');

  return (
    <div className="group-detail">
      <p>
        <Link to="/gruppen" className="btn btn--ghost back-link">
          <Icon name="arrowLeft" /> {t('detail.backToList')}
        </Link>
      </p>

      <div className="group-hero">
        <div className="group-hero__photo">
          {group.photoUrl ? <img src={group.photoUrl} alt={t('detail.photoAlt', { name: group.name })} /> : <Landscape variant="thumb" seed={group.id} />}
        </div>
        <div className="group-hero__text">
          <PageHeader title={group.name} lead={place} />
          <ul className="walk-card__meta group-hero__meta">
            <li>
              <Icon name="people2" className="inline-icon" /> {t('members', { count: group.memberCount })}
            </li>
            <li>
              <TempoBadge tempo={group.defaultTempo} withLabel />
            </li>
            <li>
              <Icon name={joinPolicyIcon[group.joinPolicy]} className="inline-icon" /> {t(`joinPolicy.${group.joinPolicy}`)}
            </li>
            {group.womenOnly ? (
              <li>
                <Icon name="user" className="inline-icon" /> {t('womenOnly')}
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      {group.rules ? (
        <section className="pinned-rules" aria-labelledby="rules-title">
          <h2 id="rules-title">
            <Icon name="list" className="inline-icon" /> {t('detail.rules')}
          </h2>
          <p className="pre-line">{group.rules}</p>
        </section>
      ) : null}

      {group.womenOnly ? (
        <div className="notice notice--info">
          <Icon name="info" />
          <p>{t('detail.womenOnlyInfo')}</p>
        </div>
      ) : null}

      <div className="detail-layout">
        <div className="detail-layout__main">
          {group.description ? (
            <section className="card" aria-labelledby="about-title">
              <h2 id="about-title">{t('detail.about')}</h2>
              <p className="pre-line">{group.description}</p>
            </section>
          ) : null}

          <section className="section-block" aria-labelledby="next-title">
            <div className="section-head">
              <h2 id="next-title">
                <Icon name="calendar" className="inline-icon" /> {t('detail.nextWalks')}
              </h2>
            </div>
            {group.upcomingWalks.length ? (
              <WalkList walks={group.upcomingWalks} showGroup={false} />
            ) : (
              <p>{t('detail.noWalks')}</p>
            )}
            {group.canManage ? (
              <Link className="btn btn--secondary" to={`/walks/neu?gruppe=${group.id}`}>
                <Icon name="plus" /> {t('detail.newWalk')}
              </Link>
            ) : null}
          </section>

          {group.series.length ? (
            <section className="card" aria-labelledby="series-title">
              <h2 id="series-title">
                {t('detail.series')} <Explain term={t('detail.series')}>{t('detail.seriesExplain')}</Explain>
              </h2>
              <ul className="plain-list series-list">
                {group.series
                  .filter((s) => s.active)
                  .map((s) => (
                    <li key={s.id} className="series-item">
                      <p className="series-item__when">{t('detail.seriesWhen', { weekday: weekdayName(s.weekday), time: timeOfDayLabel(s.timeOfDay) })}</p>
                      <p className="series-item__title">{s.title}</p>
                      <p className="walk-card__meta">
                        <TempoBadge tempo={s.tempo} />
                        <span>
                          <Icon name="clock" className="inline-icon" /> {formatDuration(s.durationMinutes)}
                        </span>
                        {s.distanceKm != null ? (
                          <span>
                            <Icon name="route" className="inline-icon" /> {t('common:units.km', { value: formatKm(s.distanceKm) })}
                          </span>
                        ) : null}
                      </p>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}

          {isMember ? (
            <section className="card" aria-labelledby="feed-title">
              <h2 id="feed-title">
                <Icon name="comment" className="inline-icon" /> {t('detail.feed')}
              </h2>
              <GroupFeed groupId={group.id} canPost headingLevel={3} />
            </section>
          ) : null}

          {isMember ? (
            <section className="card" aria-labelledby="invite-title">
              <h2 id="invite-title">
                <Icon name="share" className="inline-icon" /> {t('invite.title')}
              </h2>
              <p>{t('invite.lead')}</p>
              <InvitePanel groupId={group.id} headingLevel={3} />
            </section>
          ) : null}
        </div>

        <aside className="detail-layout__side" aria-label={t('detail.sideLabel')}>
          <section className="card" aria-labelledby="membership-title">
            <h2 id="membership-title">{isMember ? t('detail.youAreMember') : t('detail.joinTitle')}</h2>
            {isMember ? <MemberBox group={group} /> : <JoinGroup group={group} />}
          </section>

          {group.leads.length ? (
            <section className="card" aria-labelledby="leads-title">
              <h2 id="leads-title">{t('detail.leads')}</h2>
              <ul className="plain-list person-list">
                {group.leads.map((p) => (
                  <li key={p.id}>
                    <PersonChip person={p} extra={t(`role.${p.role}`)} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {group.canManage ? (
            <section className="card" aria-labelledby="manage-title">
              <h2 id="manage-title">
                <Icon name="settings" className="inline-icon" /> {t('detail.manageTitle')}
              </h2>
              <ul className="plain-list action-list">
                <li>
                  <Link className="btn btn--secondary btn--block" to={`/gruppen/${group.id}/verwaltung`}>
                    <Icon name="people2" /> {t('detail.manageMembers')}
                  </Link>
                </li>
                <li>
                  <Link className="btn btn--secondary btn--block" to={`/gruppen/${group.id}/bearbeiten`}>
                    <Icon name="edit" /> {t('detail.edit')}
                  </Link>
                </li>
                <li>
                  <Link className="btn btn--secondary btn--block" to={`/gruppen/${group.id}/aushang`}>
                    <Icon name="print" /> {t('invite.poster')}
                  </Link>
                </li>
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function MemberBox({ group }: { group: Group }) {
  const { t } = useTranslation('groups');
  const [ask, setAsk] = useState(false);
  const leave = useAction({
    fn: () => groupsApi.leave(group.id),
    success: t('detail.left', { name: group.name }),
    invalidate: [qk.groups, qk.myGroups, qk.walks],
    onSuccess: () => setAsk(false),
  });
  return (
    <>
      <p className="status-line">
        <span className="status-pill status-pill--success">
          <Icon name="check" /> {t(`role.${group.myMembership?.role ?? 'member'}`)}
        </span>
      </p>
      {group.isFounder ? (
        <p className="field__hint">{t('detail.founderCannotLeave')}</p>
      ) : (
        <button type="button" className="btn btn--ghost" onClick={() => setAsk(true)}>
          <Icon name="logout" /> {t('detail.leave')}
        </button>
      )}
      <ConfirmDialog
        open={ask}
        title={t('detail.leaveTitle', { name: group.name })}
        confirmLabel={t('detail.leaveConfirm')}
        cancelLabel={t('detail.leaveKeep')}
        danger
        busy={leave.isPending}
        onConfirm={() => leave.mutate(undefined)}
        onCancel={() => setAsk(false)}
      >
        <p>{t('detail.leaveText')}</p>
      </ConfirmDialog>
    </>
  );
}
