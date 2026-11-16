/**
 * „Interesse anmelden“ (ländliche Regionen): Wer Interesse angemeldet hat, bekommt eine Nachricht,
 * sobald im gewählten Umkreis eine Gruppe, ein Walk oder ein Gehpartner-Gesuch eingetragen wird.
 *
 *  - höchstens 1 Nachricht pro Tag und Person (lastNotifiedAt, atomar gesetzt)
 *  - E-Mail nur, wenn die Person E-Mail-Benachrichtigungen erlaubt; in der App immer
 *  - nie an die auslösende Person, nie zwischen Personen, die sich blockiert haben
 *  - die Nachricht verrät keine Kontaktdaten, nur Art und Ort
 */
import { and, eq, gte, isNull, lt, lte, ne, or } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { interestAlerts, profile, user } from '../db/schema.js';
import { isBlockedEitherWay } from '../lib/access.js';
import { sendMail, textToHtml } from '../lib/email.js';
import { boundingBox, distanceKm } from '../lib/geo.js';
import { notify } from './notify.js';

export type InterestKind = 'group' | 'walk' | 'partner';

export interface InterestEvent {
  kind: InterestKind;
  lat: number;
  lon: number;
  city: string;
  /** Person, die etwas eingetragen hat (bekommt selbst keine Nachricht) */
  actorId: string;
  /** Pfad in der App, z. B. /gruppen/<id> */
  path: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RADIUS_KM = 50;

const TEXTS: Record<InterestKind, { sie: string; du: string; subject: string }> = {
  group: {
    subject: 'Neue Gehgruppe in Ihrer Nähe',
    sie: 'in Ihrer Nähe gibt es eine neue Gehgruppe',
    du: 'in deiner Nähe gibt es eine neue Gehgruppe',
  },
  walk: {
    subject: 'Neuer Walk in Ihrer Nähe',
    sie: 'in Ihrer Nähe wurde ein neuer Walk eingetragen',
    du: 'in deiner Nähe wurde ein neuer Walk eingetragen',
  },
  partner: {
    subject: 'Jemand sucht in Ihrer Nähe einen Gehpartner',
    sie: 'in Ihrer Nähe sucht jemand einen Gehpartner',
    du: 'in deiner Nähe sucht jemand einen Gehpartner',
  },
};

/**
 * Benachrichtigt alle passenden Interessierten. Fehler werden nur protokolliert –
 * das Eintragen selbst darf daran nie scheitern. Gibt die Zahl der Benachrichtigten zurück.
 */
export async function notifyInterest(ev: InterestEvent, now = new Date()): Promise<number> {
  try {
    const box = boundingBox(ev.lat, ev.lon, MAX_RADIUS_KM);
    const candidates = await db
      .select()
      .from(interestAlerts)
      .where(
        and(
          ne(interestAlerts.userId, ev.actorId),
          gte(interestAlerts.lat, box.minLat),
          lte(interestAlerts.lat, box.maxLat),
          gte(interestAlerts.lon, box.minLon),
          lte(interestAlerts.lon, box.maxLon),
        ),
      );
    const cutoff = new Date(now.getTime() - DAY_MS);
    let count = 0;
    for (const a of candidates) {
      const d = distanceKm(a.lat, a.lon, ev.lat, ev.lon);
      if (d > a.radiusKm) continue;
      if (a.lastNotifiedAt && a.lastNotifiedAt > cutoff) continue;
      if (await isBlockedEitherWay(a.userId, ev.actorId)) continue;
      // atomar „reservieren“: nur wer die Zeile aktualisiert, verschickt die Nachricht
      const claimed = await db
        .update(interestAlerts)
        .set({ lastNotifiedAt: now })
        .where(
          and(
            eq(interestAlerts.id, a.id),
            or(isNull(interestAlerts.lastNotifiedAt), lt(interestAlerts.lastNotifiedAt, cutoff)),
          ),
        )
        .returning({ id: interestAlerts.id });
      if (!claimed.length) continue;
      count++;
      const km = Math.max(1, Math.round(d));
      await notify(a.userId, 'interest_match', { kind: ev.kind, city: ev.city, distanceKm: km, path: ev.path });
      await sendInterestMail(a.userId, ev, km);
    }
    return count;
  } catch (err) {
    console.error('Interessen-Benachrichtigung fehlgeschlagen', err);
    return 0;
  }
}

async function sendInterestMail(userId: string, ev: InterestEvent, km: number) {
  const [row] = await db
    .select({ email: user.email, name: profile.displayName, anrede: profile.anrede, emailNotifications: profile.emailNotifications })
    .from(user)
    .innerJoin(profile, eq(profile.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);
  if (!row || !row.emailNotifications || !row.email || row.email.endsWith('.invalid')) return;
  const du = row.anrede === 'du';
  const t = TEXTS[ev.kind];
  const hello = row.name ? (du ? `Hallo ${row.name},` : `Guten Tag ${row.name},`) : du ? 'Hallo,' : 'Guten Tag,';
  const url = `${config.APP_URL}${ev.path}`;
  const text = [
    hello,
    `${du ? t.du : t.sie}: in ${ev.city}, etwa ${km} km entfernt.`,
    du ? 'Schau es dir in Ruhe an:' : 'Schauen Sie es sich in Ruhe an:',
    url,
    du
      ? 'Du bekommst diese Nachricht, weil du Interesse an Walks in deiner Nähe angemeldet hast. Du bekommst höchstens eine solche Nachricht am Tag. Abmelden kannst du dich in der App unter „In der Nähe“.'
      : 'Sie bekommen diese Nachricht, weil Sie Interesse an Walks in Ihrer Nähe angemeldet haben. Sie bekommen höchstens eine solche Nachricht am Tag. Abmelden können Sie sich in der App unter „In der Nähe“.',
    'Herzliche Grüße\nIhr Gehmeinsam-Team'.replace('Ihr', du ? 'Dein' : 'Ihr'),
  ].join('\n\n');
  const subject = du ? t.subject.replace('Ihrer', 'deiner') : t.subject;
  try {
    await sendMail({ to: row.email, subject, text, html: textToHtml(text, { label: du ? 'Ansehen' : 'Jetzt ansehen', url }) });
  } catch (err) {
    console.error('Interessen-Mail fehlgeschlagen', err);
  }
}
