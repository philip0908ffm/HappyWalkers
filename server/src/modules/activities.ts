import { maskRouteForOthers } from '../lib/geo.js';
import { LIMITS, VISIBILITIES } from '@happywalkers/shared';
import { and, desc, eq, gte, lt, or, sql } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db/index.js';
import { activities, groupMembers, posts, profile } from '../db/schema.js';
import { canSeeContent, getMembership, isActiveMember, isBlockedEitherWay } from '../lib/access.js';
import { nearestPlace } from '../lib/geo.js';
import { parseGpx, simplifyRoute } from '../lib/gpx.js';
import { ApiError, forbidden, notFound, parse, zId, zText } from '../lib/http.js';
import { me, requireUser } from '../middleware/auth.js';
import { onActivityDeleted, onActivityRecorded } from '../services/gamification.js';

/** Modul „activities“ – eingetragene Walks (Paket B, siehe docs/API.md). */
export const router = Router();
router.use(requireUser);

type ActivityRow = typeof activities.$inferSelect;

/** Höchsttempo für zügiges Gehen (Plausibilität). */
export const MAX_SPEED_KMH = 15;
/** Erlaubte Abweichung der Uhrzeit des Geräts in die Zukunft. */
const CLOCK_SKEW_MS = 10 * 60 * 1000;

export function toActivity(a: ActivityRow) {
  return {
    id: a.id,
    startedAt: a.startedAt.toISOString(),
    durationMinutes: a.durationMinutes,
    distanceKm: a.distanceKm,
    route: a.route ?? null,
    source: a.source,
    walkId: a.walkId,
    title: a.title,
    note: a.note,
    city: a.city,
    district: a.district,
    visibility: a.visibility,
    createdAt: a.createdAt.toISOString(),
    speedKmh: a.durationMinutes > 0 ? Math.round((a.distanceKm / (a.durationMinutes / 60)) * 10) / 10 : 0,
  };
}

/** Haben zwei Personen mindestens eine Gruppe, in der beide aktives Mitglied sind? */
export async function sharesActiveGroup(a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  const rows = await db.execute(sql`
    select 1 from ${groupMembers} m1
    join ${groupMembers} m2 on m2.group_id = m1.group_id
    where m1.user_id = ${a} and m1.status = 'active' and m2.user_id = ${b} and m2.status = 'active'
    limit 1`);
  return rows.rows.length > 0;
}

/**
 * Sichtbarkeit eines eingetragenen Walks für andere Personen.
 * Eine Aktivität gehört zu keiner Gruppe; „group“ heißt hier: sichtbar für aktive Mitglieder
 * gemeinsamer Gruppen. Alle anderen Stufen wie `canSeeContent` (inkl. Blockieren).
 */
export async function canSeeActivity(a: { userId: string; visibility: string }, viewerId: string): Promise<boolean> {
  if (a.userId === viewerId) return true;
  if (a.visibility === 'group') {
    if (await isBlockedEitherWay(a.userId, viewerId)) return false;
    return sharesActiveGroup(a.userId, viewerId);
  }
  return canSeeContent({ ownerId: a.userId, visibility: a.visibility, groupId: null }, viewerId);
}

/* ------------------------------------------------------------------ */
/* Plausibilität                                                       */
/* ------------------------------------------------------------------ */

const zCoord = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const zRoute = z.array(zCoord).min(2).max(50_000);

function checkPlausible(v: { startedAt: Date; durationMinutes: number; distanceKm: number }) {
  const issues: { field: string; code: string }[] = [];
  if (!(v.distanceKm > 0) || v.distanceKm > LIMITS.maxActivityKm) issues.push({ field: 'distanceKm', code: 'out_of_range' });
  if (v.durationMinutes < 1 || v.durationMinutes > LIMITS.maxActivityMinutes)
    issues.push({ field: 'durationMinutes', code: 'out_of_range' });
  if (v.startedAt.getTime() > Date.now() + CLOCK_SKEW_MS) issues.push({ field: 'startedAt', code: 'in_future' });
  if (v.startedAt.getTime() < Date.UTC(2000, 0, 1)) issues.push({ field: 'startedAt', code: 'too_old' });
  if (!issues.length && v.distanceKm / (v.durationMinutes / 60) > MAX_SPEED_KMH)
    issues.push({ field: 'distanceKm', code: 'too_fast' });
  if (issues.length) throw new ApiError(400, 'implausible_activity', undefined, issues);
}

/** Ort für regionale Wappen: Routenstart, sonst Profil-PLZ. */
async function placeFor(userId: string, route: [number, number][] | null) {
  if (route?.length) {
    const p = nearestPlace(route[0][1], route[0][0]);
    if (p) return { city: p.city, district: p.district };
  }
  const [p] = await db
    .select({ city: profile.city, district: profile.district })
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1);
  return { city: p?.city ?? null, district: p?.district ?? null };
}

/* ------------------------------------------------------------------ */
/* Liste                                                               */
/* ------------------------------------------------------------------ */

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

function encodeCursor(a: ActivityRow) {
  return Buffer.from(`${a.startedAt.toISOString()}|${a.id}`).toString('base64url');
}
function decodeCursor(c: string): { t: Date; id: string } {
  const [t, id] = Buffer.from(c, 'base64url').toString('utf8').split('|');
  const d = new Date(t);
  if (!id || Number.isNaN(d.getTime())) throw new ApiError(400, 'invalid_input', undefined, [{ field: 'cursor', code: 'invalid' }]);
  return { t: d, id };
}

router.get('/', async (req, res) => {
  const q = parse(listSchema, req.query);
  const userId = me(req).id;
  const conds = [eq(activities.userId, userId)];
  if (q.from) conds.push(gte(activities.startedAt, new Date(q.from)));
  if (q.to) conds.push(lt(activities.startedAt, new Date(q.to)));
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    conds.push(or(lt(activities.startedAt, c.t), and(eq(activities.startedAt, c.t), lt(activities.id, c.id)))!);
  }
  const rows = await db
    .select()
    .from(activities)
    .where(and(...conds))
    .orderBy(desc(activities.startedAt), desc(activities.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  res.json({ activities: page.map(toActivity), nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]) : null });
});

/* ------------------------------------------------------------------ */
/* Eintragen                                                           */
/* ------------------------------------------------------------------ */

const createSchema = z.object({
  startedAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int(),
  distanceKm: z.number(),
  route: zRoute.nullable().optional(),
  /** 'gpx', wenn die Werte aus der GPX-Vorschau stammen */
  source: z.enum(['manual', 'gpx']).optional(),
  title: zText(120).nullable().optional(),
  note: zText(LIMITS.maxTextLength).nullable().optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  share: z.boolean().optional(),
  groupId: zId.nullable().optional(),
});

router.post('/', async (req, res) => {
  const body = parse(createSchema, req.body);
  const userId = me(req).id;
  const startedAt = new Date(body.startedAt);
  const distanceKm = Math.round(body.distanceKm * 100) / 100;
  checkPlausible({ startedAt, durationMinutes: body.durationMinutes, distanceKm });

  if (body.share && body.groupId) {
    if (!isActiveMember(await getMembership(body.groupId, userId))) throw forbidden('not_group_member');
  }

  const route = body.route ? simplifyRoute(body.route as [number, number][]) : null;
  const place = await placeFor(userId, route);
  const visibility = body.visibility ?? 'group';
  const [row] = await db
    .insert(activities)
    .values({
      userId,
      startedAt,
      durationMinutes: body.durationMinutes,
      distanceKm,
      route,
      source: body.source ?? 'manual',
      title: body.title || null,
      note: body.note || null,
      city: place.city,
      district: place.district,
      visibility,
    })
    .returning();

  const award = await onActivityRecorded(userId, row.id);

  let post: { id: string } | null = null;
  if (body.share) {
    const [p] = await db
      .insert(posts)
      .values({
        authorId: userId,
        activityId: row.id,
        groupId: body.groupId ?? null,
        text: body.note || body.title || '',
        visibility,
      })
      .returning({ id: posts.id });
    post = p;
  }
  res.status(201).json({ activity: toActivity(row), award, post });
});

/* ------------------------------------------------------------------ */
/* GPX-Vorschau                                                        */
/* ------------------------------------------------------------------ */

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.maxGpxBytes, files: 1 } });

function gpxUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    const e = err as { code?: string };
    if (e.code === 'LIMIT_FILE_SIZE') return next(err);
    next(new ApiError(400, 'invalid_gpx', undefined, [{ field: 'file', code: 'upload' }]));
  });
}

router.post('/gpx', gpxUpload, (req, res) => {
  if (!req.file?.buffer?.length) throw new ApiError(400, 'invalid_gpx', undefined, [{ field: 'file', code: 'missing' }]);
  res.json({ preview: parseGpx(req.file.buffer) });
});

/* ------------------------------------------------------------------ */
/* Einzelner Walk                                                      */
/* ------------------------------------------------------------------ */

async function loadOwn(id: string, userId: string): Promise<ActivityRow> {
  const [row] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.userId, userId)))
    .limit(1);
  if (!row) throw notFound('activity_not_found');
  return row;
}

router.get('/:id', async (req, res) => {
  const id = parse(zId, req.params.id);
  const viewerId = me(req).id;
  const [row] = await db.select().from(activities).where(eq(activities.id, id)).limit(1);
  if (!row || !(await canSeeActivity(row, viewerId))) throw notFound('activity_not_found');
  const [p] = await db
    .select({ displayName: profile.displayName, avatarPath: profile.avatarPath })
    .from(profile)
    .where(eq(profile.userId, row.userId))
    .limit(1);
  const activity = toActivity(row);
  if (row.userId !== viewerId) activity.route = maskRouteForOthers(row.route);
  res.json({
    activity,
    author: {
      id: row.userId,
      displayName: p?.displayName ?? '',
      avatarUrl: p?.avatarPath ? `/api/v1/photos/avatar/${row.userId}` : null,
    },
  });
});

const patchSchema = z.object({
  title: zText(120).nullable().optional(),
  note: zText(LIMITS.maxTextLength).nullable().optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  distanceKm: z.number().optional(),
  durationMinutes: z.number().int().optional(),
  startedAt: z.iso.datetime({ offset: true }).optional(),
});

router.patch('/:id', async (req, res) => {
  const id = parse(zId, req.params.id);
  const body = parse(patchSchema, req.body);
  const userId = me(req).id;
  const row = await loadOwn(id, userId);
  const measured = body.distanceKm !== undefined || body.durationMinutes !== undefined || body.startedAt !== undefined;
  if (measured && row.source === 'group') {
    // bestätigte Gruppen-Walks: Strecke, Dauer und Zeitpunkt legt die Gruppenleitung fest
    throw new ApiError(400, 'invalid_input', undefined, [{ field: 'distanceKm', code: 'group_walk_locked' }]);
  }
  const patch: Partial<typeof activities.$inferInsert> = {};
  if (body.title !== undefined) patch.title = body.title || null;
  if (body.note !== undefined) patch.note = body.note || null;
  if (body.visibility !== undefined) patch.visibility = body.visibility;
  if (measured) {
    const next = {
      startedAt: body.startedAt ? new Date(body.startedAt) : row.startedAt,
      durationMinutes: body.durationMinutes ?? row.durationMinutes,
      distanceKm: body.distanceKm !== undefined ? Math.round(body.distanceKm * 100) / 100 : row.distanceKm,
    };
    checkPlausible(next);
    Object.assign(patch, next);
  }
  let updated = row;
  if (Object.keys(patch).length) {
    [updated] = await db.update(activities).set(patch).where(eq(activities.id, row.id)).returning();
  }
  if (measured) {
    await onActivityDeleted(userId); // Fortschritt neu berechnen (kann sinken)
    await onActivityRecorded(userId, row.id); // ggf. neue Abzeichen/Abschlüsse; Punkte bleiben unverändert
  }
  if (body.visibility !== undefined) {
    // Sichtbarkeit des zugehörigen Beitrags mitziehen
    await db.update(posts).set({ visibility: body.visibility }).where(eq(posts.activityId, row.id));
  }
  res.json({ activity: toActivity(updated) });
});

router.delete('/:id', async (req, res) => {
  const id = parse(zId, req.params.id);
  const userId = me(req).id;
  const row = await loadOwn(id, userId);
  await db.delete(activities).where(eq(activities.id, row.id));
  await onActivityDeleted(userId);
  res.json({ ok: true });
});
