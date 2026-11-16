import '../../styles/pages-e.css';
import { badgeDefinition } from '@gehmeinsam/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, apiUrl } from '../../api/client';
import type { Goal, PremiumStats, YearReview } from '../../api/types-e';
import { BadgeEmblem } from '../../components/BadgeEmblem';
import { BarChart, LineChart } from '../../components/BarChart';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { PremiumTag } from '../../components/PremiumTag';
import { ProgressBar } from '../../components/ProgressBar';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useMe';
import { formatDateShort, formatDuration, formatKm } from '../../lib/format';
import { parseKm, tempoWord } from '../activities/util';
import { useBadgeText } from '../badges/badgeText';

type Range = 'week' | 'month' | 'year';

const MONTH_SHORT = new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric', timeZone: 'UTC' });
/** Abschnitts-Bezeichnung der API lesbar machen: „2026-W47“ → „KW 47 (2026)“, „2026-11“ → „Nov. 2026“ */
function periodLabel(label: string, weekWord: string): string {
  const w = /^(\d{4})-W(\d{1,2})$/.exec(label);
  if (w) return `${weekWord} ${parseInt(w[2], 10)} (${w[1]})`;
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (m) return MONTH_SHORT.format(new Date(Date.UTC(+m[1], +m[2] - 1, 15)));
  return label;
}

export default function ProgressPage() {
  const { t } = useTranslation('premiumPage');
  const { data: me } = useMe();
  if (!me) return <Loading />;

  if (!me.premium) {
    return (
      <div className="page-e page-e--narrow">
        <PageHeader title={t('progress.title')} />
        <section className="card stack" aria-labelledby="np-h">
          <h2 id="np-h">
            {t('progress.noPremiumTitle')} <PremiumTag />
          </h2>
          <p>{t('progress.noPremiumText')}</p>
          <ul>
            <li>{t('features.stats')}</li>
            <li>{t('features.tempo')}</li>
            <li>{t('features.goals')}</li>
            <li>{t('features.yearReview')}</li>
            <li>{t('features.shareCard')}</li>
          </ul>
          <p className="notice notice--success">
            <Icon name="heart" /> {t('promise.free')}
          </p>
          <div className="btn-row">
            <Link to="/premium" className="btn">
              <Icon name="star" /> {t('progress.toPremium')}
            </Link>
            <Link to="/abzeichen" className="btn btn--secondary">
              <Icon name="badge" /> {t('progress.toShowcaseFree')}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-e">
      <PageHeader title={t('progress.title')} lead={t('progress.lead')} />
      <Stats />
      <Goals />
      <YearReviewSection />
      <ShareCard />
    </div>
  );
}

function Stats() {
  const { t } = useTranslation('premiumPage');
  const [range, setRange] = useState<Range>('month');
  const q = useQuery({
    queryKey: ['premium', 'stats', range],
    queryFn: () => api.get<PremiumStats>(`/premium/stats?range=${range}`),
    placeholderData: (p) => p,
  });
  const d = q.data;
  const lbl = (l: string) => periodLabel(l, t('stats.weekShort'));
  const kmData = (d?.series ?? []).map((s) => ({ label: lbl(s.label), value: s.km ?? 0 }));
  const walksData = (d?.series ?? []).map((s) => ({ label: lbl(s.label), value: s.walks ?? 0 }));
  const speedData = (d?.speedTrend ?? []).map((s) => ({ label: lbl(s.label), value: s.avgSpeedKmh ?? 0 }));
  const avgSpeed = d?.totals.avgSpeedKmh ?? 0;
  const best = kmData.reduce<{ label: string; value: number } | null>((a, b) => (!a || b.value > a.value ? b : a), null);

  const speeds = speedData.filter((s) => s.value > 0);
  let trend: 'up' | 'down' | 'same' | 'few' = 'few';
  if (speeds.length >= 2) {
    const diff = speeds[speeds.length - 1].value - speeds[0].value;
    trend = diff > 0.2 ? 'up' : diff < -0.2 ? 'down' : 'same';
  }

  return (
    <section aria-labelledby="stats-h" className="card stack section-e">
      <h2 id="stats-h">{t('stats.title')}</h2>
      <p className="field__hint">{t(`stats.rangeHint_${range}`)}</p>
      <fieldset className="field">
        <legend>{t('stats.range')}</legend>
        <div className="choice-list choice-list--row">
          {(['week', 'month', 'year'] as const).map((r) => (
            <label key={r} className="choice">
              <input type="radio" name="range" checked={range === r} onChange={() => setRange(r)} />
              {t(`stats.range_${r}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !d ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div aria-live="polite" className="stack">
          <p className="field__label-e">{t('stats.totalsHint')}</p>
          <ul className="stat-tiles plain-list">
            <li className="stat-tile">
              <span className="stat-tile__value">{d.totals.walks}</span>
              <span className="stat-tile__label">{t('stats.walks', { count: d.totals.walks })}</span>
            </li>
            <li className="stat-tile">
              <span className="stat-tile__value">{formatKm(d.totals.km)}</span>
              <span className="stat-tile__label">{t('stats.km')}</span>
            </li>
            <li className="stat-tile">
              <span className="stat-tile__value stat-tile__value--small">{formatDuration(d.totals.minutes)}</span>
              <span className="stat-tile__label">{t('stats.time')}</span>
            </li>
            <li className="stat-tile">
              <span className="stat-tile__value">{avgSpeed ? formatKm(avgSpeed) : '–'}</span>
              <span className="stat-tile__label">{t('stats.avgSpeed')}</span>
            </li>
          </ul>

          {kmData.length ? (
            <BarChart
              title={t(`stats.kmChart_${range}`)}
              data={kmData}
              format={(v) => t('common:units.km', { value: formatKm(v) })}
              labelHeader={t('stats.colPeriod')}
              valueHeader={t('stats.km')}
              summary={best && best.value > 0 ? t('stats.kmSummary', { label: best.label, km: formatKm(best.value), total: formatKm(d.totals.km) }) : t('stats.noWalks')}
            />
          ) : (
            <p className="muted-text">{t('stats.noWalks')}</p>
          )}
          {walksData.length ? (
            <BarChart
              title={t(`stats.walksChart_${range}`)}
              data={walksData}
              format={(v) => t('stats.walksValue', { count: v })}
              labelHeader={t('stats.colPeriod')}
              valueHeader={t('stats.walks_other')}
            />
          ) : null}

          <h3>{t('tempo.title')}</h3>
          {avgSpeed > 0 ? (
            <p className="summary-e">
              {t('tempo.average', { kmh: formatKm(avgSpeed), tempo: t(`common:tempo.${tempoWord(avgSpeed)}`) })}
              {trend !== 'few' ? ` ${t(`tempo.trend_${trend}`)}` : null}
            </p>
          ) : null}
          {speedData.length ? (
            <LineChart
              title={t('tempo.chart')}
              data={speedData}
              format={(v) => t('tempo.kmh', { kmh: formatKm(v) })}
              labelHeader={t('stats.colPeriod')}
              valueHeader={t('tempo.colSpeed')}
            />
          ) : null}
          <p className="field__hint">{t('tempo.explain')}</p>
        </div>
      )}
    </section>
  );
}

function Goals() {
  const { t } = useTranslation('premiumPage');
  const q = useQuery({ queryKey: ['premium', 'goals'], queryFn: () => api.get<{ goals: Goal[] }>('/premium/goals').then((r) => r.goals) });
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [metric, setMetric] = useState<'km' | 'walks'>('km');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useAction({
    fn: (body: { period: string; metric: string; target: number }) => api.put<{ goals: Goal[] }>('/premium/goals', body),
    success: t('goals.saved'),
    invalidate: [['premium', 'goals']],
    onSuccess: () => setTarget(''),
  });
  const del = useAction({
    fn: (g: Goal) => api.del(`/premium/goals/${g.id}`),
    success: t('goals.deleted'),
    invalidate: [['premium', 'goals']],
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = metric === 'km' ? parseKm(target) : parseInt(target, 10);
    if (!Number.isFinite(v) || v <= 0 || v > (metric === 'km' ? 1000 : 100)) {
      setError(metric === 'km' ? t('goals.kmInvalid') : t('goals.walksInvalid'));
      document.getElementById('goal-target')?.focus();
      return;
    }
    setError(null);
    if (!save.isPending) save.mutate({ period, metric, target: v });
  }

  const value = (g: Goal, v: number) => (g.metric === 'km' ? t('common:units.km', { value: formatKm(v) }) : t('stats.walksValue', { count: Math.round(v) }));

  return (
    <section aria-labelledby="goals-h" className="card stack section-e">
      <h2 id="goals-h">{t('goals.title')}</h2>
      <p>{t('goals.intro')}</p>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : q.data?.length ? (
        <ul className="plain-list goal-list-e">
          {q.data.map((g) => {
            const done = g.progress >= g.target;
            return (
              <li key={g.id} className="goal-e">
                <ProgressBar
                  label={t(`goals.label_${g.period}`, { target: value(g, g.target) })}
                  value={g.progress}
                  max={g.target}
                  done={done}
                  text={
                    done
                      ? t('goals.reached', { progress: value(g, g.progress) })
                      : t('goals.progress', { progress: value(g, g.progress), rest: value(g, Math.max(0, g.target - g.progress)) })
                  }
                />
                <button type="button" className="btn btn--ghost" disabled={del.isPending} onClick={() => del.mutate(g)}>
                  <Icon name="trash" /> {t('goals.delete')}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted-text">{t('goals.empty')}</p>
      )}

      <form onSubmit={submit} noValidate className="subsection-e">
        <h3>{t('goals.formTitle')}</h3>
        <fieldset className="field">
          <legend>{t('goals.period')}</legend>
          <div className="choice-list choice-list--row">
            {(['week', 'month'] as const).map((p) => (
              <label key={p} className="choice">
                <input type="radio" name="goal-period" checked={period === p} onChange={() => setPeriod(p)} />
                {t(`goals.period_${p}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>{t('goals.metric')}</legend>
          <div className="choice-list choice-list--row">
            {(['km', 'walks'] as const).map((m) => (
              <label key={m} className="choice">
                <input type="radio" name="goal-metric" checked={metric === m} onChange={() => setMetric(m)} />
                {t(`goals.metric_${m}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={metric === 'km' ? t('goals.targetKm') : t('goals.targetWalks')} hint={t('goals.targetHint')} error={error}>
          <input
            id="goal-target"
            className="input input--short"
            inputMode={metric === 'km' ? 'decimal' : 'numeric'}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        <button type="submit" className="btn" disabled={save.isPending}>
          <Icon name="check" /> {save.isPending ? t('common:status.saving') : t('goals.save')}
        </button>
      </form>
    </section>
  );
}

function monthName(m: number | string) {
  if (typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)) {
    return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5) - 1, 15)));
  }
  const n = typeof m === 'string' ? parseInt(m, 10) : m;
  if (!Number.isFinite(n) || n < 1 || n > 12) return String(m);
  return new Intl.DateTimeFormat('de-DE', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2020, n - 1, 15)));
}

function YearReviewSection() {
  const { t } = useTranslation('premiumPage');
  const bt = useBadgeText();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const q = useQuery({
    queryKey: ['premium', 'year-review', year],
    queryFn: () => api.get<YearReview>(`/premium/year-review?year=${year}`),
    placeholderData: (p) => p,
  });
  const r = q.data;

  let best: string | null = null;
  if (r?.bestMonth != null) {
    const bm = r.bestMonth;
    if (typeof bm === 'object') best = t('year.bestMonth', { month: monthName(bm.month), km: bm.km != null ? formatKm(bm.km) : '' });
    else best = t('year.bestMonthShort', { month: monthName(bm) });
  }
  let longest: string | null = null;
  if (r?.longestWalk != null) {
    const lw = r.longestWalk;
    longest =
      typeof lw === 'number'
        ? t('year.longest', { km: formatKm(lw) })
        : lw.startedAt
          ? t('year.longestOn', { km: formatKm(lw.distanceKm), date: formatDateShort(lw.startedAt) })
          : t('year.longest', { km: formatKm(lw.distanceKm) });
  }

  return (
    <section aria-labelledby="year-h" className="card stack section-e">
      <h2 id="year-h">{t('year.title', { year })}</h2>
      <fieldset className="field">
        <legend>{t('year.choose')}</legend>
        <div className="choice-list choice-list--row">
          {[thisYear, thisYear - 1].map((y) => (
            <label key={y} className="choice">
              <input type="radio" name="year" checked={year === y} onChange={() => setYear(y)} />
              {y}
            </label>
          ))}
        </div>
      </fieldset>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !r ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : r.walks === 0 ? (
        <p className="muted-text">{t('year.empty', { year })}</p>
      ) : (
        <div aria-live="polite" className="stack">
          <p className="summary-e">
            {t('year.summary', {
              year: r.year,
              walks: t('stats.walksValue', { count: r.walks }),
              km: formatKm(r.km),
              time: formatDuration(r.minutes),
            })}
          </p>
          <ul className="year-facts-e">
            {r.groupWalks ? <li>{t('year.groupWalks', { count: r.groupWalks })}</li> : null}
            {best ? <li>{best}</li> : null}
            {longest ? <li>{longest}</li> : null}
            {r.places.length ? <li>{t('year.places', { count: r.places.length, list: r.places.join(', ') })}</li> : null}
          </ul>
          {r.badges.length ? (
            <>
              <h3>{t('year.badges', { count: r.badges.length })}</h3>
              <ul className="mini-badges plain-list">
                {r.badges.map((b) => {
                  const def = badgeDefinition(b.key);
                  return (
                    <li key={b.key}>
                      <BadgeEmblem kind={b.kind ?? def?.kind ?? 'distance'} tier={b.tier ?? def?.tier ?? 1} size={72} />
                      <span>{bt.name(b.key, b.label)}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ShareCard() {
  const { t } = useTranslation('premiumPage');
  return (
    <section aria-labelledby="card-h" className="card stack section-e">
      <h2 id="card-h">{t('card.title')}</h2>
      <p>{t('card.text')}</p>
      <p className="field__hint">{t('card.privacy')}</p>
      <div className="btn-row">
        <a className="btn" href={apiUrl('/premium/share-card.png?range=month')} download="mein-fortschritt-monat.png">
          <Icon name="download" /> {t('card.month')}
        </a>
        <a className="btn btn--secondary" href={apiUrl('/premium/share-card.png?range=year')} download="mein-fortschritt-jahr.png">
          <Icon name="download" /> {t('card.year')}
        </a>
      </div>
    </section>
  );
}
