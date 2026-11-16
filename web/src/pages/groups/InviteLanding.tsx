import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { invitesApi, qk } from '../../api/walks';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useMe';

/** /einladung/:code – Einladungslink aus E-Mail, WhatsApp oder Aushang. */
export default function InviteLanding() {
  const { code = '' } = useParams();
  const { t } = useTranslation('groups');
  const { data: me, isLoading: meLoading } = useMe();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['invites', code], queryFn: () => invitesApi.get(code) });
  const accept = useAction({
    fn: () => invitesApi.accept(code),
    success: (r) => (r.membership.status === 'active' ? t('inviteLanding.joined') : t('join.requested')),
    invalidate: [qk.groups, qk.myGroups, qk.walks],
    onSuccess: (r) => navigate(`/gruppen/${r.groupId}`),
  });

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
  const back = `/einladung/${encodeURIComponent(code)}`;

  return (
    <div className="narrow">
      <PageHeader title={t('inviteLanding.title')} lead={t('inviteLanding.lead')} />
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

        {me ? (
          <>
            <p>{t('inviteLanding.ready', { name: me.displayName })}</p>
            <button type="button" className="btn btn--large" disabled={accept.isPending} onClick={() => accept.mutate(undefined)}>
              <Icon name="check" /> {accept.isPending ? t('common:status.sending') : t('inviteLanding.join')}
            </button>
          </>
        ) : (
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
