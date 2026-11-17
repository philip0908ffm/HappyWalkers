import '../../styles/pages-e.css';
import { PREMIUM } from '@happywalkers/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { PremiumStatus, Subscription } from '../../api/types-e';
import { Icon, type IconName } from '../../components/Icon';
import { Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { PremiumTag } from '../../components/PremiumTag';
import { useAction } from '../../hooks/useAction';
import { useConfig, useMe } from '../../hooks/useMe';
import { formatDateShort, formatPrice } from '../../lib/format';
import { ConfirmDialogE } from '../profile/parts/ConfirmDialogE';

const FEATURES: { key: string; icon: IconName }[] = [
  { key: 'stats', icon: 'chart' },
  { key: 'tempo', icon: 'clock' },
  { key: 'goals', icon: 'trophy' },
  { key: 'yearReview', icon: 'calendar' },
  { key: 'shareCard', icon: 'photo' },
];

export default function PremiumPage() {
  const { t } = useTranslation('premiumPage');
  const { data: me, isLoading: meLoading } = useMe();
  const { data: config } = useConfig();
  const [dialog, setDialog] = useState<'subscribe' | 'cancel' | null>(null);

  const status = useQuery({
    queryKey: ['premium', 'status'],
    queryFn: () => api.get<PremiumStatus>('/premium/status'),
    enabled: !!me,
  });

  const price = status.data?.price ?? config?.premium ?? PREMIUM;
  const priceText = t('price.amount', { price: formatPrice(price.priceCents, price.currency), interval: t(`price.interval_${price.interval}`, { defaultValue: price.interval }) });
  const sub: Subscription | null = status.data?.subscription ?? me?.subscription ?? null;
  const isPremium = status.data?.premium ?? me?.premium ?? false;

  const subscribe = useAction({
    fn: () => api.post<{ subscription: Subscription }>('/premium/subscribe'),
    success: t('subscribe.done'),
    invalidate: [['me'], ['premium']],
    onSuccess: () => setDialog(null),
  });
  const cancel = useAction({
    fn: () => api.post<{ subscription: Subscription }>('/premium/cancel'),
    success: (r) => t('cancel.done', { date: formatDateShort(r.subscription.currentPeriodEnd) }),
    invalidate: [['me'], ['premium']],
    onSuccess: () => setDialog(null),
  });
  const resume = useAction({
    fn: () => api.post<{ subscription: Subscription }>('/premium/resume'),
    success: t('resume.done'),
    invalidate: [['me'], ['premium']],
  });

  return (
    <div className="page-e page-e--narrow">
      <PageHeader title={t('title')} lead={t('lead')} />

      <section className="card premium-price" aria-labelledby="price-h">
        <h2 id="price-h" className="visually-hidden">
          {t('price.title')}
        </h2>
        <PremiumTag />
        <p className="premium-price__amount">{priceText}</p>
        <ul className="premium-promises plain-list">
          <li>
            <Icon name="check" /> {t('promise.cancel')}
          </li>
          <li>
            <Icon name="check" /> {t('promise.noTrial')}
          </li>
          <li>
            <Icon name="check" /> {t('promise.noAds')}
          </li>
        </ul>
      </section>

      <p className="notice notice--success free-promise">
        <Icon name="heart" />
        <strong>{t('promise.free')}</strong>
      </p>

      <section className="card stack" aria-labelledby="feat-h">
        <h2 id="feat-h">{t('features.title')}</h2>
        <ul className="feature-list plain-list">
          {FEATURES.map((f) => (
            <li key={f.key}>
              <Icon name={f.icon} />
              <span>
                <strong>{t(`features.${f.key}`)}</strong>
                {t(`features.${f.key}_hint`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack" aria-labelledby="act-h">
        <h2 id="act-h">{t('action.title')}</h2>
        {meLoading || (me && status.isLoading) ? (
          <Loading />
        ) : !me ? (
          <>
            <p>{t('action.signInFirst')}</p>
            <Link className="btn btn--large" to="/anmelden?weiter=%2Fpremium">
              {t('action.signIn')}
            </Link>
          </>
        ) : isPremium && sub?.cancelAtPeriodEnd ? (
          <>
            <p className="notice notice--warning">
              <Icon name="info" />
              <span>{t('status.cancelled', { date: formatDateShort(sub.currentPeriodEnd) })}</span>
            </p>
            <button type="button" className="btn" disabled={resume.isPending} onClick={() => resume.mutate(undefined)}>
              <Icon name="check" /> {resume.isPending ? t('common:status.saving') : t('resume.button')}
            </button>
            <p className="field__hint">{t('resume.hint')}</p>
          </>
        ) : isPremium ? (
          <>
            <p className="notice notice--premium">
              <Icon name="star" />
              <span>{sub ? t('status.active', { date: formatDateShort(sub.currentPeriodEnd), price: priceText }) : t('status.activeNoDate')}</span>
            </p>
            <Link className="btn" to="/fortschritt">
              <Icon name="chart" /> {t('action.toProgress')}
            </Link>
            <h3>{t('cancel.title')}</h3>
            <p>{t('cancel.intro')}</p>
            <button type="button" className="btn btn--secondary" onClick={() => setDialog('cancel')}>
              <Icon name="close" /> {t('cancel.button')}
            </button>
          </>
        ) : (
          <>
            <p>{t('action.intro')}</p>
            <button type="button" className="btn btn--large" onClick={() => setDialog('subscribe')}>
              <Icon name="star" /> {t('subscribe.button', { price: priceText })}
            </button>
          </>
        )}
      </section>

      <ConfirmDialogE
        open={dialog === 'subscribe'}
        title={t('subscribe.title')}
        confirmLabel={t('subscribe.confirm', { price: priceText })}
        pending={subscribe.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => subscribe.mutate(undefined)}
      >
        <ul>
          <li>{t('subscribe.point1', { price: priceText })}</li>
          <li>{t('subscribe.point2')}</li>
          <li>{t('subscribe.point3')}</li>
        </ul>
        {config?.billingProvider === 'dev' ? (
          <p className="notice notice--info">
            <Icon name="info" /> {t('subscribe.devHint')}
          </p>
        ) : null}
      </ConfirmDialogE>

      <ConfirmDialogE
        open={dialog === 'cancel'}
        title={t('cancel.dialogTitle')}
        confirmLabel={t('cancel.confirm')}
        cancelLabel={t('cancel.keep')}
        pending={cancel.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => cancel.mutate(undefined)}
      >
        <p>{t('cancel.whatHappens')}</p>
        <ul>
          <li>{sub ? t('cancel.point1', { date: formatDateShort(sub.currentPeriodEnd) }) : t('cancel.point1NoDate')}</li>
          <li>{t('cancel.point2')}</li>
          <li>{t('cancel.point3')}</li>
          <li>{t('cancel.point4')}</li>
        </ul>
      </ConfirmDialogE>
    </div>
  );
}
