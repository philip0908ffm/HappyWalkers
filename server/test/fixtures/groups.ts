import { db } from '../../src/db/index.js';
import * as s from '../../src/db/schema.js';

/**
 * Test-Hilfen für Paket C: Gruppen und Mitgliedschaften direkt in der Datenbank anlegen
 * (unabhängig von der Gruppen-API).
 */
export async function createGroup(
  members: { userId: string; role?: 'founder' | 'moderator' | 'member'; status?: 'active' | 'pending' | 'banned' }[],
  opts: { joinPolicy?: 'open' | 'request' | 'invite'; name?: string } = {},
) {
  const [g] = await db
    .insert(s.groups)
    .values({
      name: opts.name ?? 'Testgruppe',
      postalCode: '34117',
      city: 'Kassel',
      lat: 51.31,
      lon: 9.48,
      inviteCode: `T-${crypto.randomUUID().slice(0, 8)}`,
      joinPolicy: opts.joinPolicy ?? 'open',
    })
    .returning();
  if (members.length) {
    await db.insert(s.groupMembers).values(
      members.map((m) => ({ groupId: g.id, userId: m.userId, role: m.role ?? 'member', status: m.status ?? 'active' })),
    );
  }
  return g;
}
