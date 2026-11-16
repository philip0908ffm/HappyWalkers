import { db } from '../../src/db/index.js';
import * as s from '../../src/db/schema.js';

/**
 * Test-Hilfen für Paket B: Gruppen, Mitgliedschaften und Walks direkt in der Datenbank anlegen
 * (unabhängig von der Gruppen-API aus Paket A).
 */
export async function makeGroup(members: { userId: string; role?: 'founder' | 'moderator' | 'member' }[], name = 'Testgruppe B') {
  const [g] = await db
    .insert(s.groups)
    .values({
      name,
      postalCode: '34117',
      city: 'Kassel',
      lat: 51.31,
      lon: 9.48,
      inviteCode: `B-${crypto.randomUUID().slice(0, 8)}`,
    })
    .returning();
  if (members.length) {
    await db
      .insert(s.groupMembers)
      .values(members.map((m) => ({ groupId: g.id, userId: m.userId, role: m.role ?? 'member', status: 'active' })));
  }
  return g;
}

/** Walk direkt eintragen (z. B. bestätigter Gruppen-Walk, source 'group'). */
export async function insertActivity(
  userId: string,
  v: { distanceKm: number; durationMinutes?: number; startedAt?: Date; source?: string; city?: string; district?: string },
) {
  const [a] = await db
    .insert(s.activities)
    .values({
      userId,
      distanceKm: v.distanceKm,
      durationMinutes: v.durationMinutes ?? Math.ceil(v.distanceKm * 12),
      startedAt: v.startedAt ?? new Date(Date.now() - 3600_000),
      source: v.source ?? 'manual',
      city: v.city ?? 'Kassel',
      district: v.district ?? 'Kreisfreie Stadt Kassel',
    })
    .returning();
  return a;
}

/** Zeitpunkt vor n Stunden (ISO). */
export const hoursAgo = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();
