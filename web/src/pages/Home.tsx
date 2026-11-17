import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { groupsApi, isLead, qk, walksApi } from '../api/walks';
import { Icon, type IconName } from '../components/Icon';
import { Landscape } from '../components/Landscape';
import { LoadError, Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { PlaceSearch } from '../components/PlaceSearch';
import { WalkList } from '../components/WalkCard';
import { useMe } from '../hooks/useMe';

export default function Home() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  return me ? <HomeSignedIn /> : <HomeWelcome />;
}

/* ---------- Nicht angemeldet: warme Einladung ---------- */
function HomeWelcome() {
  const { t } = useTranslation('home');
  const navigate = useNavigate();
  return (
    <div className="home">
      <div className="home-hero">
        <Landscape variant="contours" />
        <div className="home-hero__inner">
          <div className="home-hero__text">
            <PageHeader title={t('welcome.title')} lead={t('welcome.lead')} />
            <div className="home-hero__search card">
              <h2 className="home-hero__search-title">{t('welcome.searchTitle')}</h2>
              <PlaceSearch
                allowLocation={false}
                submitLabel={t('welcome.searchButton')}
                onSelect={(loc) => {
                  if (loc.type === 'postal') navigate(`/walks?plz=${loc.postalCode}`);
                }}
              />
            </div>
            <p className="home-hero__signin">
              {t('welcome.haveAccount')}{' '}
              <Link className="btn btn--on-dark" to="/anmelden">
                <Icon name="user" /> {t('welcome.signIn')}
              </Link>
            </p>
          </div>
          <div className="home-hero__art" aria-hidden="true">
            <Landscape variant="hero" />
          </div>
        </div>
      </div>

      <section aria-labelledby="how-title" className="home-how">
        <h2 id="how-title">{t('welcome.howTitle')}</h2>
        <ol className="steps">
          {(['find', 'join', 'badge'] as const).map((k, i) => (
            <li key={k} className="step">
              <span className="step__num" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3>{t(`welcome.step_${k}`)}</h3>
                <p>{t(`welcome.step_${k}_text`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-promises" aria-labelledby="promise-title">
        <h2 id="promise-title">{t('welcome.promiseTitle')}</h2>
        <ul className="promise-list">
          {(['pace', 'free', 'privacy'] as const).map((k) => (
            <li key={k}>
              <Icon name={k === 'pace' ? 'people2' : k === 'free' ? 'heart' : 'lock'} />
              <span>{t(`welcome.promise_${k}`)}</span>
            </li>
          ))}
        </ul>
        <p>
          <Link to="/wer-sieht-was">{t('welcome.whoSeesWhat')}</Link>
        </p>
      </section>
    </div>
  );
}

/* ---------- Angemeldet: persönliche Übersicht ---------- */
function HomeSignedIn() {
  const { t } = useTranslation('home');
  const { data: me } = useMe();
  const myGroupsQ = useQuery({ queryKey: qk.myGroups, queryFn: groupsApi.mine });

  // Eigene nächste Walks (zugesagt oder selbst erstellt, alle Arten) – eine Abfrage: GET /walks?mine=1
  const mineQ = useQuery({
    queryKey: [...qk.walks, 'mine'],
    queryFn: () => walksApi.search(new URLSearchParams({ mine: '1' })),
  });
  const nextWalks = (mineQ.data?.walks ?? []).filter((w) => w.status === 'planned').slice(0, 3);

  const nearbyQ = useQuery({
    queryKey: [...qk.groups, 'search', 'home'],
    queryFn: () => groupsApi.search(new URLSearchParams({ radiusKm: '15' })),
    enabled: !!me?.postalCode,
  });
  const noGroupNearby = nearbyQ.data && nearbyQ.data.groups.length === 0;

  const tiles: { to: string; icon: IconName; label: string; text: string }[] = [
    { to: '/walk-eintragen', icon: 'plus', label: t('home.tileLog'), text: t('home.tileLogText') },
    { to: '/walks', icon: 'search', label: t('home.tileFind'), text: t('home.tileFindText') },
    { to: '/gruppen', icon: 'group', label: t('home.tileGroups'), text: t('home.tileGroupsText') },
  ];

  return (
    <div className="home">
      <PageHeader title={t('home.hello', { name: me?.displayName ?? '' })} lead={t('home.lead')} />

      <nav aria-label={t('home.quickLabel')}>
        <ul className="plain-list quick-tiles">
          {tiles.map((tile) => (
            <li key={tile.to}>
              <Link to={tile.to} className="quick-tile">
                <Icon name={tile.icon} />
                <span className="quick-tile__label">{tile.label}</span>
                <span className="quick-tile__text">{tile.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="home-columns">
        <section className="section-block" aria-labelledby="next-title">
          <div className="section-head">
            <h2 id="next-title">
              <Icon name="calendar" className="inline-icon" /> {t('home.nextTitle')}
            </h2>
          </div>
          {mineQ.isLoading ? (
            <Loading />
          ) : mineQ.error ? (
            <LoadError error={mineQ.error} onRetry={() => mineQ.refetch()} />
          ) : nextWalks.length ? (
            <WalkList walks={nextWalks} />
          ) : (
            <>
              <p>{t('home.nextEmpty')}</p>
              <Link className="btn" to="/walks">
                <Icon name="search" /> {t('home.tileFind')}
              </Link>
            </>
          )}
        </section>

        <section className="card" aria-labelledby="groups-title">
          <h2 id="groups-title">
            <Icon name="group" className="inline-icon" /> {t('home.groupsTitle')}
          </h2>
          {myGroupsQ.isLoading ? <Loading /> : null}
          {myGroupsQ.error ? <LoadError error={myGroupsQ.error} onRetry={() => myGroupsQ.refetch()} /> : null}
          {myGroupsQ.data && myGroupsQ.data.length === 0 ? <p>{t('home.groupsEmpty')}</p> : null}
          {myGroupsQ.data && myGroupsQ.data.length ? (
            <ul className="plain-list link-list">
              {myGroupsQ.data.map((g) => (
                <li key={g.id}>
                  <Link to={`/gruppen/${g.id}`} className="link-list__link">
                    <Icon name="group" />
                    <span>
                      <strong>{g.name}</strong>
                      <span className="link-list__sub">
                        {g.city}
                        {g.status === 'pending' ? ` · ${t('groups:status.pending')}` : isLead(g.role) ? ` · ${t(`groups:role.${g.role}`)}` : ''}
                      </span>
                    </span>
                    <Icon name="arrowRight" className="link-list__arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="btn-row">
            <Link className="btn btn--secondary" to="/gruppen">
              <Icon name="search" /> {t('home.findGroups')}
            </Link>
          </div>
        </section>
      </div>

      {noGroupNearby ? (
        <section className="card card--warm" aria-labelledby="rural-title">
          <h2 id="rural-title">
            <Icon name="sparkles" className="inline-icon" /> {t('home.ruralTitle')}
          </h2>
          <p>{t('home.ruralText')}</p>
          <div className="btn-row">
            <Link className="btn" to="/in-der-naehe">
              {t('home.ruralLink')} <Icon name="arrowRight" />
            </Link>
            <Link className="btn btn--secondary" to="/gruppen/neu">
              <Icon name="plus" /> {t('home.ruralFound')}
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
