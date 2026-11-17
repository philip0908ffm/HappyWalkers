import { CHALLENGE_TYPES, POINTS } from '@happywalkers/shared';
import { and, asc, desc, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { blocks, challengeParticipants, challenges, groupMembers, groups, profile } from '../db/schema.js';
import { requireGroup, requireGroupLead } from '../lib/access.js';
import { conflict, notFound, parse, zId } from '../lib/http.js';
import { me, requireUser } from '../middleware/auth.js';
import { refreshParticipation } from '../services/gamification.js';

/** Modul „challenges“ (Paket B, siehe docs/API.md). */
export const router = Router();
router.use(requireUser);

/** Name in Ranglisten bei leaderboardMode 'hidden' (neutral, freundlich). */
export const HIDDEN_LEADERBOARD_NAME = 'Teilnehmende Person';
const LEADERBOARD_TOP = 20;

type ChallengeRow = typeof challenges.$inferSelect;

interface Viewer {
  id: string;
  city: string | null;
  groupIds: string[];
}

async function loadViewer(userId: string): Promise<Viewer> {
  const [p] = await db.select({ city: profile.city }).from(profile).where(eq(profile.userId, userId)).limit(1);
  const gs = await db
    .select({ id: groupMembers.groupId })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, 'active')));
  return { id: userId, city: p?.city ?? null, groupIds: gs.map((g) => g.id) };
}

/** Welche Challenges darf/kann eine Person sehen? Allgemein, eigene Stadt, eigene Gruppen. */
function visibleCondition(v: Viewer) {
  const parts = [eq(challenges.scope, 'everyone')];
  if (v.city) parts.push(and(eq(challenges.scope, 'city'), eq(challenges.city, v.city))!);
  if (v.groupIds.length) parts.push(and(eq(challenges.scope, 'group'), inArray(challenges.groupId, v.groupIds))!);
  return or(...parts)!;
}

function canSee(ch: ChallengeRow, v: Viewer, joined: boolean): boolean {
  if (joined) return true; // bereits beigetreten (z. B. nach Umzug) – eigene Teilnahme bleibt sichtbar
  if (ch.scope === 'everyone') return true;
  if (ch.scope === 'city') return !!v.city && ch.city === v.city;
  if (ch.scope === 'group') return !!ch.groupId && v.groupIds.includes(ch.groupId);
  return false;
}

async function toChallenges(rows: ChallengeRow[], userId: string) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const counts = await db
    .select({ id: challengeParticipants.challengeId, n: sql<number>`count(*)::int` })
    .from(challengeParticipants)
    .where(inArray(challengeParticipants.challengeId, ids))
    .groupBy(challengeParticipants.challengeId);
  const mine = await db
    .select()
    .from(challengeParticipants)
    .where(and(inArray(challengeParticipants.challengeId, ids), eq(challengeParticipants.userId, userId)));
  const groupIds = [...new Set(rows.map((r) => r.groupId).filter((g): g is string => !!g))];
  const gs = groupIds.length
    ? await db.select({ id: groups.id, name: groups.name }).from(groups).where(inArray(groups.id, groupIds))
    : [];
  const countMap = new Map(counts.map((c) => [c.id, c.n]));
  const mineMap = new Map(mine.map((m) => [m.challengeId, m]));
  const groupMap = new Map(gs.map((g) => [g.id, g]));
  return rows.map((c) => {
    const p = mineMap.get(c.id);
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      summary: c.summary,
      type: c.type,
      target: c.target,
      unit: c.type === 'walk_count' ? ('walks' as const) : ('km' as const),
      scope: c.scope,
      group: c.groupId ? (groupMap.get(c.groupId) ?? null) : null,
      city: c.city,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      points: c.points,
      participantCount: countMap.get(c.id) ?? 0,
      joined: !!p,
      progress: p?.progress ?? 0,
      completedAt: p?.completedAt?.toISOString() ?? null,
    };
  });
}

async function loadVisible(id: string, v: Viewer): Promise<ChallengeRow> {
  const [ch] = await db.select().from(challenges).where(eq(challenges.id, id)).limit(1);
  if (!ch) throw notFound('challenge_not_found');
  const [p] = await db
    .select({ x: challengeParticipants.userId })
    .from(challengeParticipants)
    .where(and(eq(challengeParticipants.challengeId, id), eq(challengeParticipants.userId, v.id)))
    .limit(1);
  if (!canSee(ch, v, !!p)) throw notFound('challenge_not_found');
  return ch;
}

/* ------------------------------------------------------------------ */

router.get('/', async (req, res) => {
  const userId = me(req).id;
  const v = await loadViewer(userId);
  const now = new Date();
  const active = await db
    .select()
    .from(challenges)
    .where(and(visibleCondition(v), gt(challenges.endsAt, now)))
    .orderBy(asc(challenges.endsAt));
  // vergangene: sichtbare oder selbst beigetretene, die letzten 20
  const joinedIds = (
    await db.select({ id: challengeParticipants.challengeId }).from(challengeParticipants).where(eq(challengeParticipants.userId, userId))
  ).map((r) => r.id);
  const pastCond = joinedIds.length ? or(visibleCondition(v), inArray(challenges.id, joinedIds))! : visibleCondition(v);
  const past = await db
    .select()
    .from(challenges)
    .where(and(pastCond, lte(challenges.endsAt, now)))
    .orderBy(desc(challenges.endsAt))
    .limit(20);
  res.json({ active: await toChallenges(active, userId), past: await toChallenges(past, userId) });
});

router.get('/:id', async (req, res) => {
  const userId = me(req).id;
  const v = await loadViewer(userId);
  const ch = await loadVisible(parse(zId, req.params.id), v);
  const rows = await db
    .select({
      userId: challengeParticipants.userId,
      progress: challengeParticipants.progress,
      completedAt: challengeParticipants.completedAt,
      displayName: profile.displayName,
      mode: profile.leaderboardMode,
    })
    .from(challengeParticipants)
    .leftJoin(profile, eq(profile.userId, challengeParticipants.userId))
    .where(eq(challengeParticipants.challengeId, ch.id))
    .orderBy(
      desc(challengeParticipants.progress),
      sql`${challengeParticipants.completedAt} asc nulls last`,
      asc(challengeParticipants.joinedAt),
    );
  // Blockierte Personen erscheinen nur anonym
  const blocked = new Set(
    (
      await db
        .select({ a: blocks.blockerId, b: blocks.blockedId })
        .from(blocks)
        .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)))
    ).map((r) => (r.a === userId ? r.b : r.a)),
  );
  let rank = 0;
  let prev: number | null = null;
  const ranked = rows.map((r, i) => {
    if (prev === null || r.progress !== prev) rank = i + 1; // gleicher Fortschritt → gleicher Platz
    prev = r.progress;
    const isMe = r.userId === userId;
    const anonymous = !isMe && (r.mode === 'hidden' || blocked.has(r.userId) || !r.displayName);
    return { rank, name: anonymous ? HIDDEN_LEADERBOARD_NAME : (r.displayName ?? ''), progress: r.progress, isMe };
  });
  const mine = ranked.findIndex((r) => r.isMe);
  // Gruppen-Challenge: Namen der Mitglieder nur für aktive Mitglieder. Wer die Gruppe verlassen hat
  // oder gesperrt wurde, sieht nur noch die eigene Zeile.
  const outsider = ch.scope === 'group' && (!ch.groupId || !v.groupIds.includes(ch.groupId));
  const leaderboard = outsider ? (mine >= 0 ? [ranked[mine]] : []) : ranked.slice(0, LEADERBOARD_TOP);
  if (!outsider && mine >= LEADERBOARD_TOP) leaderboard.push(ranked[mine]);
  const [challenge] = await toChallenges([ch], userId);
  res.json({ challenge, leaderboard });
});

router.post('/:id/join', async (req, res) => {
  const userId = me(req).id;
  const v = await loadViewer(userId);
  const ch = await loadVisible(parse(zId, req.params.id), v);
  const [existing] = await db
    .select({ completedAt: challengeParticipants.completedAt })
    .from(challengeParticipants)
    .where(and(eq(challengeParticipants.challengeId, ch.id), eq(challengeParticipants.userId, userId)))
    .limit(1);
  if (!existing) {
    if (ch.endsAt <= new Date()) throw conflict('challenge_ended');
    await db.insert(challengeParticipants).values({ challengeId: ch.id, userId }).onConflictDoNothing();
  }
  // Fortschritt aus vorhandenen Walks im Zeitraum (kann direkt abschließen)
  if (!existing?.completedAt && ch.endsAt > new Date()) await refreshParticipation(ch, userId);
  const [challenge] = await toChallenges([ch], userId);
  res.json({ challenge });
});

router.delete('/:id/join', async (req, res) => {
  const userId = me(req).id;
  const id = parse(zId, req.params.id);
  const [ch] = await db.select({ id: challenges.id }).from(challenges).where(eq(challenges.id, id)).limit(1);
  if (!ch) throw notFound('challenge_not_found');
  await db
    .delete(challengeParticipants)
    .where(and(eq(challengeParticipants.challengeId, id), eq(challengeParticipants.userId, userId)));
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Gruppen-Challenge anlegen (Gruppenleitung)                          */
/* ------------------------------------------------------------------ */

const MAX_TARGET: Record<(typeof CHALLENGE_TYPES)[number], number> = {
  single_distance: 100,
  walk_count: 500,
  total_distance: 5000,
};

const createSchema = z
  .object({
    groupId: zId,
    title: z.string().trim().min(3).max(80),
    summary: z.string().trim().min(5).max(200),
    type: z.enum(CHALLENGE_TYPES),
    target: z.number().positive(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((v, ctx) => {
    if (v.target > MAX_TARGET[v.type]) ctx.addIssue({ code: 'custom', path: ['target'], message: 'too_large' });
    if (v.type === 'walk_count' && !Number.isInteger(v.target))
      ctx.addIssue({ code: 'custom', path: ['target'], message: 'integer' });
    const s = Date.parse(v.startsAt);
    const e = Date.parse(v.endsAt);
    if (e <= s) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'before_start' });
    if (e <= Date.now()) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'in_past' });
    if (e - s > 366 * 24 * 3600 * 1000) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'too_long' });
  });

router.post('/', async (req, res) => {
  const body = parse(createSchema, req.body);
  const userId = me(req).id;
  const group = await requireGroup(body.groupId);
  await requireGroupLead(group.id, userId);
  const [row] = await db
    .insert(challenges)
    .values({
      slug: `gruppe-${randomBytes(6).toString('hex')}`,
      title: body.title,
      summary: body.summary,
      type: body.type,
      target: body.target,
      scope: 'group',
      groupId: group.id,
      city: group.city,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      points: POINTS.challenge,
      createdBy: userId,
    })
    .returning();
  const [challenge] = await toChallenges([row], userId);
  res.status(201).json({ challenge });
});
