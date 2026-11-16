import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { WalkSummary } from '../api/types-walks';
import { dateParts } from '../lib/dates';
import { formatDate, formatDuration, formatKm, formatTime } from '../lib/format';
import { Icon } from './Icon';
import { TempoBadge } from './Tempo';

/**
 * Terminkarte für einen Walk. Die ganze Überschrift ist der Link (großes Klickziel),
 * alle Angaben stehen als Text (nicht nur als Symbol) da.
 */
export function WalkCard({
  walk,
  headingLevel = 3,
  showGroup = true,
  showDistance = true,
}: {
  walk: WalkSummary;
  headingLevel?: 2 | 3 | 4;
  showGroup?: boolean;
  showDistance?: boolean;
}) {
  const { t } = useTranslation('walks');
  const H = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  const p = dateParts(walk.startsAt);
  const cancelled = walk.status === 'cancelled';
  const full = walk.maxParticipants != null && walk.participantCount >= walk.maxParticipants;
  const place = [walk.city, walk.district && walk.district !== walk.city ? walk.district : null].filter(Boolean).join(', ');

  return (
    <article className={`walk-card ${cancelled ? 'walk-card--cancelled' : ''} ${walk.myRsvp === 'yes' ? 'walk-card--going' : ''}`}>
      <div className="walk-card__date" aria-hidden="true">
        <span className="walk-card__weekday">{p.weekdayShort}</span>
        <span className="walk-card__day">{p.day}</span>
        <span className="walk-card__month">{p.monthShort}</span>
      </div>
      <div className="walk-card__body">
        <H className="walk-card__title">
          <Link to={`/walks/${walk.id}`}>{walk.title}</Link>
        </H>
        <p className="walk-card__when">
          <Icon name="calendar" className="inline-icon" /> {formatDate(walk.startsAt)}, {formatTime(walk.startsAt)}
        </p>
        <ul className="walk-card__meta">
          <li>
            <TempoBadge tempo={walk.tempo} />
          </li>
          <li>
            <Icon name="clock" className="inline-icon" /> {formatDuration(walk.durationMinutes)}
          </li>
          {walk.distanceKm != null ? (
            <li>
              <Icon name="route" className="inline-icon" /> {t('common:units.km', { value: formatKm(walk.distanceKm) })}
            </li>
          ) : null}
          {walk.kind === 'distance' ? (
            <li>
              <Icon name="globe" className="inline-icon" /> {t('kind.distance')}
            </li>
          ) : place ? (
            <li>
              <Icon name="pin" className="inline-icon" /> {place}
              {showDistance && walk.distanceFromCenterKm != null ? ` (${t('card.away', { km: formatKm(walk.distanceFromCenterKm) })})` : ''}
            </li>
          ) : null}
          {showGroup && walk.group ? (
            <li>
              <Icon name="group" className="inline-icon" /> {walk.group.name}
              {walk.group.womenOnly ? ` · ${t('groups:womenOnlyShort')}` : ''}
            </li>
          ) : null}
          <li>
            <Icon name="people2" className="inline-icon" />{' '}
            {walk.maxParticipants != null
              ? t('card.participantsOf', { count: walk.participantCount, max: walk.maxParticipants })
              : t('card.participants', { count: walk.participantCount })}
          </li>
        </ul>
        <div className="walk-card__status">
          {cancelled ? (
            <span className="status-pill status-pill--error">
              <Icon name="close" /> {t('card.cancelled')}
            </span>
          ) : null}
          {walk.myRsvp === 'yes' && !cancelled ? (
            <span className="status-pill status-pill--success">
              <Icon name="check" /> {t('card.going')}
            </span>
          ) : null}
          {full && !cancelled && walk.myRsvp !== 'yes' ? <span className="status-pill">{t('card.full')}</span> : null}
          {walk.confirmed ? (
            <span className="status-pill status-pill--success">
              <Icon name="badge" /> {t('card.confirmed')}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** Liste von Walk-Karten */
export function WalkList({ walks, headingLevel = 3, showGroup }: { walks: WalkSummary[]; headingLevel?: 2 | 3 | 4; showGroup?: boolean }) {
  return (
    <ul className="plain-list card-list">
      {walks.map((w) => (
        <li key={w.id}>
          <WalkCard walk={w} headingLevel={headingLevel} showGroup={showGroup} />
        </li>
      ))}
    </ul>
  );
}
