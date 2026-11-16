/**
 * Wiederkehrende Termine („jeden Dienstag, 10 Uhr“).
 *
 * Eine Serie (walk_series) erzeugt für die nächsten 8 Wochen einzelne Walks. Ein stündlicher
 * Hintergrund-Job zieht laufend nach. Uhrzeiten gelten in Ortszeit Europe/Berlin – auch über
 * die Umstellung auf Sommer-/Winterzeit hinweg (Berechnung mit Intl, ohne Zusatzbibliothek).
 *
 * Eindeutiger Index (series_id, starts_at) → doppeltes Erzeugen ist ausgeschlossen. Ein einzeln
 * abgesagter Termin bleibt als „abgesagt“ bestehen und wird nicht neu erzeugt.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { groups, walks, walkSeries } from '../db/schema.js';
import { registerJob } from '../jobs.js';

export const TIME_ZONE = 'Europe/Berlin';
export const SERIES_WEEKS_AHEAD = 8;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Ortszeit (Europe/Berlin) eines Zeitpunkts in Einzelteilen. Monat 1–12. */
export function berlinParts(date: Date) {
  const p: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second, weekday };
}

/** Abstand Ortszeit – UTC in Millisekunden zu einem Zeitpunkt (Winter: +1 h, Sommer: +2 h). */
function offsetMs(date: Date): number {
  const p = berlinParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Berliner Ortszeit (Datum + „HH:MM“) → UTC-Zeitpunkt. Monat 1–12. */
export function berlinToUtc(year: number, month: number, day: number, timeOfDay: string): Date {
  const [h, m] = timeOfDay.split(':').map(Number);
  const guess = Date.UTC(year, month - 1, day, h, m);
  let result = guess - offsetMs(new Date(guess));
  // An Umstellungstagen kann der Abstand am Ergebnis ein anderer sein → einmal nachkorrigieren.
  const second = guess - offsetMs(new Date(result));
  if (second !== result) result = second;
  return new Date(result);
}

/** Alle Termine einer Serie im Zeitraum [from, from + weeks) in UTC. */
export function occurrences(weekday: number, timeOfDay: string, from: Date, weeks = SERIES_WEEKS_AHEAD): Date[] {
  const start = berlinParts(from);
  const until = from.getTime() + weeks * 7 * 86_400_000;
  const out: Date[] = [];
  for (let i = 0; i <= weeks * 7; i++) {
    const d = new Date(Date.UTC(start.year, start.month - 1, start.day + i));
    if (d.getUTCDay() !== weekday) continue;
    const at = berlinToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), timeOfDay);
    if (at.getTime() > from.getTime() && at.getTime() <= until) out.push(at);
  }
  return out;
}

type SeriesRow = typeof walkSeries.$inferSelect;

/**
 * Erzeugt fehlende Termine einer Serie (idempotent). Gibt die neu angelegten Walk-IDs zurück.
 */
export async function generateSeriesWalks(series: SeriesRow, now = new Date()): Promise<string[]> {
  if (!series.active) return [];
  const [g] = await db.select().from(groups).where(eq(groups.id, series.groupId)).limit(1);
  if (!g) return [];
  const dates = occurrences(series.weekday, series.timeOfDay, now);
  if (!dates.length) return [];
  const rows = await db
    .insert(walks)
    .values(
      dates.map((startsAt) => ({
        kind: 'group',
        groupId: g.id,
        seriesId: series.id,
        title: series.title,
        description: series.description,
        startsAt,
        durationMinutes: series.durationMinutes,
        distanceKm: series.distanceKm,
        tempo: series.tempo,
        meetingPointName: series.meetingPointName,
        meetingAddress: series.meetingAddress,
        meetingDescription: series.meetingDescription,
        meetingLat: series.meetingLat,
        meetingLon: series.meetingLon,
        postalCode: g.postalCode,
        city: g.city,
        district: g.district,
        lat: g.lat,
        lon: g.lon,
        maxParticipants: series.maxParticipants,
        createdBy: series.createdBy,
      })),
    )
    .onConflictDoNothing({ target: [walks.seriesId, walks.startsAt] })
    .returning({ id: walks.id });
  return rows.map((r) => r.id);
}

/** Alle aktiven Serien nachziehen (Hintergrund-Job). */
export async function generateAllSeries(now = new Date()): Promise<number> {
  const list = await db.select().from(walkSeries).where(eq(walkSeries.active, true));
  let created = 0;
  for (const s of list) created += (await generateSeriesWalks(s, now)).length;
  return created;
}

/** Künftige Termine einer Serie (geplant, noch nicht begonnen). */
export async function futureSeriesWalkIds(seriesId: string, now = new Date()) {
  const rows = await db
    .select({ id: walks.id, startsAt: walks.startsAt })
    .from(walks)
    .where(and(eq(walks.seriesId, seriesId), eq(walks.status, 'planned')));
  return rows.filter((r) => r.startsAt > now).map((r) => r.id);
}

export async function seriesByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(walkSeries).where(inArray(walkSeries.id, ids));
}

registerJob({
  name: 'wiederkehrende-termine',
  everyMs: 60 * 60 * 1000,
  run: async () => {
    await generateAllSeries();
  },
});
