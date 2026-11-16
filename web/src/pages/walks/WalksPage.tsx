import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { WalkSummary } from '../../api/types-walks';
import { locationParams, qk, walksApi } from '../../api/walks';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { MapView } from '../../components/MapView';
import { PageHeader } from '../../components/PageHeader';
import { PlaceSearch } from '../../components/PlaceSearch';
import { RadiusPicker } from '../../components/RadiusPicker';
import { TabPanel, Tabs } from '../../components/Tabs';
import { TempoPicker } from '../../components/Tempo';
import { WalkList } from '../../components/WalkCard';
import { useMe } from '../../hooks/useMe';
import { useSearchState } from '../../hooks/useSearchState';
import { formatDate, formatTime } from '../../lib/format';

export default function WalksPage() {
  const { t } = useTranslation('walks');
  const { data: me } = useMe();
  const s = useSearchState();
  const canSearch = s.loc.type !== 'profile' || !!me?.postalCode;

  const params = locationParams(s.loc);
  params.set('radiusKm', String(s.radius));
  if (s.tempo) params.set('tempo', s.tempo);

  const q = useQuery({
    queryKey: [...qk.walks, 'search', params.toString()],
    queryFn: () => walksApi.search(params),
    enabled: canSearch,
  });

  const walks = q.data?.walks ?? [];
  const nearest = q.data?.nearest ?? [];
  const center = q.data?.center ?? null;
  const centerLabel = s.usingCoords ? t('common:search.myLocation') : center ? `${center.postalCode} ${center.city}` : '';

  return (
    <>
      <PageHeader
        title={t('list.title')}
        lead={t('list.lead')}
        actions={
          me ? (
            <>
              <Link className="btn btn--secondary" to="/walk-eintragen">
                <Icon name="plus" /> {t('list.logWalk')}
              </Link>
              <Link className="btn btn--secondary" to="/walks/neu">
                <Icon name="calendar" /> {t('list.newWalk')}
              </Link>
            </>
          ) : null
        }
      />

      <div className="search-layout">
        <section className="search-panel card" aria-labelledby="walk-filter-title">
          <h2 id="walk-filter-title" className="search-panel__title">
            <Icon name="search" className="inline-icon" /> {t('list.filterTitle')}
          </h2>
          <PlaceSearch initialText={s.plz ?? ''} onSelect={s.setLocation} />
          <RadiusPicker value={s.radius} onChange={(km) => s.set({ umkreis: String(km) })} />
          <TempoPicker name="tempo-filter" value={s.tempo} onChange={(v) => s.set({ tempo: v })} allowAny compact />
        </section>

        <section className="search-results" aria-labelledby="walk-results-title">
          <h2 id="walk-results-title" className="search-results__title">
            {t('list.resultsTitle')}
          </h2>
          <p className="search-results__count" role="status">
            {q.data
              ? centerLabel
                ? t('list.count', { count: walks.length, km: s.radius, place: centerLabel })
                : t('list.countNoPlace', { count: walks.length, km: s.radius })
              : ''}
          </p>
          {!canSearch ? (
            <div className="empty-state">
              <Icon name="pin" />
              <p>{t('list.enterPlace')}</p>
            </div>
          ) : q.isLoading ? (
            <Loading />
          ) : q.error ? (
            <LoadError error={q.error} onRetry={() => q.refetch()} />
          ) : (
            <>
              <Tabs
                id="walk-view"
                label={t('list.viewLabel')}
                selected={s.view}
                onSelect={(v) => s.set({ ansicht: v === 'liste' ? null : v })}
                tabs={[
                  { key: 'liste', label: t('list.viewList'), icon: 'list' },
                  { key: 'karte', label: t('list.viewMap'), icon: 'map' },
                ]}
              />
              <TabPanel id="walk-view" tabKey="liste" selected={s.view}>
                {walks.length ? <WalkList walks={walks} /> : <NoResults />}
              </TabPanel>
              <TabPanel id="walk-view" tabKey="karte" selected={s.view}>
                <WalkMap walks={walks} center={s.loc.type === 'coords' ? s.loc : center} />
                {walks.length === 0 ? <NoResults /> : null}
              </TabPanel>

              {walks.length < 3 ? (
                <section className="nearest" aria-labelledby="walk-nearest-title">
                  {nearest.length ? (
                    <>
                      <h3 id="walk-nearest-title">{t('list.nearestTitle')}</h3>
                      <p>{t('list.nearestText', { km: s.radius })}</p>
                      <WalkList walks={nearest} headingLevel={4} />
                    </>
                  ) : (
                    <h3 id="walk-nearest-title" className="visually-hidden">
                      {t('list.ideasTitle')}
                    </h3>
                  )}
                  <p className="nearest__ideas">
                    <Link to="/in-der-naehe" className="btn btn--secondary">
                      <Icon name="sparkles" /> {t('list.ideasLink')}
                    </Link>
                  </p>
                </section>
              ) : null}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function NoResults() {
  const { t } = useTranslation('walks');
  return (
    <div className="empty-state">
      <Icon name="walk" />
      <p>{t('list.empty')}</p>
    </div>
  );
}

/** Karte + gleichwertige Liste der Orte darunter (Tastatur, Screenreader). */
export function WalkMap({ walks, center }: { walks: WalkSummary[]; center: { lat: number; lon: number } | null }) {
  const { t } = useTranslation('walks');
  const points = walks
    .filter((w) => w.lat != null && w.lon != null)
    .map((w) => ({
      id: w.id,
      lat: w.lat!,
      lon: w.lon!,
      title: w.title,
      subtitle: `${formatDate(w.startsAt)}, ${formatTime(w.startsAt)}`,
      href: `/walks/${w.id}`,
      tempo: w.tempo,
    }));
  const withoutPlace = walks.length - points.length;
  return (
    <div className="map-layout">
      <MapView points={points} center={center} label={t('list.mapLabel')} />
      {walks.length ? (
        <div className="map-layout__list">
          <h3>{t('list.mapListTitle')}</h3>
          <ol className="map-list">
            {walks.map((w) => (
              <li key={w.id}>
                <Link to={`/walks/${w.id}`}>{w.title}</Link>
                <span>
                  {formatDate(w.startsAt)}, {formatTime(w.startsAt)}
                  {w.city ? ` · ${w.city}` : ''}
                </span>
              </li>
            ))}
          </ol>
          {withoutPlace > 0 ? <p className="field__hint">{t('list.mapWithoutPlace', { count: withoutPlace })}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
