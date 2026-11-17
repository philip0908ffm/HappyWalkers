import '../../styles/pages-e.css';
import { POINTS, REGION_BADGE_PREFIX, badgeDefinition } from '@happywalkers/shared';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, apiUrl } from '../../api/client';
import type { BadgeAvailable, BadgeEarned, BadgesOverview, Challenge } from '../../api/types-e';
import { BadgeEmblem } from '../../components/BadgeEmblem';
import { Explain } from '../../components/Explain';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { ProgressBar } from '../../components/ProgressBar';
import { useToast } from '../../components/Toast';
import { useAction } from '../../hooks/useAction';
import { formatDateShort, formatKm } from '../../lib/format';
import { useBadgeText } from './badgeText';
import { ChallengeProgress, useChallengeText } from './challengeParts';

type ProgressUnit = 'walks' | 'km' | 'single' | 'group' | 'places' | 'weeks' | null;
function unitFor(key: string): ProgressUnit {
  if (key === 'first_walk' || key.startsWith('walks_')) return 'walks';
  if (key.startsWith('total_')) return 'km';
  if (key === 'first_5k' || key === 'first_10k') return 'single';
  if (key === 'first_group_walk' || key.startsWith('group_walks_')) return 'group';
  if (key.startsWith('places_')) return 'places';
  if (key.startsWith('week_streak')) return 'weeks';
  return null;
}

export default function BadgesPage() {
  const { t } = useTranslation('badges');
  const q = useQuery({ queryKey: ['badges'], queryFn: () => api.get<BadgesOverview>('/badges') });

  return (
    <div className="page-e">
      <PageHeader title={t('page.title')} lead={t('page.lead')} />
      {q.isLoading ? <Loading /> : q.isError || !q.data ? <LoadError error={q.error} onRetry={() => q.refetch()} /> : <Showcase data={q.data} />}
      <ChallengesSection />
    </div>
  );
}

function Showcase({ data }: { data: BadgesOverview }) {
  const { t } = useTranslation('badges');
  const earnedByKey = new Map(data.earned.map((b) => [b.key, b]));
  const standard = data.available.filter((a) => !a.key.startsWith(REGION_BADGE_PREFIX));
  const regions = data.earned.filter((b) => b.key.startsWith(REGION_BADGE_PREFIX));
  // erreichte zuerst, dann nach Nähe zum Ziel
  const sorted = [...standard].sort((a, b) => {
    const ea = a.earned || earnedByKey.has(a.key);
    const eb = b.earned || earnedByKey.has(b.key);
    if (ea !== eb) return ea ? -1 : 1;
    const pa = a.progress ? a.progress.current / (a.progress.target || 1) : 0;
    const pb = b.progress ? b.progress.current / (b.progress.target || 1) : 0;
    return pb - pa;
  });
  const earnedCount = sorted.filter((a) => a.earned || earnedByKey.has(a.key)).length + regions.length;

  return (
    <>
      <section aria-labelledby="stats-h" className="stack-sm">
        <h2 id="stats-h">{t('page.statsTitle')}</h2>
        <ul className="stat-tiles plain-list">
          <li className="stat-tile stat-tile--accent">
            <span className="stat-tile__value">{data.points}</span>
            <span className="stat-tile__label">
              {t('page.points')}
              <Explain term={t('page.points')}>{t('page.pointsExplain', { activity: POINTS.activity, perKm: POINTS.perKm, group: POINTS.groupWalk, badge: POINTS.badge })}</Explain>
            </span>
          </li>
          <li className="stat-tile">
            <span className="stat-tile__value">{data.walksCount}</span>
            <span className="stat-tile__label">{t('page.walks', { count: data.walksCount })}</span>
          </li>
          <li className="stat-tile">
            <span className="stat-tile__value">{formatKm(data.totalKm)}</span>
            <span className="stat-tile__label">{t('page.km')}</span>
          </li>
          <li className="stat-tile">
            <span className="stat-tile__value">{data.groupWalksCount}</span>
            <span className="stat-tile__label">{t('page.groupWalks', { count: data.groupWalksCount })}</span>
          </li>
          <li className="stat-tile">
            <span className="stat-tile__value">{earnedCount}</span>
            <span className="stat-tile__label">{t('page.badgesCount', { count: earnedCount })}</span>
          </li>
        </ul>
        {data.walksCount === 0 ? (
          <p className="notice notice--info">
            <Icon name="info" />
            <span>
              {t('page.startHint')} <Link to="/walk-eintragen">{t('page.logWalk')}</Link>
            </span>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="badges-h">
        <h2 id="badges-h">{t('page.badgesTitle')}</h2>
        <p>{t('page.badgesIntro')}</p>
        <ul className="badge-grid plain-list">
          {sorted.map((a) => (
            <li key={a.key}>
              <BadgeCard available={a} earned={earnedByKey.get(a.key) ?? null} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="regions-h">
        <h2 id="regions-h">{t('page.regionsTitle')}</h2>
        <p>{t('page.regionsIntro')}</p>
        {regions.length ? (
          <ul className="badge-grid plain-list">
            {regions.map((b) => (
              <li key={b.key}>
                <BadgeCard available={{ key: b.key, kind: b.kind, tier: b.tier, earned: true, progress: null }} earned={b} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-text">{t('page.regionsEmpty')}</p>
        )}
      </section>
    </>
  );
}

function BadgeCard({ available: a, earned }: { available: BadgeAvailable; earned: BadgeEarned | null }) {
  const { t } = useTranslation('badges');
  const bt = useBadgeText();
  const isEarned = a.earned || !!earned;
  const def = badgeDefinition(a.key);
  const kind = earned?.kind ?? a.kind ?? def?.kind ?? 'distance';
  const tier = earned?.tier ?? a.tier ?? def?.tier ?? 1;
  const name = bt.name(a.key, earned?.label);
  const headingId = useId();

  return (
    <article className={`card badge-card badge-card--t${tier} ${isEarned ? '' : 'badge-card--locked'}`} aria-labelledby={headingId}>
      <BadgeEmblem kind={kind} tier={tier} earned={isEarned} size={120} />
      <div className="badge-card__body">
        <h3 id={headingId} className="badge-card__name">
          {name}
        </h3>
        <p className="badge-card__tier">
          {bt.tier(tier)} · {isEarned ? t('badge.earned') : t('badge.notYet')}
        </p>
        <p>{bt.description(a.key, earned?.label)}</p>
        {isEarned && earned ? <p className="badge-card__date">{t('badge.earnedAt', { date: formatDateShort(earned.awardedAt) })}</p> : null}
        {!isEarned && a.progress ? <BadgeProgress badgeKey={a.key} progress={a.progress} /> : null}
        {isEarned && earned ? <BadgeActions badge={earned} name={name} /> : null}
      </div>
    </article>
  );
}

function BadgeProgress({ badgeKey, progress }: { badgeKey: string; progress: { current: number; target: number } }) {
  const { t } = useTranslation('badges');
  const unit = unitFor(badgeKey);
  const rest = Math.max(0, progress.target - progress.current);
  let text: string;
  switch (unit) {
    case 'km':
      text = t('progress.km', { rest: formatKm(rest), current: formatKm(progress.current), target: formatKm(progress.target, 0) });
      break;
    case 'single':
      text = t('progress.single', { current: formatKm(progress.current), target: formatKm(progress.target, 0) });
      break;
    case 'walks':
      text = t('progress.walks', { count: Math.ceil(rest) });
      break;
    case 'group':
      text = t('progress.group', { count: Math.ceil(rest) });
      break;
    case 'places':
      text = t('progress.places', { count: Math.ceil(rest) });
      break;
    case 'weeks':
      text = t('progress.weeks', { current: progress.current, target: progress.target });
      break;
    default:
      text = t('progress.generic', { current: progress.current, target: progress.target });
  }
  return <ProgressBar label={t('progress.label')} value={progress.current} max={progress.target} text={text} />;
}

function BadgeActions({ badge, name }: { badge: BadgeEarned; name: string }) {
  const { t } = useTranslation('badges');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const key = encodeURIComponent(badge.key);

  const share = useAction({
    fn: () => api.post<{ shareUrl: string }>(`/badges/${key}/share`),
    success: t('share.created'),
    invalidate: [['badges']],
  });
  const unshare = useAction({
    fn: () => api.del(`/badges/${key}/share`),
    success: t('share.stopped'),
    invalidate: [['badges']],
  });
  const url = badge.shareUrl ?? share.data?.shareUrl ?? null;
  const shared = !!badge.shareUrl || (!!share.data && !unshare.isSuccess);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('share.copied'));
    } catch {
      toast.error(t('share.copyFailed'));
    }
  }

  return (
    <div className="badge-card__actions">
      <div className="btn-row">
        <button type="button" className="btn btn--secondary" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          <Icon name="share" /> {t('share.button')}
          {shared ? <span className="badge-pill">{t('share.isShared')}</span> : null}
        </button>
        <a className="btn btn--secondary" href={apiUrl(`/badges/${key}/certificate.pdf`)} download>
          <Icon name="download" /> {t('badge.certificate')}
        </a>
      </div>
      <div id={panelId} hidden={!open} className="share-panel">
        <p className="notice notice--warning">
          <Icon name="globe" />
          <span>{t('share.publicWarning', { name })}</span>
        </p>
        {shared && url ? (
          <>
            <label className="field__label-e" htmlFor={`${panelId}-url`}>
              {t('share.linkLabel')}
            </label>
            <input id={`${panelId}-url`} className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <div className="btn-row">
              <button type="button" className="btn" onClick={copy}>
                <Icon name="link" /> {t('share.copy')}
              </button>
              <button type="button" className="btn btn--danger" disabled={unshare.isPending} onClick={() => unshare.mutate(undefined)}>
                <Icon name="close" /> {t('share.stop')}
              </button>
            </div>
            <p className="field__hint">{t('share.stopHint')}</p>
          </>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={share.isPending}
            onClick={() => {
              unshare.reset();
              share.mutate(undefined);
            }}
          >
            <Icon name="link" /> {share.isPending ? t('common:status.saving') : t('share.create')}
          </button>
        )}
      </div>
    </div>
  );
}

function ChallengesSection() {
  const { t } = useTranslation('badges');
  const q = useQuery({ queryKey: ['challenges'], queryFn: () => api.get<{ active: Challenge[]; past: Challenge[] }>('/challenges') });
  return (
    <section aria-labelledby="ch-h" className="section-e">
      <h2 id="ch-h">
        {t('challenge.sectionTitle')} <Explain term={t('challenge.term')}>{t('challenge.explain')}</Explain>
      </h2>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          {q.data.active.length ? (
            <ul className="grid plain-list">
              {q.data.active.map((c) => (
                <li key={c.id}>
                  <ChallengeCard challenge={c} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-text">{t('challenge.none')}</p>
          )}
          {q.data.past.length ? (
            <>
              <h3>{t('challenge.pastTitle')}</h3>
              <ul className="past-list-e">
                {q.data.past.map((c) => (
                  <li key={c.id}>
                    <Link to={`/challenges/${c.id}`}>{c.title}</Link> – {c.completedAt ? t('challenge.pastDone') : t('challenge.pastEnded')}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

function ChallengeCard({ challenge: c }: { challenge: Challenge }) {
  const { t } = useTranslation('badges');
  const ct = useChallengeText();
  const join = useAction({
    fn: () => api.post<{ challenge: Challenge }>(`/challenges/${c.id}/join`),
    success: t('challenge.joined', { title: c.title }),
    invalidate: [['challenges']],
  });
  return (
    <article className="card challenge-card">
      <h3 className="card__title">
        <Link to={`/challenges/${c.id}`}>{c.title}</Link>
      </h3>
      <p>{c.summary}</p>
      <p className="card__meta">
        <span>
          <Icon name="calendar" /> {ct.period(c)}
        </span>
        <span>
          <Icon name="people2" /> {t('challenge.participants', { count: c.participantCount })}
        </span>
        <span>
          <Icon name="star" /> {t('challenge.points', { count: c.points })}
        </span>
        <span>
          <Icon name="pin" /> {ct.scope(c)}
        </span>
      </p>
      {c.joined ? (
        <ChallengeProgress challenge={c} />
      ) : (
        <button type="button" className="btn" disabled={join.isPending} onClick={() => join.mutate(undefined)}>
          <Icon name="plus" /> {join.isPending ? t('common:status.saving') : t('challenge.join')}
        </button>
      )}
      <p>
        <Link to={`/challenges/${c.id}`}>{t('challenge.more', { title: c.title })}</Link>
      </p>
    </article>
  );
}
