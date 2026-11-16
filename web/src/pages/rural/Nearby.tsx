import '../../styles/pages-e.css';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Interest, RuralOverview } from '../../api/types-e';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useMe';
import { formatDateTime, formatKm } from '../../lib/format';
import { ConfirmDialogE } from '../profile/parts/ConfirmDialogE';
import { DistanceSection } from './DistanceSection';
import { PartnerSection } from './PartnerSection';

const RADII = [15, 30, 50] as const;

export default function Nearby() {
  const { t } = useTranslation('rural');
  const [radius, setRadius] = useState<number>(15);
  const overview = useQuery({
    queryKey: ['rural', 'overview', radius],
    queryFn: () => api.get<RuralOverview>(`/rural/overview?radiusKm=${radius}`),
    placeholderData: (prev) => prev,
  });
  const o = overview.data;

  return (
    <div className="page-e">
      <PageHeader title={t('title')} lead={t('lead')} />

      <nav aria-label={t('onThisPage')} className="toc-e">
        <h2 className="toc-e__title">{t('onThisPage')}</h2>
        <ul>
          <li><a href="#umkreis">{t('radius.title')}</a></li>
          <li><a href="#gehpartner">{t('partner.title')}</a></li>
          <li><a href="#distanz">{t('distance.title')}</a></li>
          <li><a href="#interesse">{t('interest.title')}</a></li>
          <li><a href="#gruenden">{t('found.title')}</a></li>
        </ul>
      </nav>

      <section id="umkreis" aria-labelledby="umkreis-h" className="card stack section-e">
        <h2 id="umkreis-h">{t('radius.title')}</h2>
        <fieldset className="field">
          <legend>{t('radius.legend')}</legend>
          <div className="choice-list choice-list--row">
            {RADII.map((r) => (
              <label key={r} className="choice">
                <input type="radio" name="radius" checked={radius === r} onChange={() => setRadius(r)} />
                {t('radius.option', { km: r })}
              </label>
            ))}
          </div>
        </fieldset>
        {overview.isLoading ? (
          <Loading />
        ) : overview.isError || !o ? (
          <LoadError error={overview.error} onRetry={() => overview.refetch()} />
        ) : (
          <div aria-live="polite" className="stack">
            <p className="summary-e">
              {t('radius.summary', {
                km: radius,
                city: o.center?.city ?? '',
                groups: t('radius.groups', { count: o.groupsInRadius }),
                walks: t('radius.walks', { count: o.walksInRadius }),
                partners: t('radius.partners', { count: o.partnersNearby }),
              })}
            </p>
            {o.groupsInRadius > 0 ? (
              <Link to="/gruppen" className="btn">
                <Icon name="group" /> {t('radius.showGroups')}
              </Link>
            ) : null}
            {o.nearestTown ? (
              <p>
                <Icon name="pin" className="inline-icon" />{' '}
                {t('radius.nearestTown', { city: o.nearestTown.city, km: formatKm(o.nearestTown.distanceKm, 0) })}
              </p>
            ) : null}
            {o.nearestGroups.length ? (
              <>
                <h3>{t('radius.nearestTitle')}</h3>
                <ul className="plain-list group-list-e">
                  {o.nearestGroups.map((g) => (
                    <li key={g.id} className="group-row-e">
                      <Link to={`/gruppen/${g.id}`} className="group-row-e__name">
                        {g.name}
                      </Link>
                      <span>
                        {[g.city, g.distanceKm != null ? t('radius.away', { km: formatKm(g.distanceKm, 0) }) : null, t('radius.members', { count: g.memberCount })]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {g.nextWalk ? <span>{t('radius.nextWalk', { when: formatDateTime(g.nextWalk.startsAt) })}</span> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        )}
      </section>

      <PartnerSection radius={radius} />
      <DistanceSection walks={o?.distanceWalks ?? null} loading={overview.isLoading} />
      <InterestSection />

      <section id="gruenden" aria-labelledby="gruenden-h" className="card stack section-e">
        <h2 id="gruenden-h">{t('found.title')}</h2>
        <p>{t('found.text')}</p>
        <ul>
          <li>{t('found.point1')}</li>
          <li>{t('found.point2')}</li>
          <li>{t('found.point3')}</li>
        </ul>
        <Link to="/gruppen/neu" className="btn">
          <Icon name="plus" /> {t('found.button')}
        </Link>
      </section>
    </div>
  );
}

function InterestSection() {
  const { t } = useTranslation('rural');
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['rural', 'interest'], queryFn: () => api.get<{ interest: Interest | null }>('/rural/interest').then((r) => r.interest) });
  const [plz, setPlz] = useState(me?.postalCode ?? '');
  const [radius, setRadius] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useAction({
    fn: () => api.put<{ interest: Interest }>('/rural/interest', { postalCode: plz, radiusKm: radius }),
    success: t('interest.saved'),
    invalidate: [['rural']],
  });
  const del = useAction({
    fn: () => api.del('/rural/interest'),
    success: t('interest.deleted'),
    invalidate: [['rural']],
    onSuccess: () => setConfirmDelete(false),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{5}$/.test(plz)) {
      setError(t('interest.plzInvalid'));
      document.getElementById('interest-plz')?.focus();
      return;
    }
    setError(null);
    if (!save.isPending) save.mutate(undefined);
  }

  return (
    <section id="interesse" aria-labelledby="interesse-h" className="card stack section-e">
      <h2 id="interesse-h">{t('interest.title')}</h2>
      <p>{t('interest.text')}</p>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <>
          <p className="notice notice--success">
            <Icon name="check" />
            <span>{t('interest.active', { city: q.data.city || q.data.postalCode, km: q.data.radiusKm })}</span>
          </p>
          {me && !me.settings.emailNotifications ? (
            <p className="notice notice--warning">
              <Icon name="warning" />
              <span>
                {t('interest.mailsOff')} <Link to="/profil/einstellungen">{t('interest.toSettings')}</Link>
              </span>
            </p>
          ) : null}
          <button type="button" className="btn btn--secondary" onClick={() => setConfirmDelete(true)}>
            <Icon name="close" /> {t('interest.delete')}
          </button>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <Field label={t('interest.plz')} error={error}>
            <input
              id="interest-plz"
              className="input input--short"
              inputMode="numeric"
              maxLength={5}
              autoComplete="postal-code"
              value={plz}
              onChange={(e) => setPlz(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <fieldset className="field">
            <legend>{t('interest.radius')}</legend>
            <div className="choice-list choice-list--row">
              {RADII.map((r) => (
                <label key={r} className="choice">
                  <input type="radio" name="interest-radius" checked={radius === r} onChange={() => setRadius(r)} />
                  {t('radius.option', { km: r })}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="field__hint">{t('interest.privacy')}</p>
          <button type="submit" className="btn" disabled={save.isPending}>
            <Icon name="mail" /> {save.isPending ? t('common:status.saving') : t('interest.submit')}
          </button>
        </form>
      )}
      <ConfirmDialogE
        open={confirmDelete}
        title={t('interest.deleteTitle')}
        confirmLabel={t('interest.deleteConfirm')}
        pending={del.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate(undefined)}
      >
        <p>{t('interest.deleteText')}</p>
      </ConfirmDialogE>
    </section>
  );
}
