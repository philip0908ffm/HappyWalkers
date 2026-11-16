/** Formatierung nach deutscher Schreibweise (vorbereitet für weitere Sprachen). */
const LOCALE = 'de-DE';
const TZ = 'Europe/Berlin';

export const formatKm = (km: number, digits = 1) =>
  new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(km);

export const formatDate = (d: string | Date) =>
  new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(d));

export const formatDateShort = (d: string | Date) =>
  new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(d));

export const formatTime = (d: string | Date) =>
  new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(d)) + ' Uhr';

export const formatDateTime = (d: string | Date) => `${formatDate(d)}, ${formatTime(d)}`;

export const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} Minuten`;
  if (m === 0) return h === 1 ? '1 Stunde' : `${h} Stunden`;
  return `${h} Std. ${m} Min.`;
};

export const formatPrice = (cents: number, currency = 'EUR') =>
  new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(cents / 100);

/** Datum als YYYY-MM-DD in Ortszeit (für <input type="date">) */
export const toDateInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
