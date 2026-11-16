import { useTranslation } from 'react-i18next';
import type { Challenge } from '../../api/types-e';
import { ProgressBar } from '../../components/ProgressBar';
import { formatDateShort, formatKm } from '../../lib/format';

/**
 * `endsAt` ist exklusiv (Mitternacht Berliner Zeit NACH dem letzten Tag, siehe server/src/db/seed.ts).
 * Angezeigt wird der letzte Tag, an dem noch gezählt wird: 1. Dezember 0:00 → „bis 30. November“.
 */
export const lastDay = (endsAt: string | Date) => new Date(new Date(endsAt).getTime() - 1);

/** Fortschritt als Text („3,2 von 20 km – noch 16,8 km“) */
export function useChallengeText() {
  const { t } = useTranslation('badges');
  const fmt = (c: Challenge, v: number) => (c.unit === 'km' ? t('challenge.km', { value: formatKm(v) }) : t('challenge.walks', { count: Math.round(v) }));
  return {
    value: fmt,
    progress: (c: Challenge) => {
      const done = c.completedAt || c.progress >= c.target;
      const base = t('challenge.progressOf', { progress: fmt(c, c.progress), target: fmt(c, c.target) });
      if (done) return `${base} – ${t('challenge.doneShort')}`;
      if (c.type === 'single_distance') return `${t('challenge.longest', { value: fmt(c, c.progress) })} – ${t('challenge.goal', { target: fmt(c, c.target) })}`;
      return `${base} – ${t('challenge.remaining', { rest: fmt(c, Math.max(0, c.target - c.progress)) })}`;
    },
    period: (c: Challenge) => t('challenge.period', { start: formatDateShort(c.startsAt), end: formatDateShort(lastDay(c.endsAt)) }),
    scope: (c: Challenge) =>
      c.scope === 'group' && c.group
        ? t('challenge.scope_group', { name: c.group.name })
        : c.scope === 'city' && c.city
          ? t('challenge.scope_city', { city: c.city })
          : t('challenge.scope_everyone'),
  };
}

export function ChallengeProgress({ challenge: c }: { challenge: Challenge }) {
  const { t } = useTranslation('badges');
  const ct = useChallengeText();
  return (
    <ProgressBar
      label={t('challenge.myProgress')}
      value={c.progress}
      max={c.target}
      text={ct.progress(c)}
      done={!!c.completedAt || c.progress >= c.target}
    />
  );
}
