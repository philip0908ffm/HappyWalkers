import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/index.js';
import { blocks, follows, groupMembers, profile, user, walkRsvps, walks } from '../db/schema.js';

/**
 * Hilfsfunktionen rund um Personen (Paket C). Andere Module dürfen sie nutzen.
 * Personen werden nach außen IMMER als PersonRef ausgeliefert – nie mit E-Mail, Telefon,
 * Geburtsjahr oder Geschlecht.
 */

export interface PersonRef {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/** URL des Profilbilds. `v` wechselt mit jedem neuen Bild (Cache wird so umgangen). */
export function avatarUrlFor(userId: string, avatarPath: string | null | undefined): string | null {
  if (!avatarPath) return null;
  const v = avatarPath.replace(/^.*\//, '').slice(0, 8);
  return `/api/v1/photos/avatar/${userId}?v=${v}`;
}

/**
 * Mehrere Personen auf einmal laden (keine N+1-Abfragen).
 * Mit `viewerId` wird `avatarUrl` nur gesetzt, wenn die betrachtende Person das Bild sehen darf
 * (siehe canSeeAvatar); ohne `viewerId` immer, die Bild-Route prüft ohnehin selbst.
 */
export async function personRefs(ids: Iterable<string | null | undefined>, viewerId?: string): Promise<Map<string, PersonRef>> {
  const unique = [...new Set([...ids].filter((x): x is string => !!x))];
  const out = new Map<string, PersonRef>();
  if (!unique.length) return out;
  const rows = await db
    .select({ id: user.id, name: user.name, displayName: profile.displayName, avatarPath: profile.avatarPath, visibility: profile.profileVisibility })
    .from(user)
    .leftJoin(profile, eq(profile.userId, user.id))
    .where(inArray(user.id, unique));
  const avatarAllowed = viewerId ? await avatarVisibleSet(viewerId, rows) : null;
  for (const r of rows) {
    const allowed = !avatarAllowed || avatarAllowed.has(r.id);
    out.set(r.id, {
      id: r.id,
      displayName: r.displayName || r.name || '',
      avatarUrl: allowed ? avatarUrlFor(r.id, r.avatarPath) : null,
    });
  }
  // Gelöschte Konten: neutraler Platzhalter
  for (const id of unique) if (!out.has(id)) out.set(id, { id, displayName: '', avatarUrl: null });
  return out;
}

export async function personRef(userId: string, viewerId?: string): Promise<PersonRef> {
  return (await personRefs([userId], viewerId)).get(userId)!;
}

/** Für welche dieser Personen darf `viewerId` das Profilbild sehen? (gesammelt, 3 Abfragen) */
async function avatarVisibleSet(
  viewerId: string,
  rows: { id: string; avatarPath: string | null; visibility: string | null }[],
): Promise<Set<string>> {
  const result = new Set<string>();
  const candidates = rows.filter((r) => r.avatarPath).map((r) => r.id);
  if (!candidates.length) return result;
  const blocked = await blockedIds(viewerId);
  const open = candidates.filter((id) => !blocked.has(id));
  const undecided: string[] = [];
  for (const r of rows) {
    if (!open.includes(r.id)) continue;
    if (r.id === viewerId || r.visibility === 'public') result.add(r.id);
    else undecided.push(r.id);
  }
  if (!undecided.length) return result;
  const contacts = await db
    .select({ a: follows.followerId, b: follows.followeeId })
    .from(follows)
    .where(
      and(
        eq(follows.status, 'accepted'),
        or(
          and(eq(follows.followerId, viewerId), inArray(follows.followeeId, undecided)),
          and(eq(follows.followeeId, viewerId), inArray(follows.followerId, undecided)),
        ),
      ),
    );
  for (const c of contacts) result.add(c.a === viewerId ? c.b : c.a);
  const rest = undecided.filter((id) => !result.has(id));
  if (rest.length) for (const id of await sharesActiveGroupWith(viewerId, rest)) result.add(id);
  return result;
}

/**
 * Profilbild sichtbar für: sich selbst, gemeinsame aktive Gruppe, bestätigte Kontakte
 * (Folgen in eine der beiden Richtungen bestätigt) oder öffentliches Profil. Nie bei Blockierung.
 */
export async function canSeeAvatar(viewerId: string | undefined, ownerId: string): Promise<boolean> {
  if (!viewerId) return false;
  if (viewerId === ownerId) return true;
  const [p] = await db
    .select({ avatarPath: profile.avatarPath, visibility: profile.profileVisibility })
    .from(profile)
    .where(eq(profile.userId, ownerId))
    .limit(1);
  if (!p) return false;
  return (await avatarVisibleSet(viewerId, [{ id: ownerId, avatarPath: p.avatarPath ?? 'x', visibility: p.visibility }])).has(ownerId);
}

/** Welche der `others` sind mit `userId` gemeinsam aktives Mitglied mindestens einer Gruppe? */
export async function sharesActiveGroupWith(userId: string, others: string[]): Promise<Set<string>> {
  if (!others.length) return new Set();
  const gm2 = alias(groupMembers, 'gm2');
  const rows = await db
    .selectDistinct({ id: gm2.userId })
    .from(groupMembers)
    .innerJoin(gm2, eq(gm2.groupId, groupMembers.groupId))
    .where(
      and(
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, 'active'),
        inArray(gm2.userId, others),
        eq(gm2.status, 'active'),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

export async function sharesActiveGroup(a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  return (await sharesActiveGroupWith(a, [b])).has(b);
}

/** Alle Personen, die `userId` blockiert hat oder von denen `userId` blockiert wurde. */
export async function blockedIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ a: blocks.blockerId, b: blocks.blockedId })
    .from(blocks)
    .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
  return new Set(rows.map((r) => (r.a === userId ? r.b : r.a)));
}

/* ------------------------------------------------------------------ */
/* Gesammelte Sichtbarkeitsprüfung (für Listen ohne N+1)               */
/* ------------------------------------------------------------------ */

/**
 * Alles, was für die Sichtbarkeitsprüfung vieler Inhalte gebraucht wird – einmal je Anfrage geladen.
 * `canSeeWith` bildet die Regeln von `canSeeContent` (lib/access.ts) exakt nach.
 */
export interface ViewerContext {
  userId: string;
  /** Gruppen mit aktiver Mitgliedschaft */
  activeGroups: Set<string>;
  /** Gruppen, in denen die Person Gründerin/Moderatorin ist */
  leadGroups: Set<string>;
  /** Personen, denen die betrachtende Person bestätigt folgt */
  following: Set<string>;
  /** in beide Richtungen blockiert */
  blocked: Set<string>;
  /** „Gemeinsam auf Distanz“-Termine, bei denen die Person mitmacht (erstellt oder zugesagt) – siehe canSeePost */
  distanceWalks: Set<string>;
}

export async function loadViewerContext(userId: string): Promise<ViewerContext> {
  const [memberships, followingRows, blocked, distanceRows] = await Promise.all([
    db
      .select({ groupId: groupMembers.groupId, role: groupMembers.role })
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, 'active'))),
    db
      .select({ id: follows.followeeId })
      .from(follows)
      .where(and(eq(follows.followerId, userId), eq(follows.status, 'accepted'))),
    blockedIds(userId),
    db
      .selectDistinct({ id: walks.id })
      .from(walks)
      .leftJoin(walkRsvps, and(eq(walkRsvps.walkId, walks.id), eq(walkRsvps.userId, userId), eq(walkRsvps.status, 'yes')))
      .where(and(eq(walks.kind, 'distance'), or(eq(walks.createdBy, userId), isNotNull(walkRsvps.userId)))),
  ]);
  return {
    userId,
    activeGroups: new Set(memberships.map((m) => m.groupId)),
    leadGroups: new Set(memberships.filter((m) => m.role === 'founder' || m.role === 'moderator').map((m) => m.groupId)),
    following: new Set(followingRows.map((f) => f.id)),
    blocked,
    distanceWalks: new Set(distanceRows.map((r) => r.id)),
  };
}

/** Wie `canSeePost` (lib/access.ts), gesammelt: `isDistance` = Beitrag gehört zu einem Distanz-Termin. */
export function canSeePostWith(
  ctx: ViewerContext,
  post: { authorId: string; visibility: string; groupId: string | null; walkId: string | null },
  isDistance: boolean,
): boolean {
  if (post.authorId === ctx.userId) return true;
  if (ctx.blocked.has(post.authorId)) return false;
  if (isDistance) return !!post.walkId && ctx.distanceWalks.has(post.walkId);
  return canSeeWith(ctx, { ownerId: post.authorId, visibility: post.visibility, groupId: post.groupId });
}

export function canSeeWith(ctx: ViewerContext, item: { ownerId: string; visibility: string; groupId: string | null }): boolean {
  if (item.ownerId === ctx.userId) return true;
  if (ctx.blocked.has(item.ownerId)) return false;
  switch (item.visibility) {
    case 'public':
      return true;
    case 'followers':
      return ctx.following.has(item.ownerId);
    case 'group':
      if (item.groupId) return ctx.activeGroups.has(item.groupId);
      return ctx.following.has(item.ownerId);
    default:
      return false;
  }
}
