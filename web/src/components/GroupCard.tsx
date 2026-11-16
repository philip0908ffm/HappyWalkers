import type { JoinPolicy } from '@gehmeinsam/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { GroupSummary } from '../api/types-walks';
import { formatDate, formatKm, formatTime } from '../lib/format';
import { Icon, type IconName } from './Icon';
import { TempoBadge } from './Tempo';

export const joinPolicyIcon: Record<JoinPolicy, IconName> = { open: 'group', request: 'mail', invite: 'lock' };

/** Gruppenkarte mit Foto, Ort, Teilnehmerzahl, Tempo, Beitrittsregel und nächstem Termin. */
export function GroupCard({ group, headingLevel = 3 }: { group: GroupSummary; headingLevel?: 2 | 3 | 4 }) {
  const { t } = useTranslation('groups');
  const H = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  const place = [group.city, group.district && group.district !== group.city ? group.district : null].filter(Boolean).join(', ');
  return (
    <article className="group-card">
      <div className="group-card__photo" aria-hidden="true">
        {group.photoUrl ? <img src={group.photoUrl} alt="" loading="lazy" /> : <Icon name="group" />}
      </div>
      <div className="group-card__body">
        <H className="group-card__title">
          <Link to={`/gruppen/${group.id}`}>{group.name}</Link>
        </H>
        <ul className="walk-card__meta">
          {place ? (
            <li>
              <Icon name="pin" className="inline-icon" /> {place}
              {group.distanceKm != null ? ` (${t('walks:card.away', { km: formatKm(group.distanceKm) })})` : ''}
            </li>
          ) : null}
          <li>
            <Icon name="people2" className="inline-icon" /> {t('members', { count: group.memberCount })}
          </li>
          <li>
            <TempoBadge tempo={group.defaultTempo} />
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
        {group.nextWalk ? (
          <p className="group-card__next">
            <Icon name="calendar" className="inline-icon" /> {t('nextWalk')}:{' '}
            <Link to={`/walks/${group.nextWalk.id}`}>
              {formatDate(group.nextWalk.startsAt)}, {formatTime(group.nextWalk.startsAt)}
            </Link>
          </p>
        ) : null}
        {group.myMembership ? (
          <p className="group-card__status">
            <span className={`status-pill ${group.myMembership.status === 'active' ? 'status-pill--success' : ''}`}>
              <Icon name={group.myMembership.status === 'active' ? 'check' : 'clock'} />{' '}
              {group.myMembership.status === 'active' ? t('status.member') : group.myMembership.status === 'pending' ? t('status.pending') : t('status.banned')}
            </span>
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function GroupList({ groups, headingLevel = 3 }: { groups: GroupSummary[]; headingLevel?: 2 | 3 | 4 }) {
  return (
    <ul className="plain-list card-list">
      {groups.map((g) => (
        <li key={g.id}>
          <GroupCard group={g} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}
