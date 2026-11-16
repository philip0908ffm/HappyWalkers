import '../../styles/pages-e.css';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { SharedBadge } from '../../api/types-e';
import { BadgeEmblem } from '../../components/BadgeEmblem';
import { Icon } from '../../components/Icon';
import { Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { useMe } from '../../hooks/useMe';
import { formatDateShort } from '../../lib/format';
import { useBadgeText } from './badgeText';

/** Öffentliche Ansicht eines geteilten Abzeichens (ohne Anmeldung). Zeigt nur Anzeigename, Abzeichen und Datum. */
export default function BadgeShare() {
  const { token = '' } = useParams();
  const { t } = useTranslation('badges');
  const bt = useBadgeText();
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ['badge-shared', token],
    queryFn: () => api.get<SharedBadge>(`/badges/shared/${encodeURIComponent(token)}`),
    retry: false,
  });

  // geteilte Seiten nicht in Suchmaschinen
  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex';
    document.head.appendChild(m);
    return () => m.remove();
  }, []);

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) {
    return (
      <div className="page-e page-e--narrow">
        <PageHeader title={t('shared.goneTitle')} lead={t('shared.goneText')} />
        <Link className="btn" to="/">
          {t('shared.toStart')}
        </Link>
      </div>
    );
  }
  const { displayName, badge } = q.data;
  const name = bt.name(badge.key, badge.label);

  return (
    <div className="page-e page-e--narrow shared-badge">
      <div className="shared-badge__frame">
        <BadgeEmblem kind={badge.kind} tier={badge.tier} size={220} label={t('shared.emblemAlt', { name, tier: bt.tier(badge.tier) })} />
        <PageHeader title={t('shared.title', { person: displayName, name })} />
        <p className="shared-badge__desc">{bt.description(badge.key, badge.label)}</p>
        <p className="shared-badge__meta">
          {bt.tier(badge.tier)} · {t('shared.earnedAt', { date: formatDateShort(badge.awardedAt) })}
        </p>
      </div>
      <section className="card stack" aria-labelledby="what-h">
        <h2 id="what-h">{t('shared.whatTitle')}</h2>
        <p>{t('shared.whatText')}</p>
        <div className="btn-row">
          {me ? (
            <Link className="btn" to="/abzeichen">
              <Icon name="badge" /> {t('shared.toMyShowcase')}
            </Link>
          ) : (
            <Link className="btn" to="/anmelden">
              <Icon name="arrowRight" /> {t('shared.join')}
            </Link>
          )}
          <Link className="btn btn--secondary" to="/gruppen">
            <Icon name="group" /> {t('shared.findGroups')}
          </Link>
        </div>
      </section>
    </div>
  );
}
