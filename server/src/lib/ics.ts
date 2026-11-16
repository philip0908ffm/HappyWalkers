/** Kalenderdatei (.ics, RFC 5545) für einen Walk. */
export interface IcsEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  start: Date;
  durationMinutes: number;
  url?: string;
}

const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Zeilenumbrüche (auch einzelnes \r) werden zu \n, andere Steuerzeichen entfernt → Benutzertexte
// (Titel, Beschreibung, Treffpunkt) können keine eigenen Kalender-Eigenschaften einschleusen.
const esc = (s: string) =>
  s
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');

/** Zeilen nach 75 Oktetten falten (RFC 5545). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

export function buildIcs(ev: IcsEvent): string {
  const end = new Date(ev.start.getTime() + ev.durationMinutes * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gehmeinsam//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.uid}@gehmeinsam`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(ev.start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    `DESCRIPTION:${esc(ev.description)}`,
    `LOCATION:${esc(ev.location)}`,
    ...(ev.url ? [`URL:${ev.url}`] : []),
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(ev.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
