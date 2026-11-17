import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import type { GroupSummary } from '../api/types-walks';
import { groupsApi, qk } from '../api/walks';
import { useAction } from '../hooks/useAction';
import { useMe } from '../hooks/useMe';
import { Field } from './Field';
import { Icon } from './Icon';

/**
 * Beitreten-Bereich einer Gruppe – erklärt die Beitrittsregel in Worten:
 * offen → sofort Mitglied; auf Anfrage → Nachricht an die Leitung; nur mit Einladung → Hinweis.
 */
export function JoinGroup({
  group,
  onJoined,
  compact = false,
}: {
  group: Pick<GroupSummary, 'id' | 'name' | 'joinPolicy' | 'womenOnly' | 'myMembership'>;
  onJoined?: (status: string) => void;
  /** Zweite Stelle auf derselben Seite (z. B. Kasten „Mitgehen“): ohne Nachrichtenfeld, damit es nicht doppelt erscheint. */
  compact?: boolean;
}) {
  const { t } = useTranslation('groups');
  const { data: me } = useMe();
  const location = useLocation();
  const [message, setMessage] = useState('');
  const join = useAction({
    fn: () => groupsApi.join(group.id, message.trim() || undefined),
    success: (r) => (r.membership.status === 'active' ? t('join.joined', { name: group.name }) : t('join.requested')),
    invalidate: [qk.groups, qk.myGroups, qk.walks],
    onSuccess: (r) => onJoined?.(r.membership.status),
  });

  const status = group.myMembership?.status;
  if (status === 'active') return null;
  if (status === 'pending')
    return (
      <div className="notice notice--info" role="status">
        <Icon name="clock" />
        <p>{t('join.pendingInfo')}</p>
      </div>
    );
  if (status === 'banned')
    return (
      <div className="notice notice--info">
        <Icon name="info" />
        <p>{t('common:errors.banned')}</p>
      </div>
    );

  if (!me)
    return (
      <div className="join-box">
        <p>{t('join.signInFirst')}</p>
        <Link className="btn btn--large" to={`/anmelden?weiter=${encodeURIComponent(location.pathname)}`}>
          <Icon name="user" /> {t('join.signInAndJoin')}
        </Link>
      </div>
    );

  if (group.joinPolicy === 'invite')
    return (
      <div className="notice notice--info">
        <Icon name="lock" />
        <p>{t('joinPolicy.invite_explain')}</p>
      </div>
    );

  const womenBlocked = group.womenOnly && me.gender !== 'woman';

  return (
    <div className="join-box">
      <p>{t(`joinPolicy.${group.joinPolicy}_explain`)}</p>
      {womenBlocked ? (
        <div className="notice notice--warning">
          <Icon name="info" />
          <p>
            {t('join.womenOnlyHint')} <Link to="/profil">{t('join.toProfile')}</Link>
          </p>
        </div>
      ) : null}
      {group.joinPolicy === 'request' && !compact ? (
        <Field label={t('join.messageLabel')} hint={t('join.messageHint')} optional>
          <textarea className="textarea textarea--short" value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      ) : null}
      <button type="button" className="btn btn--large" disabled={join.isPending} onClick={() => join.mutate(undefined)}>
        <Icon name={group.joinPolicy === 'request' ? 'mail' : 'plus'} />{' '}
        {join.isPending ? t('common:status.sending') : group.joinPolicy === 'request' ? t('join.request') : t('join.join')}
      </button>
    </div>
  );
}
