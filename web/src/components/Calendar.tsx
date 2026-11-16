import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { berlinDayKey, monthTitle, weekdayName } from '../lib/dates';
import { formatTime } from '../lib/format';
import { Icon } from './Icon';

export interface CalendarEvent {
  id: string;
  startsAt: string;
  title: string;
  href: string;
  cancelled?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Barrierefreier Monatskalender: echte Tabelle mit Wochentagen als Spaltenköpfen,
 * Knöpfe „Vormonat“/„Nächster Monat“ mit Text, Termine als Links (Uhrzeit + Titel).
 * Auf schmalen Bildschirmen scrollt nur die Tabelle – Seiten zeigen zusätzlich eine Liste.
 */
export function Calendar({
  year,
  month,
  onChange,
  events,
  headingLevel = 3,
}: {
  year: number;
  /** 0 = Januar */
  month: number;
  onChange: (year: number, month: number) => void;
  events: CalendarEvent[];
  headingLevel?: 2 | 3 | 4;
}) {
  const { t } = useTranslation();
  const H = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  const title = monthTitle(year, month);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const k = berlinDayKey(e.startsAt);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [events]);

  // Wochen beginnen am Montag
  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7;
    const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    while (cells.length % 7) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [year, month]);

  const todayKey = berlinDayKey(new Date());
  const weekdays = [1, 2, 3, 4, 5, 6, 0];
  const go = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    onChange(d.getUTCFullYear(), d.getUTCMonth());
  };
  const dayLabel = (day: number) =>
    new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, day)));

  return (
    <div className="calendar">
      <div className="calendar__nav">
        <button type="button" className="btn btn--secondary" onClick={() => go(-1)}>
          <Icon name="arrowLeft" /> {t('calendar.prev')}
        </button>
        <H className="calendar__title" aria-live="polite">
          {title}
        </H>
        <button type="button" className="btn btn--secondary" onClick={() => go(1)}>
          {t('calendar.next')} <Icon name="arrowRight" />
        </button>
      </div>
      <div className="table-wrap" tabIndex={0} role="group" aria-label={t('calendar.tableLabel', { month: title })}>
        <table className="calendar__table">
          <caption className="visually-hidden">{t('calendar.caption', { month: title })}</caption>
          <thead>
            <tr>
              {weekdays.map((w) => (
                <th key={w} scope="col">
                  <abbr title={weekdayName(w)}>{weekdayName(w, 'short').replace('.', '')}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((row, ri) => (
              <tr key={ri}>
                {row.map((day, ci) => {
                  if (day == null) return <td key={ci} className="calendar__empty" />;
                  const key = `${year}-${pad(month + 1)}-${pad(day)}`;
                  const list = byDay.get(key) ?? [];
                  const isToday = key === todayKey;
                  return (
                    <td key={ci} className={`${isToday ? 'calendar__today' : ''} ${list.length ? 'calendar__has-events' : ''}`} aria-current={isToday ? 'date' : undefined}>
                      <span className="calendar__day" aria-hidden="true">
                        {day}
                      </span>
                      <span className="visually-hidden">
                        {dayLabel(day)}
                        {isToday ? `, ${t('calendar.today')}` : ''}
                      </span>
                      {list.length ? (
                        <ul className="calendar__events">
                          {list.map((e) => (
                            <li key={e.id}>
                              <Link to={e.href} className={e.cancelled ? 'calendar__event--cancelled' : undefined}>
                                <span className="calendar__time">{formatTime(e.startsAt).replace(' Uhr', '')}</span> {e.title}
                                {e.cancelled ? ` (${t('calendar.cancelled')})` : ''}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
