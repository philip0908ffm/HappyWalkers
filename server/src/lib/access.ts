import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { blocks, follows, groupMembers, groups, profile, walkRsvps } from '../db/schema.js';
import { forbidden, notFound } from './http.js';

/**
 * Zentrale Zugriffsregeln (siehe docs/WER-SIEHT-WAS.md).
 * Alle Module nutzen diese Funktionen, statt eigene Regeln zu erfinden.
 */

export type Membership = { role: 'founder' | 'moderator' | 'member'; status: 'active' | 'pending' | 'banned' } | null;

export async function getMembership(groupId: string, userId: string | undefined): Promise<Membership> {
  if (!userId) return null;
  const [m] = await db
    .select({ role: groupMembers.role, status: groupMembers.status })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  return (m as Membership) ?? null;
}

export const isActiveMember = (m: Membership) => m?.status === 'active';
export const isGroupLead = (m: Membership) => m?.status === 'active' && (m.role === 'founder' || m.role === 'moderator');
export const isFounder = (m: Membership) => m?.status === 'active' && m.role === 'founder';

export async function requireGroup(groupId: string) {
  const [g] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!g) throw notFound('group_not_found');
  return g;
}

export async function requireGroupLead(groupId: string, userId: string) {
  const m = await getMembership(groupId, userId);
  if (!isGroupLead(m)) throw forbidden('not_group_lead');
  return m!;
}

export async function requireActiveMember(groupId: string, userId: string) {
  const m = await getMembership(groupId, userId);
  if (!isActiveMember(m)) throw forbidden('not_group_member');
  return m!;
}

/** Hat eine der beiden Personen die andere blockiert? */
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const rows = await db
    .select({ x: blocks.blockerId })
    .from(blocks)
    .where(or(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)), and(eq(blocks.blockerId, b), eq(blocks.blockedId, a))))
    .limit(1);
  return rows.length > 0;
}

export async function isAcceptedFollower(followerId: string, followeeId: string): Promise<boolean> {
  const rows = await db
    .select({ s: follows.status })
    .from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId), eq(follows.status, 'accepted')))
    .limit(1);
  return rows.length > 0;
}

/** „Nur Frauen“-Gruppen: nur Personen, die im Profil „Frau“ angegeben haben. */
export async function canJoinWomenOnly(userId: string): Promise<boolean> {
  const [p] = await db.select({ gender: profile.gender }).from(profile).where(eq(profile.userId, userId)).limit(1);
  return p?.gender === 'woman';
}

/**
 * Darf die Person den genauen Treffpunkt eines Walks sehen?
 *  - Gruppen-Walk: nur aktive Mitglieder der Gruppe (auch die Erstellerin nur, solange sie aktiv ist)
 *  - Gehpartner-Walk: nur eingeladene/zugesagte Personen
 *  - Gemeinsam auf Distanz: kein gemeinsamer Treffpunkt
 */
export async function canSeeMeetingPoint(
  walk: { id: string; kind: string; groupId: string | null; createdBy: string | null },
  userId: string | undefined,
): Promise<boolean> {
  if (!userId) return false;
  // Gruppen-Walk: allein die aktive Mitgliedschaft zählt – auch für die Erstellerin
  // (gesperrt/entfernt → kein Treffpunkt mehr, auch nicht für künftige Serientermine).
  if (walk.kind === 'group' && walk.groupId) return isActiveMember(await getMembership(walk.groupId, userId));
  if (walk.createdBy === userId) return true;
  if (walk.kind === 'partner') {
    const [r] = await db
      .select({ s: walkRsvps.status })
      .from(walkRsvps)
      .where(and(eq(walkRsvps.walkId, walk.id), eq(walkRsvps.userId, userId)))
      .limit(1);
    return !!r;
  }
  return false;
}

/**
 * Sichtbarkeit eines Beitrags/Fotos.
 *  private: nur Urheberin; group: aktive Mitglieder der Gruppe (ohne Gruppe: wie followers);
 *  followers: bestätigte Folgende; public: alle angemeldeten Personen.
 * Blockierungen gelten immer.
 */
export async function canSeeContent(
  item: { ownerId: string; visibility: string; groupId: string | null },
  viewerId: string | undefined,
): Promise<boolean> {
  if (!viewerId) return false;
  if (item.ownerId === viewerId) return true;
  if (await isBlockedEitherWay(item.ownerId, viewerId)) return false;
  switch (item.visibility) {
    case 'public':
      return true;
    case 'followers':
      return isAcceptedFollower(viewerId, item.ownerId);
    case 'group':
      if (item.groupId) return isActiveMember(await getMembership(item.groupId, viewerId));
      return isAcceptedFollower(viewerId, item.ownerId);
    default:
      return false;
  }
}
