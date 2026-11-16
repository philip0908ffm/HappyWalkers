/**
 * Ergänzende Datums-Helfer für Kalender und Terminkarten (Zeitzone Europe/Berlin).
 * Grundformate (Datum, Uhrzeit, km, Dauer) stehen in ./format.ts.
 */
const LOCALE = 'de-DE';
const TZ = 'Europe/Berlin';

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, ...opts });

/** Teile für den Datumsblock einer Terminkarte: „Di“, „17“, „Nov.“ */
export function dateParts(d: string | Date) {
  const date = new Date(d);
  return {
    weekdayShort: fmt({ weekday: 'short' }).format(date).replace('.', ''),
    day: fmt({ day: 'numeric' }).format(date).replace('.', ''),
    monthShort: fmt({ month: 'short' }).format(date),
  };
}

/** Name des Wochentags; 0 = Sonntag … 6 = Samstag (wie Date.getDay()). */
export function weekdayName(n: number, style: 'long' | 'short' = 'long') {
  // 2024-01-07 war ein Sonntag
  return new Intl.DateTimeFormat(LOCALE, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + n)));
}

/** Monatsname mit Jahr: „November 2026“ */
export const monthTitle = (year: number, month: number) =>
  new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 1)));

/** Kalendertag (YYYY-MM-DD) eines Zeitpunkts in Berliner Zeit */
export function berlinDayKey(d: string | Date) {
  const parts = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(d));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Uhrzeit „HH:MM“ eines Zeitpunkts in Berliner Zeit (für <input type="time">) */
export function berlinTimeInput(d: string | Date) {
  return fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
}

/** „HH:MM“ → „10:00 Uhr“ */
export const timeOfDayLabel = (hhmm: string) => `${hhmm.slice(0, 5)} Uhr`;

/**
 * Datum (YYYY-MM-DD) + Uhrzeit (HH:MM) als Ortszeit des Geräts → ISO-Zeitpunkt (UTC).
 * Die Zielgruppe nutzt deutsche Geräte; die Anzeige erfolgt immer in Berliner Zeit.
 */
export function localToIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

/** Nächstes Datum (heute eingeschlossen) mit dem gewünschten Wochentag, als YYYY-MM-DD */
export function nextWeekdayDate(weekday: number, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
