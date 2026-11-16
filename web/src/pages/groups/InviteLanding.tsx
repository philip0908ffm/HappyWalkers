import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { invitesApi, qk } from '../../api/walks';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useMe';

/**
 * /einladung/:code – Einladungslink aus E-Mail, WhatsApp oder Aushang.
 * Beitreten bleibt ein bewusster Klick (Zustimmung). Angemeldete sehen den Knopf groß oben;
 * nach der Rückkehr von der Anmeldung (`?zurueck=1`) liegt der Fokus direkt auf „Gruppe beitreten“.
 */
export default function InviteLanding() {
  const { code = '' } = useParams();
  const { t } = useTranslation('groups');
  const { data: me, isLoading: meLoading } = useMe();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const returned = params.get('zurueck') === '1';
  const joinRef = useRef<HTMLButtonElement>(null);
  const q = useQuery({ queryKey: ['invites', code], queryFn: () => invitesApi.get(code) });
  const accept = useAction({
    fn: () => invitesApi.accept(code),
    success: (r) => (r.membership.status === 'active' ? t('inviteLanding.joined') : t('join.requested')),
    invalidate: [qk.groups, qk.myGroups, qk.walks],
    onSuccess: (r) => navigate(`/gruppen/${r.groupId}`),
  });

  const ready = !!me && !!q.data?.valid && !!q.data.group;
  useEffect(() => {
    if (!ready || !returned) return;
    joinRef.current?.focus();
    // Merkmal aus der Adresse entfernen (Neuladen setzt den Fokus nicht noch einmal)
    setParams({}, { replace: true });
  }, [ready, returned, setParams]);

  if (q.isLoading || meLoading) return <Loading />;
  if (q.error)
    return (
      <>
        <PageHeader title={t('inviteLanding.title')} />
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      </>
    );
  const data = q.data!;
  if (!data.valid || !data.group)
    return (
      <div className="narrow">
        <PageHeader title={t('inviteLanding.invalidTitle')} />
        <div className="notice notice--warning">
          <Icon name="warning" />
          <p>{t('common:errors.invite_invalid')}</p>
        </div>
        <Link className="btn btn--secondary" to="/gruppen">
          <Icon name="search" /> {t('inviteLanding.findOther')}
        </Link>
      </div>
    );
  const g = data.group;
  const back = `/einladung/${encodeURIComponent(code)}?zurueck=1`;

  return (
    <div className="narrow">
      <PageHeader title={t('inviteLanding.title')} lead={t('inviteLanding.lead')} />
      {me ? (
        <section className="card invite-landing invite-landing__join" aria-labelledby="inv-join">
          <h2 id="inv-join">{t('inviteLanding.joinTitle')}</h2>
          <p id="inv-ready">{t('inviteLanding.ready', { name: me.displayName })}</p>
          <button
            ref={joinRef}
            type="button"
            className="btn btn--large"
            aria-describedby="inv-ready"
            disabled={accept.isPending}
            onClick={() => accept.mutate(undefined)}
          >
            <Icon name="check" /> {accept.isPending ? t('common:status.sending') : t('inviteLanding.join')}
          </button>
        </section>
      ) : null}
      <section className="card invite-landing" aria-labelledby="inv-group">
        <div className="group-hero group-hero--compact">
          <div className="group-hero__photo">{g.photoUrl ? <img src={g.photoUrl} alt="" /> : <Icon name="group" />}</div>
          <div>
            <h2 id="inv-group">{g.name}</h2>
            <p className="walk-card__meta">
              <span>
                <Icon name="pin" className="inline-icon" /> {g.city}
              </span>
              <span>
                <Icon name="people2" className="inline-icon" /> {t('members', { count: g.memberCount })}
              </span>
              {g.womenOnly ? (
                <span>
                  <Icon name="user" className="inline-icon" /> {t('womenOnly')}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        {g.description ? <p className="pre-line">{g.description}</p> : null}
        {g.womenOnly ? (
          <div className="notice notice--info">
            <Icon name="info" />
            <p>{t('detail.womenOnlyInfo')}</p>
          </div>
        ) : null}

        {me ? null : (
          <>
            <p>{t('inviteLanding.signInText')}</p>
            <Link className="btn btn--large" to={`/anmelden?weiter=${encodeURIComponent(back)}`}>
              <Icon name="user" /> {t('inviteLanding.signIn')}
            </Link>
            <p className="field__hint">{t('inviteLanding.noPassword')}</p>
          </>
        )}
      </section>
    </div>
  );
}
