import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { groupsApi, isLead, locationParams, qk } from '../../api/walks';
import { Field } from '../../components/Field';
import { GroupList } from '../../components/GroupCard';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { PlaceSearch } from '../../components/PlaceSearch';
import { RadiusPicker } from '../../components/RadiusPicker';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useMe';
import { useSearchState } from '../../hooks/useSearchState';

export default function GroupsPage() {
  const { t } = useTranslation('groups');
  const { data: me } = useMe();
  const s = useSearchState();
  const canSearch = s.loc.type !== 'profile' || !!me?.postalCode;

  const params = locationParams(s.loc);
  params.set('radiusKm', String(s.radius));
  const q = useQuery({
    queryKey: [...qk.groups, 'search', params.toString()],
    queryFn: () => groupsApi.search(params),
    enabled: canSearch,
  });
  const groups = q.data?.groups ?? [];
  const nearest = q.data?.nearest ?? [];
  const center = q.data?.center;
  const centerLabel = s.usingCoords ? t('common:search.myLocation') : center ? `${center.postalCode} ${center.city}` : '';

  return (
    <>
      <PageHeader
        title={t('list.title')}
        lead={t('list.lead')}
        actions={
          <Link className="btn" to="/gruppen/neu">
            <Icon name="plus" /> {t('list.found')}
          </Link>
        }
      />

      {me ? <MyGroups /> : null}

      <div className="search-layout">
        <section className="search-panel card" aria-labelledby="group-filter-title">
          <h2 id="group-filter-title" className="search-panel__title">
            <Icon name="search" className="inline-icon" /> {t('list.searchTitle')}
          </h2>
          <PlaceSearch initialText={s.plz ?? ''} onSelect={s.setLocation} />
          <RadiusPicker value={s.radius} onChange={(km) => s.set({ umkreis: String(km) })} />
        </section>

        <section className="search-results" aria-labelledby="group-results-title">
          <h2 id="group-results-title" className="search-results__title">
            {t('list.resultsTitle')}
          </h2>
          <p className="search-results__count" role="status">
            {q.data
              ? centerLabel
                ? t('list.count', { count: groups.length, km: s.radius, place: centerLabel })
                : t('list.countNoPlace', { count: groups.length, km: s.radius })
              : ''}
          </p>
          {!canSearch ? (
            <div className="empty-state">
              <Icon name="pin" />
              <p>{t('walks:list.enterPlace')}</p>
            </div>
          ) : q.isLoading ? (
            <Loading />
          ) : q.error ? (
            <LoadError error={q.error} onRetry={() => q.refetch()} />
          ) : (
            <>
              {groups.length ? (
                <GroupList groups={groups} />
              ) : (
                <div className="empty-state">
                  <Icon name="group" />
                  <p>{t('list.empty')}</p>
                </div>
              )}
              {groups.length < 3 ? (
                <section className="nearest" aria-labelledby="group-nearest-title">
                  {nearest.length ? (
                    <>
                      <h3 id="group-nearest-title">{t('list.nearestTitle')}</h3>
                      <p>{t('list.nearestText', { km: s.radius })}</p>
                      <GroupList groups={nearest} headingLevel={4} />
                    </>
                  ) : (
                    <h3 id="group-nearest-title" className="visually-hidden">
                      {t('walks:list.ideasTitle')}
                    </h3>
                  )}
                  <div className="btn-row nearest__ideas">
                    <Link to="/gruppen/neu" className="btn">
                      <Icon name="plus" /> {t('list.foundOwn')}
                    </Link>
                    <Link to="/in-der-naehe" className="btn btn--secondary">
                      <Icon name="sparkles" /> {t('walks:list.ideasLink')}
                    </Link>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </section>
      </div>

      <JoinByCode />
    </>
  );
}

function MyGroups() {
  const { t } = useTranslation('groups');
  const q = useQuery({ queryKey: qk.myGroups, queryFn: groupsApi.mine });
  return (
    <section className="card my-groups" aria-labelledby="my-groups-title">
      <h2 id="my-groups-title">{t('list.mine')}</h2>
      {q.isLoading ? <Loading /> : null}
      {q.error ? <LoadError error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data && q.data.length === 0 ? <p>{t('list.mineEmpty')}</p> : null}
      {q.data && q.data.length ? (
        <ul className="plain-list link-list">
          {q.data.map((g) => (
            <li key={g.id}>
              <Link to={`/gruppen/${g.id}`} className="link-list__link">
                <Icon name="group" />
                <span>
                  <strong>{g.name}</strong>
                  <span className="link-list__sub">
                    {g.city}
                    {' · '}
                    {g.status === 'pending' ? t('status.pending') : g.status === 'banned' ? t('status.banned') : t(`role.${g.role}`)}
                  </span>
                </span>
                <Icon name="arrowRight" className="link-list__arrow" />
              </Link>
              {isLead(g.role) && g.status === 'active' ? (
                <Link to={`/gruppen/${g.id}/verwaltung`} className="link-list__extra">
                  <Icon name="settings" className="inline-icon" /> {t('list.manage', { name: g.name })}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function JoinByCode() {
  const { t } = useTranslation('groups');
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const join = useAction({
    fn: (c: string) => groupsApi.joinByCode(c),
    success: (r) => (r.membership.status === 'active' ? t('code.joined') : t('join.requested')),
    invalidate: [qk.groups, qk.myGroups],
    onSuccess: (r) => navigate(`/gruppen/${r.groupId}`),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length < 4) {
      setError(t('code.required'));
      return;
    }
    setError(null);
    if (!me) {
      navigate(`/anmelden?weiter=${encodeURIComponent(`/einladung/${c}`)}`);
      return;
    }
    if (!join.isPending) join.mutate(c);
  }
  return (
    <section className="card join-code" aria-labelledby="join-code-title">
      <h2 id="join-code-title">
        <Icon name="qr" className="inline-icon" /> {t('code.title')}
      </h2>
      <p>{t('code.text')}</p>
      <form onSubmit={onSubmit} noValidate className="inline-form">
        <Field label={t('code.label')} hint={t('code.hint')} error={error}>
          <input className="input input--short input--code" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <button type="submit" className="btn" disabled={join.isPending}>
          <Icon name="check" /> {join.isPending ? t('common:status.sending') : t('code.submit')}
        </button>
      </form>
    </section>
  );
}
