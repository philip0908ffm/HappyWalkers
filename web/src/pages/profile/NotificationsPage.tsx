import '../../styles/pages-e.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { AppNotification } from '../../api/types-e';
import { Icon, type IconName } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';
import { formatDateTime, formatKm } from '../../lib/format';
import { useBadgeText } from '../badges/badgeText';

const ICONS: Record<string, IconName> = {
  join_request: 'group',
  join_approved: 'group',
  follow_request: 'people2',
  follow_accepted: 'people2',
  walk_cancelled: 'calendar',
  walk_confirmed: 'check',
  comment: 'comment',
  like: 'heart',
  badge: 'badge',
  challenge_done: 'trophy',
  partner_request: 'walk',
  partner_accepted: 'walk',
  interest_match: 'pin',
};

type Data = Record<string, unknown>;
const str = (d: Data, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = k.split('.').reduce<unknown>((o, part) => (o && typeof o === 'object' ? (o as Data)[part] : undefined), d);
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
};

/** Ziel-Link je Benachrichtigung (nur wenn die nötige Kennung mitgeliefert wird) */
function linkFor(n: AppNotification): string | null {
  const d = n.data ?? {};
  const groupId = str(d, 'groupId', 'group.id');
  const walkId = str(d, 'walkId', 'walk.id');
  const userId = n.actor?.id ?? str(d, 'actorId', 'userId', 'fromUserId', 'actor.id', 'from.id', 'user.id');
  switch (n.type) {
    case 'join_request':
      return groupId ? `/gruppen/${groupId}/verwaltung` : null;
    case 'join_approved':
      return groupId ? `/gruppen/${groupId}` : null;
    case 'follow_request':
      return '/profil#kontakte';
    case 'follow_accepted':
      return userId ? `/personen/${userId}` : '/profil#kontakte';
    case 'walk_cancelled':
      return walkId ? `/walks/${walkId}` : null;
    case 'walk_confirmed': {
      const activityId = str(d, 'activityId');
      return activityId ? `/eintraege/${activityId}` : walkId ? `/walks/${walkId}` : null;
    }
    case 'comment':
    case 'like':
      return groupId ? `/gruppen/${groupId}` : '/profil#eintraege';
    case 'badge':
      return '/abzeichen';
    case 'challenge_done': {
      const cid = str(d, 'challengeId', 'challenge.id');
      return cid ? `/challenges/${cid}` : '/abzeichen';
    }
    case 'partner_request':
      return '/in-der-naehe#gehpartner';
    case 'partner_accepted':
      return walkId ? `/walks/${walkId}` : '/in-der-naehe#gehpartner';
    case 'interest_match':
      return '/in-der-naehe';
    default:
      return null;
  }
}

export default function NotificationsPage() {
  const { t } = useTranslation('notifications');
  const bt = useBadgeText();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ notifications: AppNotification[]; unread: number }>('/notifications'),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readAll = useAction({
    fn: () => api.post('/notifications/read-all'),
    success: t('allRead'),
    invalidate: [['notifications']],
  });

  function sentence(n: AppNotification) {
    const d = n.data ?? {};
    const badgeKey = str(d, 'badgeKey', 'key', 'badge.key');
    const km = d.distanceKm;
    const vars = {
      name: n.actor?.displayName ?? str(d, 'name', 'fromName', 'displayName', 'actorName', 'actor.displayName', 'from.displayName', 'user.displayName') ?? t('someone'),
      group: str(d, 'groupName', 'group.name') ?? t('aGroup'),
      walk: str(d, 'walkTitle', 'walk.title', 'title') ?? t('aWalk'),
      badge: badgeKey ? bt.name(badgeKey, str(d, 'label', 'badgeLabel')) : t('aBadge'),
      challenge: str(d, 'challengeTitle', 'challenge.title', 'title') ?? t('aChallenge'),
      city: str(d, 'city') ?? t('yourArea'),
      km: typeof km === 'number' ? formatKm(km) : '',
    };
    if (n.type === 'walk_confirmed' && !vars.km) return t('types.walk_confirmed_nokm', vars);
    return t(`types.${n.type}`, { ...vars, defaultValue: t('types.unknown') });
  }

  const unread = q.data?.unread ?? 0;
  return (
    <div className="page-e page-e--narrow">
      <p>
        <Link to="/profil">
          <Icon name="arrowLeft" className="inline-icon" /> {t('backToProfile')}
        </Link>
      </p>
      <PageHeader title={t('title')} lead={t('lead')} />
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="notif-bar-e">
            <p className="notif-bar-e__count">{t('unread', { count: unread })}</p>
            <button type="button" className="btn btn--secondary" disabled={readAll.isPending || unread === 0} onClick={() => readAll.mutate(undefined)}>
              <Icon name="check" /> {t('markAllRead')}
            </button>
          </div>
          {q.data.notifications.length ? (
            <ul className="plain-list notif-list-e">
              {q.data.notifications.map((n) => {
                const link = linkFor(n);
                const isNew = !n.readAt;
                return (
                  <li key={n.id} className={`notif-e ${isNew ? 'notif-e--new' : ''}`}>
                    <Icon name={ICONS[n.type] ?? 'bell'} className="notif-e__icon" />
                    <div className="notif-e__body">
                      <p className="notif-e__text">
                        {isNew ? <span className="badge-pill notif-e__new">{t('new')}</span> : null} {sentence(n)}
                      </p>
                      <p className="notif-e__meta">
                        <time dateTime={n.createdAt}>{formatDateTime(n.createdAt)}</time>
                        {link ? (
                          <>
                            {' · '}
                            <Link to={link} onClick={() => isNew && markRead.mutate(n.id)}>{t(`open.${n.type}`, { defaultValue: t('open.default') })}</Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state">
              <Icon name="bell" />
              <p>{t('empty')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
