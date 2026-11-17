import { appSlug } from '@happywalkers/shared';
import { LIMITS, SEARCH_RADII_KM, TEMPOS, WALK_KINDS } from '@happywalkers/shared';
import { and, asc, eq, gt, gte, inArray, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import {
  canSeeMeetingPoint,
  getMembership,
  isActiveMember,
  isBlockedEitherWay,
  isGroupLead,
  requireActiveMember,
  requireGroup,
  requireGroupLead,
} from '../lib/access.js';
import { boundingBox, distanceKm } from '../lib/geo.js';
import { buildIcs } from '../lib/ics.js';
import { badRequest, conflict, forbidden, notFound, parse, unauthorized, zId, zText } from '../lib/http.js';
import { me, requireUser } from '../middleware/auth.js';
import { onActivityRecorded } from '../services/gamification.js';
import { notifyInterest } from '../services/interest.js';
import { notify } from '../services/notify.js';
import { futureSeriesWalkIds, generateSeriesWalks, TIME_ZONE } from '../services/series.js';
import {
  blockedIds,
  greeting,
  mailPerson,
  personRef,
  personRefs,
  resolveCenter,
  roundKm,
  seriesSummary,
  signOff,
  type PersonRef,
} from './groups.js';

/** Modul „walks“ – Endpunkte siehe docs/API.md (Paket A). */
export const router = Router();

type WalkRow = typeof s.walks.$inferSelect;

/**
 * Ortsangabe für Suchen: PLZ, Browser-Standort oder Profil-PLZ (siehe resolveCenter in groups.ts).
 * Hier definiert (nicht in groups.ts), damit die gegenseitigen Importe beim Laden keine Rolle spielen.
 */
export const zRadius = z.coerce
  .number()
  .int()
  .refine((v) => (SEARCH_RADII_KM as readonly number[]).includes(v), 'radius')
  .default(15);
export const locationQuery = z.object({
  postalCode: z.string().regex(/^\d{5}$/, 'postal_code').optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: zRadius,
});

/* ------------------------------------------------------------------ */
/* Darstellung                                                         */
/* ------------------------------------------------------------------ */

export interface WalkSummary {
  id: string;
  kind: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  distanceKm: number | null;
  tempo: string;
  city: string | null;
  district: string | null;
  lat: number | null;
  lon: number | null;
  distanceFromCenterKm: number | null;
  group: { id: string; name: string; womenOnly: boolean; joinPolicy: string } | null;
  participantCount: number;
  maxParticipants: number | null;
  status: string;
  confirmed: boolean;
  myRsvp: 'yes' | null;
  canSeeMeetingPoint: boolean;
  seriesId: string | null;
}

/**
 * Liste von Walks als WalkSummary. Gibt nur den UNGEFÄHREN Ort (Gruppen-/PLZ-Mittelpunkt) aus,
 * nie den Treffpunkt. `canSeeMeetingPoint` folgt denselben Regeln wie lib/access.ts
 * (für Listen gebündelt abgefragt).
 */
export async function walkSummaries(rows: WalkRow[], viewerId?: string, center?: { lat: number; lon: number } | null): Promise<WalkSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((w) => w.id);
  const groupIds = [...new Set(rows.map((w) => w.groupId).filter((x): x is string => !!x))];
  const groupRows = groupIds.length
    ? await db
        .select({ id: s.groups.id, name: s.groups.name, womenOnly: s.groups.womenOnly, joinPolicy: s.groups.joinPolicy })
        .from(s.groups)
        .where(inArray(s.groups.id, groupIds))
    : [];
  const groupMap = new Map(groupRows.map((g) => [g.id, g]));
  const counts = await db
    .select({ walkId: s.walkRsvps.walkId, n: sql<number>`count(*)::int` })
    .from(s.walkRsvps)
    .where(and(inArray(s.walkRsvps.walkId, ids), eq(s.walkRsvps.status, 'yes')))
    .groupBy(s.walkRsvps.walkId);
  const countMap = new Map(counts.map((c) => [c.walkId, Number(c.n)]));
  const myRsvps = viewerId
    ? await db
        .select({ walkId: s.walkRsvps.walkId, status: s.walkRsvps.status })
        .from(s.walkRsvps)
        .where(and(inArray(s.walkRsvps.walkId, ids), eq(s.walkRsvps.userId, viewerId)))
    : [];
  const myRsvpMap = new Map(myRsvps.map((r) => [r.walkId, r.status]));
  const activeGroups = new Set(
    viewerId && groupIds.length
      ? (
          await db
            .select({ groupId: s.groupMembers.groupId })
            .from(s.groupMembers)
            .where(and(inArray(s.groupMembers.groupId, groupIds), eq(s.groupMembers.userId, viewerId), eq(s.groupMembers.status, 'active')))
        ).map((m) => m.groupId)
      : [],
  );
  const meetingVisible = (w: WalkRow) => {
    if (!viewerId) return false;
    if (w.kind === 'group' && w.groupId) return activeGroups.has(w.groupId);
    if (w.createdBy === viewerId) return true;
    if (w.kind === 'partner') return myRsvpMap.has(w.id);
    return false;
  };
  return rows.map((w) => {
    const g = w.groupId ? groupMap.get(w.groupId) : undefined;
    return {
      id: w.id,
      kind: w.kind,
      title: w.title,
      startsAt: w.startsAt,
      durationMinutes: w.durationMinutes,
      distanceKm: w.distanceKm,
      tempo: w.tempo,
      city: w.city,
      district: w.district,
      lat: w.lat,
      lon: w.lon,
      distanceFromCenterKm: center && w.lat != null && w.lon != null ? roundKm(distanceKm(center.lat, center.lon, w.lat, w.lon)) : null,
      group: g ? { id: g.id, name: g.name, womenOnly: g.womenOnly, joinPolicy: g.joinPolicy } : null,
      participantCount: countMap.get(w.id) ?? 0,
      maxParticipants: w.maxParticipants,
      status: w.status,
      confirmed: !!w.confirmedAt,
      myRsvp: myRsvpMap.get(w.id) === 'yes' ? 'yes' : null,
      canSeeMeetingPoint: meetingVisible(w),
      seriesId: w.seriesId,
    };
  });
}

async function canManageWalk(w: WalkRow, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  // Gruppen-Walk: nur die aktuelle Gruppenleitung (eine gesperrte/entfernte Erstellerin nicht mehr)
  if (w.kind === 'group' && w.groupId) return isGroupLead(await getMembership(w.groupId, userId));
  if (w.createdBy === userId) return true;
  if (w.groupId) return isGroupLead(await getMembership(w.groupId, userId));
  return false;
}

/** Darf die Person den Walk überhaupt sehen? */
async function canViewWalk(w: WalkRow, viewerId: string | undefined): Promise<boolean> {
  if (w.kind === 'partner') {
    if (!viewerId) return false;
    if (w.createdBy === viewerId) return true;
    const [r] = await db
      .select({ s: s.walkRsvps.status })
      .from(s.walkRsvps)
      .where(and(eq(s.walkRsvps.walkId, w.id), eq(s.walkRsvps.userId, viewerId)))
      .limit(1);
    return !!r;
  }
  if (w.groupId) {
    const [g] = await db.select({ joinPolicy: s.groups.joinPolicy }).from(s.groups).where(eq(s.groups.id, w.groupId)).limit(1);
    if (g?.joinPolicy === 'invite') return isActiveMember(await getMembership(w.groupId, viewerId));
  }
  if (viewerId && w.createdBy && (await isBlockedEitherWay(viewerId, w.createdBy)) && w.kind === 'distance') return false;
  return true;
}

/**
 * „Gemeinsam auf Distanz“-Listen (ohne Ortsfilter): ohne Termine blockierter Personen und ohne
 * Termine aus Gruppen „nur auf Einladung“, in denen die Person nicht aktives Mitglied ist
 * (sonst stünden Name und ID der Einladungsgruppe in einer öffentlichen Liste).
 */
export async function visibleDistanceWalks(rows: WalkRow[], viewerId: string | undefined): Promise<WalkRow[]> {
  const blocked = await blockedIds(viewerId);
  const groupIds = [...new Set(rows.map((w) => w.groupId).filter((x): x is string => !!x))];
  const hidden = new Set<string>();
  if (groupIds.length) {
    const inviteGroups = (
      await db
        .select({ id: s.groups.id })
        .from(s.groups)
        .where(and(inArray(s.groups.id, groupIds), eq(s.groups.joinPolicy, 'invite')))
    ).map((g) => g.id);
    const mine = new Set(
      viewerId && inviteGroups.length
        ? (
            await db
              .select({ id: s.groupMembers.groupId })
              .from(s.groupMembers)
              .where(and(inArray(s.groupMembers.groupId, inviteGroups), eq(s.groupMembers.userId, viewerId), eq(s.groupMembers.status, 'active')))
          ).map((m) => m.id)
        : [],
    );
    for (const id of inviteGroups) if (!mine.has(id)) hidden.add(id);
  }
  return rows.filter((w) => (!w.createdBy || !blocked.has(w.createdBy)) && (!w.groupId || !hidden.has(w.groupId)));
}

async function requireVisibleWalk(id: string, viewerId: string | undefined): Promise<WalkRow> {
  const [w] = await db.select().from(s.walks).where(eq(s.walks.id, id)).limit(1);
  if (!w || !(await canViewWalk(w, viewerId))) throw notFound('walk_not_found');
  return w;
}

/** Wer darf die Teilnehmerliste sehen? Gruppen-Walk: aktive Mitglieder; sonst Teilnehmende. */
async function canSeeParticipants(w: WalkRow, viewerId: string | undefined, myRsvp: string | null): Promise<boolean> {
  if (!viewerId) return false;
  if (w.kind === 'group' && w.groupId) return isActiveMember(await getMembership(w.groupId, viewerId));
  if (w.createdBy === viewerId) return true;
  return myRsvp === 'yes' || (w.kind === 'partner' && myRsvp !== null);
}

export async function walkDetail(w: WalkRow, viewerId: string | undefined) {
  const [summary] = await walkSummaries([w], viewerId, null);
  const seeMeeting = await canSeeMeetingPoint(w, viewerId);
  const [mine] = viewerId
    ? await db
        .select({ status: s.walkRsvps.status })
        .from(s.walkRsvps)
        .where(and(eq(s.walkRsvps.walkId, w.id), eq(s.walkRsvps.userId, viewerId)))
        .limit(1)
    : [];
  let participants: PersonRef[] | null = null;
  if (await canSeeParticipants(w, viewerId, mine?.status ?? null)) {
    const rows = await db
      .select({ userId: s.walkRsvps.userId })
      .from(s.walkRsvps)
      .where(and(eq(s.walkRsvps.walkId, w.id), eq(s.walkRsvps.status, 'yes')))
      .orderBy(asc(s.walkRsvps.createdAt));
    const blocked = await blockedIds(viewerId);
    const visible = rows.map((r) => r.userId).filter((id) => id === viewerId || !blocked.has(id));
    const refs = await personRefs(visible);
    participants = visible.map((id) => refs.get(id)!);
  }
  const canManage = await canManageWalk(w, viewerId);
  const createdBy = w.createdBy && viewerId && (await isBlockedEitherWay(viewerId, w.createdBy)) ? null : await personRef(w.createdBy);
  return {
    ...summary,
    canSeeMeetingPoint: seeMeeting,
    description: w.description,
    meetingPoint: seeMeeting
      ? {
          name: w.meetingPointName,
          address: w.meetingAddress,
          description: w.meetingDescription,
          lat: w.meetingLat,
          lon: w.meetingLon,
        }
      : null,
    participants,
    createdBy,
    canManage,
    canConfirm: canManage && w.kind !== 'distance' && w.status === 'planned' && w.startsAt <= new Date(),
  };
}

/* ------------------------------------------------------------------ */
/* Zeit- und Textbausteine                                             */
/* ------------------------------------------------------------------ */

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});
export const formatBerlin = (d: Date) => `${dateFmt.format(d)} Uhr`;

const TEMPO_LABEL: Record<string, string> = { gemuetlich: 'gemütlich', zuegig: 'zügig', flott: 'flott' };

/** Absage: in der App und per E-Mail an alle Zusagenden (außer der absagenden Person). */
async function notifyCancelled(w: WalkRow, actorId: string | null) {
  const rows = await db
    .select({ userId: s.walkRsvps.userId })
    .from(s.walkRsvps)
    .where(and(eq(s.walkRsvps.walkId, w.id), eq(s.walkRsvps.status, 'yes')));
  const when = formatBerlin(w.startsAt);
  for (const { userId } of rows) {
    if (userId === actorId) continue;
    await notify(userId, 'walk_cancelled', { walkId: w.id, title: w.title, startsAt: w.startsAt.toISOString(), groupId: w.groupId });
    await mailPerson(userId, ({ du, name }) => ({
      subject: `Abgesagt: ${w.title} am ${when}`,
      text: [
        greeting(du, name),
        `leider fällt der Walk „${w.title}“ am ${when} aus.`,
        du
          ? 'Schau gern nach einem anderen Termin – vielleicht klappt es beim nächsten Mal.'
          : 'Schauen Sie gern nach einem anderen Termin – vielleicht klappt es beim nächsten Mal.',
        signOff(du),
      ].join('\n\n'),
      button: { label: du ? 'Andere Termine ansehen' : 'Andere Termine ansehen', url: `${config.APP_URL}/walks` },
    }));
  }
}

/** Walk absagen (idempotent). */
export async function cancelWalk(w: WalkRow, actorId: string | null) {
  if (w.status === 'cancelled') return;
  const updated = await db
    .update(s.walks)
    .set({ status: 'cancelled' })
    .where(and(eq(s.walks.id, w.id), ne(s.walks.status, 'cancelled')))
    .returning({ id: s.walks.id });
  if (updated.length) await notifyCancelled(w, actorId);
}

/* ------------------------------------------------------------------ */
/* Suche                                                               */
/* ------------------------------------------------------------------ */

const listQuery = locationQuery.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  tempo: z.enum(TEMPOS).optional(),
  groupId: zId.optional(),
  kind: z.enum(WALK_KINDS).optional(),
  /** `mine=1`: eigene kommende Walks (zugesagt oder selbst erstellt), alle Arten, ohne Ortsfilter */
  mine: z.enum(['1', 'true']).optional(),
});

/** Laufende Walks bleiben noch so lange in „Meine nächsten Walks“. */
const MINE_RUNNING_MS = 3 * 3600_000;

router.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  const viewerId = req.user?.id;

  // Eigene nächste Walks (Startseite): zugesagt oder selbst erstellt, alle Arten, ohne Ortsfilter
  if (q.mine) {
    if (!viewerId) throw unauthorized();
    const from = q.from ?? new Date(Date.now() - MINE_RUNNING_MS);
    const conds: SQL[] = [gte(s.walks.startsAt, from)];
    if (q.to) conds.push(lte(s.walks.startsAt, q.to));
    if (q.kind) conds.push(eq(s.walks.kind, q.kind));
    if (q.tempo) conds.push(eq(s.walks.tempo, q.tempo));
    const mineRsvp = db
      .select({ id: s.walkRsvps.walkId })
      .from(s.walkRsvps)
      .where(and(eq(s.walkRsvps.userId, viewerId), eq(s.walkRsvps.status, 'yes')));
    const rows = await db
      .select()
      .from(s.walks)
      .where(and(...conds, or(eq(s.walks.createdBy, viewerId), inArray(s.walks.id, mineRsvp))))
      .orderBy(asc(s.walks.startsAt), asc(s.walks.id))
      .limit(200);
    // Gruppen-Walks nur, solange die Person dort aktives Mitglied ist (gesperrt/ausgetreten → nicht mehr „meine“)
    const groupIds = [...new Set(rows.filter((w) => w.kind === 'group' && w.groupId).map((w) => w.groupId!))];
    const active = new Set(
      groupIds.length
        ? (
            await db
              .select({ id: s.groupMembers.groupId })
              .from(s.groupMembers)
              .where(and(inArray(s.groupMembers.groupId, groupIds), eq(s.groupMembers.userId, viewerId), eq(s.groupMembers.status, 'active')))
          ).map((m) => m.id)
        : [],
    );
    const blocked = await blockedIds(viewerId);
    const visible = rows.filter(
      (w) =>
        (w.kind !== 'group' || (w.groupId && active.has(w.groupId))) &&
        (!w.createdBy || w.createdBy === viewerId || w.kind === 'group' || !blocked.has(w.createdBy)),
    );
    res.json({ walks: await walkSummaries(visible, viewerId, null), center: null, nearest: [] });
    return;
  }
  const from = q.from ?? new Date();
  const maxTo = new Date(from.getTime() + 366 * 86_400_000);
  let to = q.to ?? new Date(from.getTime() + 30 * 86_400_000);
  if (to > maxTo) to = maxTo;
  const conds: SQL[] = [gte(s.walks.startsAt, from), lte(s.walks.startsAt, to)];
  if (q.tempo) conds.push(eq(s.walks.tempo, q.tempo));

  // Gruppenkalender: ohne Ortsfilter
  if (q.groupId) {
    const g = await requireGroup(q.groupId);
    if (g.joinPolicy === 'invite' && !isActiveMember(await getMembership(g.id, viewerId))) throw notFound('group_not_found');
    const rows = await db
      .select()
      .from(s.walks)
      .where(and(...conds, eq(s.walks.groupId, g.id), ...(q.kind ? [eq(s.walks.kind, q.kind)] : [])))
      .orderBy(asc(s.walks.startsAt))
      .limit(200);
    res.json({ walks: await walkSummaries(rows, viewerId, null), center: null, nearest: [] });
    return;
  }

  // Gemeinsam auf Distanz: ohne Ortsfilter
  if (q.kind === 'distance') {
    const rows = await db
      .select()
      .from(s.walks)
      .where(and(...conds, eq(s.walks.kind, 'distance')))
      .orderBy(asc(s.walks.startsAt))
      .limit(200);
    const visible = await visibleDistanceWalks(rows, viewerId);
    res.json({ walks: await walkSummaries(visible, viewerId, null), center: null, nearest: [] });
    return;
  }

  // eigene Gehpartner-Walks
  if (q.kind === 'partner') {
    if (!viewerId) {
      res.json({ walks: [], center: null, nearest: [] });
      return;
    }
    const rows = await db
      .select({ w: s.walks })
      .from(s.walks)
      .innerJoin(s.walkRsvps, and(eq(s.walkRsvps.walkId, s.walks.id), eq(s.walkRsvps.userId, viewerId)))
      .where(and(...conds, eq(s.walks.kind, 'partner')))
      .orderBy(asc(s.walks.startsAt));
    res.json({ walks: await walkSummaries(rows.map((r) => r.w), viewerId, null), center: null, nearest: [] });
    return;
  }

  // Gruppen-Walks in der Nähe; Einladungsgruppen nur für Mitglieder
  const myGroups = viewerId
    ? (
        await db
          .select({ id: s.groupMembers.groupId })
          .from(s.groupMembers)
          .where(and(eq(s.groupMembers.userId, viewerId), eq(s.groupMembers.status, 'active')))
      ).map((r) => r.id)
    : [];
  const visibleGroup = myGroups.length
    ? or(ne(s.groups.joinPolicy, 'invite'), inArray(s.groups.id, myGroups))!
    : ne(s.groups.joinPolicy, 'invite');
  conds.push(eq(s.walks.kind, 'group'), visibleGroup);

  const center = await resolveCenter(q, viewerId);
  if (center) {
    const box = boundingBox(center.lat, center.lon, 100);
    conds.push(gte(s.walks.lat, box.minLat), lte(s.walks.lat, box.maxLat), gte(s.walks.lon, box.minLon), lte(s.walks.lon, box.maxLon));
  }
  const rows = (
    await db
      .select({ w: s.walks })
      .from(s.walks)
      .innerJoin(s.groups, eq(s.groups.id, s.walks.groupId))
      .where(and(...conds))
      .orderBy(asc(s.walks.startsAt))
      .limit(center ? 2000 : 200)
  ).map((r) => r.w);
  if (!center) {
    res.json({ walks: await walkSummaries(rows, viewerId, null), center: null, nearest: [] });
    return;
  }
  const withDist = rows.map((w) => ({ w, d: distanceKm(center.lat, center.lon, w.lat ?? 0, w.lon ?? 0) })).filter((x) => x.d <= 100);
  const inside = withDist.filter((x) => x.d <= q.radiusKm).map((x) => x.w);
  let nearest: WalkRow[] = [];
  if (inside.length < 3) {
    nearest = withDist
      .filter((x) => x.d > q.radiusKm && x.w.status === 'planned')
      .sort((a, b) => a.d - b.d || a.w.startsAt.getTime() - b.w.startsAt.getTime())
      .slice(0, 3)
      .map((x) => x.w);
  }
  res.json({
    walks: await walkSummaries(inside.slice(0, 200), viewerId, center),
    center,
    nearest: await walkSummaries(nearest, viewerId, center),
  });
});

/* ------------------------------------------------------------------ */
/* Anlegen, ändern, absagen                                            */
/* ------------------------------------------------------------------ */

const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time');
const walkFields = {
  title: z.string().trim().min(3).max(100),
  description: zText(LIMITS.maxTextLength),
  startsAt: z.coerce.date(),
  durationMinutes: z.number().int().min(10).max(600),
  distanceKm: z.number().positive().max(100).nullable(),
  tempo: z.enum(TEMPOS),
  meetingPointName: zText(120),
  meetingAddress: zText(200),
  meetingDescription: zText(1000),
  meetingLat: z.number().min(-90).max(90).nullable(),
  meetingLon: z.number().min(-180).max(180).nullable(),
  maxParticipants: z.number().int().min(2).max(500).nullable(),
};

const createBody = z.object({
  kind: z.enum(['group', 'distance']),
  groupId: zId.optional(),
  title: walkFields.title,
  description: walkFields.description.default(''),
  startsAt: walkFields.startsAt.optional(),
  durationMinutes: walkFields.durationMinutes.default(60),
  distanceKm: walkFields.distanceKm.optional(),
  tempo: walkFields.tempo.default('zuegig'),
  meetingPointName: walkFields.meetingPointName.default(''),
  meetingAddress: walkFields.meetingAddress.default(''),
  meetingDescription: walkFields.meetingDescription.default(''),
  meetingLat: walkFields.meetingLat.optional(),
  meetingLon: walkFields.meetingLon.optional(),
  maxParticipants: walkFields.maxParticipants.optional(),
  recurring: z.object({ weekday: z.number().int().min(0).max(6), timeOfDay: zTime }).optional(),
});

const missing = (field: string) => badRequest('invalid_input', [{ field, code: 'required', message: field }]);

router.post('/', requireUser, async (req, res) => {
  const body = parse(createBody, req.body);
  const userId = me(req).id;
  let group: typeof s.groups.$inferSelect | null = null;
  if (body.kind === 'group') {
    if (!body.groupId) throw missing('groupId');
    group = await requireGroup(body.groupId);
    await requireGroupLead(group.id, userId);
    if (!body.meetingPointName) throw missing('meetingPointName');
    if (!body.meetingAddress) throw missing('meetingAddress');
  } else {
    if (body.recurring) throw badRequest('invalid_input', [{ field: 'recurring', code: 'not_allowed', message: 'recurring' }]);
    if (body.groupId) {
      group = await requireGroup(body.groupId);
      await requireActiveMember(group.id, userId);
    }
  }
  if (!body.recurring) {
    if (!body.startsAt) throw missing('startsAt');
    if (body.startsAt.getTime() < Date.now() - 5 * 60_000) throw conflict('walk_in_past');
  }

  // ungefährer Ort: Gruppe bzw. PLZ-Mittelpunkt der Erstellerin
  let loc: { postalCode: string | null; city: string | null; district: string | null; lat: number | null; lon: number | null };
  if (group) loc = { postalCode: group.postalCode, city: group.city, district: group.district, lat: group.lat, lon: group.lon };
  else {
    const [p] = await db.select().from(s.profile).where(eq(s.profile.userId, userId)).limit(1);
    loc = { postalCode: p?.postalCode ?? null, city: p?.city ?? null, district: p?.district ?? null, lat: p?.lat ?? null, lon: p?.lon ?? null };
  }

  let walk: WalkRow | undefined;
  let seriesId: string | undefined;
  if (body.recurring && group) {
    const [series] = await db
      .insert(s.walkSeries)
      .values({
        groupId: group.id,
        title: body.title,
        description: body.description,
        weekday: body.recurring.weekday,
        timeOfDay: body.recurring.timeOfDay,
        durationMinutes: body.durationMinutes,
        distanceKm: body.distanceKm ?? null,
        tempo: body.tempo,
        meetingPointName: body.meetingPointName,
        meetingAddress: body.meetingAddress,
        meetingDescription: body.meetingDescription,
        meetingLat: body.meetingLat ?? null,
        meetingLon: body.meetingLon ?? null,
        maxParticipants: body.maxParticipants ?? null,
        createdBy: userId,
      })
      .returning();
    seriesId = series.id;
    await generateSeriesWalks(series);
    [walk] = await db
      .select()
      .from(s.walks)
      .where(and(eq(s.walks.seriesId, series.id), gt(s.walks.startsAt, new Date())))
      .orderBy(asc(s.walks.startsAt))
      .limit(1);
  } else {
    [walk] = await db
      .insert(s.walks)
      .values({
        kind: body.kind,
        groupId: group?.id ?? null,
        title: body.title,
        description: body.description,
        startsAt: body.startsAt!,
        durationMinutes: body.durationMinutes,
        distanceKm: body.distanceKm ?? null,
        tempo: body.tempo,
        meetingPointName: body.meetingPointName,
        meetingAddress: body.meetingAddress,
        meetingDescription: body.meetingDescription,
        meetingLat: body.meetingLat ?? null,
        meetingLon: body.meetingLon ?? null,
        maxParticipants: body.maxParticipants ?? null,
        ...loc,
        createdBy: userId,
      })
      .returning();
    // „Gemeinsam auf Distanz“: wer den Termin anlegt, macht selbst mit
    if (body.kind === 'distance') {
      await db.insert(s.walkRsvps).values({ walkId: walk.id, userId, status: 'yes' }).onConflictDoNothing();
    }
  }
  if (!walk) throw badRequest('invalid_input');
  if (body.kind === 'group' && group && group.joinPolicy !== 'invite') {
    await notifyInterest({ kind: 'walk', lat: group.lat, lon: group.lon, city: group.city, actorId: userId, path: `/walks/${walk.id}` });
  }
  res.status(201).json({ walk: await walkDetail(walk, userId), ...(seriesId ? { seriesId } : {}) });
});

const patchBody = z.object(walkFields).partial();

function sentFields<T extends object>(req: Request, body: T): Partial<T> {
  const sent = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(body)) if (k in sent && v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

router.patch('/series/:id', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const body = parse(
    z.object({ ...walkFields, weekday: z.number().int().min(0).max(6), timeOfDay: zTime }).omit({ startsAt: true }).partial(),
    req.body,
  );
  const userId = me(req).id;
  const [series] = await db.select().from(s.walkSeries).where(eq(s.walkSeries.id, id)).limit(1);
  if (!series) throw notFound('walk_not_found');
  await requireGroupLead(series.groupId, userId);
  const patch = sentFields(req, body);
  if (!Object.keys(patch).length) {
    res.json({ series: seriesSummary(series) });
    return;
  }
  const [updated] = await db.update(s.walkSeries).set(patch).where(eq(s.walkSeries.id, id)).returning();
  // künftige Termine ohne Zusagen anpassen
  const future = await futureSeriesWalkIds(id);
  const withRsvp = future.length
    ? new Set(
        (
          await db
            .select({ walkId: s.walkRsvps.walkId })
            .from(s.walkRsvps)
            .where(and(inArray(s.walkRsvps.walkId, future), eq(s.walkRsvps.status, 'yes')))
        ).map((r) => r.walkId),
      )
    : new Set<string>();
  const free = future.filter((w) => !withRsvp.has(w));
  if (free.length) {
    if (patch.weekday !== undefined || patch.timeOfDay !== undefined) {
      await db.delete(s.walks).where(inArray(s.walks.id, free));
    } else {
      const { weekday: _w, timeOfDay: _t, ...walkPatch } = patch;
      if (Object.keys(walkPatch).length) await db.update(s.walks).set(walkPatch).where(inArray(s.walks.id, free));
    }
  }
  await generateSeriesWalks(updated);
  res.json({ series: seriesSummary(updated) });
});

router.delete('/series/:id', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const userId = me(req).id;
  const [series] = await db.select().from(s.walkSeries).where(eq(s.walkSeries.id, id)).limit(1);
  if (!series) throw notFound('walk_not_found');
  await requireGroupLead(series.groupId, userId);
  await db.update(s.walkSeries).set({ active: false }).where(eq(s.walkSeries.id, id));
  const future = await futureSeriesWalkIds(id);
  if (future.length) {
    const rows = await db.select().from(s.walks).where(inArray(s.walks.id, future));
    const withRsvp = new Set(
      (
        await db
          .select({ walkId: s.walkRsvps.walkId })
          .from(s.walkRsvps)
          .where(and(inArray(s.walkRsvps.walkId, future), eq(s.walkRsvps.status, 'yes')))
      ).map((r) => r.walkId),
    );
    // Termine mit Zusagen werden abgesagt (mit Nachricht), alle anderen entfallen still.
    for (const w of rows) if (withRsvp.has(w.id)) await cancelWalk(w, userId);
    const free = rows.filter((w) => !withRsvp.has(w.id)).map((w) => w.id);
    if (free.length) await db.delete(s.walks).where(inArray(s.walks.id, free));
  }
  res.json({ ok: true });
});

router.get('/:id', async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const w = await requireVisibleWalk(id, req.user?.id);
  res.json({ walk: await walkDetail(w, req.user?.id) });
});

router.patch('/:id', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const userId = me(req).id;
  const body = parse(patchBody, req.body);
  const w = await requireVisibleWalk(id, userId);
  if (!(await canManageWalk(w, userId))) throw forbidden('not_group_lead');
  const patch = sentFields(req, body);
  if (w.kind === 'group' && (patch.meetingPointName === '' || patch.meetingAddress === '')) {
    throw missing(patch.meetingPointName === '' ? 'meetingPointName' : 'meetingAddress');
  }
  if (Object.keys(patch).length) await db.update(s.walks).set(patch).where(eq(s.walks.id, w.id));
  const [fresh] = await db.select().from(s.walks).where(eq(s.walks.id, w.id));
  res.json({ walk: await walkDetail(fresh, userId) });
});

router.delete('/:id', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const userId = me(req).id;
  const w = await requireVisibleWalk(id, userId);
  if (!(await canManageWalk(w, userId))) throw forbidden('not_group_lead');
  await cancelWalk(w, userId);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Zusagen, Kalender, Bestätigen                                       */
/* ------------------------------------------------------------------ */

router.put('/:id/rsvp', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const { status } = parse(z.object({ status: z.enum(['yes', 'no']) }), req.body);
  const userId = me(req).id;
  const w = await requireVisibleWalk(id, userId);
  if (w.kind === 'group' && w.groupId) await requireActiveMember(w.groupId, userId);

  const result = await db.transaction(async (tx) => {
    // Zeile sperren → „voll“ wird auch bei gleichzeitigen Zusagen korrekt geprüft
    const [locked] = await tx.select().from(s.walks).where(eq(s.walks.id, w.id)).for('update');
    const [mine] = await tx
      .select({ status: s.walkRsvps.status })
      .from(s.walkRsvps)
      .where(and(eq(s.walkRsvps.walkId, w.id), eq(s.walkRsvps.userId, userId)));
    if (status === 'yes') {
      if (locked.status === 'cancelled') throw conflict('walk_cancelled');
      if (locked.startsAt <= new Date()) throw conflict('walk_in_past');
      if (mine?.status !== 'yes') {
        if (locked.maxParticipants != null) {
          const [{ n }] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(s.walkRsvps)
            .where(and(eq(s.walkRsvps.walkId, w.id), eq(s.walkRsvps.status, 'yes')));
          if (Number(n) >= locked.maxParticipants) throw conflict('walk_full');
        }
        await tx
          .insert(s.walkRsvps)
          .values({ walkId: w.id, userId, status: 'yes' })
          .onConflictDoUpdate({ target: [s.walkRsvps.walkId, s.walkRsvps.userId], set: { status: 'yes' } });
      }
    } else if (mine && mine.status !== 'no') {
      await tx
        .update(s.walkRsvps)
        .set({ status: 'no' })
        .where(and(eq(s.walkRsvps.walkId, w.id), eq(s.walkRsvps.userId, userId)));
    }
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(s.walkRsvps)
      .where(and(eq(s.walkRsvps.walkId, w.id), eq(s.walkRsvps.status, 'yes')));
    return { myRsvp: status === 'yes' ? ('yes' as const) : null, participantCount: Number(n) };
  });
  res.json(result);
});

router.get('/:id/ics', async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const viewerId = req.user?.id;
  const w = await requireVisibleWalk(id, viewerId);
  const seeMeeting = await canSeeMeetingPoint(w, viewerId);
  const location = seeMeeting
    ? [w.meetingPointName, w.meetingAddress].filter(Boolean).join(', ')
    : w.kind === 'distance'
      ? 'Jede Person an ihrem eigenen Ort'
      : [w.city, w.district && w.district !== w.city ? w.district : null].filter(Boolean).join(', ');
  const url = `${config.APP_URL}/walks/${w.id}`;
  const description = [
    w.status === 'cancelled' ? 'ABGESAGT' : null,
    w.description,
    `Tempo: ${TEMPO_LABEL[w.tempo] ?? w.tempo}`,
    w.distanceKm ? `Strecke: etwa ${w.distanceKm} km` : null,
    seeMeeting && w.meetingDescription ? `Treffpunkt: ${w.meetingDescription}` : null,
    url,
  ]
    .filter(Boolean)
    .join('\n');
  const ics = buildIcs({
    uid: w.id,
    title: (w.status === 'cancelled' ? 'Abgesagt: ' : '') + w.title,
    description,
    location,
    start: w.startsAt,
    durationMinutes: w.durationMinutes,
    url,
  });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${appSlug(config.APP_NAME)}-walk.ics"`);
  res.send(ics);
});

router.post('/:id/confirm', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const body = parse(
    z.object({
      distanceKm: z.number().positive().max(LIMITS.maxActivityKm),
      durationMinutes: z.number().int().min(1).max(LIMITS.maxActivityMinutes),
      attendeeIds: z.array(zId).max(500).optional(),
    }),
    req.body,
  );
  const userId = me(req).id;
  const w = await requireVisibleWalk(id, userId);
  if (w.kind === 'distance' || !(await canManageWalk(w, userId))) throw forbidden('not_group_lead');
  if (w.status === 'cancelled') throw conflict('walk_cancelled');
  if (w.startsAt > new Date()) throw conflict('walk_not_started');

  // Teilnehmende: angegebene Personen (nur Mitglieder bzw. Zusagende) oder alle Zusagen
  const rsvpYes = (
    await db
      .select({ userId: s.walkRsvps.userId })
      .from(s.walkRsvps)
      .where(and(eq(s.walkRsvps.walkId, w.id), eq(s.walkRsvps.status, 'yes')))
  ).map((r) => r.userId);
  let attendees = rsvpYes;
  if (body.attendeeIds) {
    const wanted = [...new Set(body.attendeeIds)];
    let allowed: Set<string>;
    if (w.kind === 'group' && w.groupId) {
      allowed = new Set(
        wanted.length
          ? (
              await db
                .select({ userId: s.groupMembers.userId })
                .from(s.groupMembers)
                .where(and(eq(s.groupMembers.groupId, w.groupId), eq(s.groupMembers.status, 'active'), inArray(s.groupMembers.userId, wanted)))
            ).map((m) => m.userId)
          : [],
      );
    } else {
      allowed = new Set(rsvpYes);
    }
    attendees = wanted.filter((u) => allowed.has(u));
  }

  const inserted = attendees.length
    ? await db
        .insert(s.activities)
        .values(
          attendees.map((uid) => ({
            userId: uid,
            startedAt: w.startsAt,
            durationMinutes: body.durationMinutes,
            distanceKm: body.distanceKm,
            source: 'group',
            walkId: w.id,
            title: w.title,
            city: w.city,
            district: w.district,
            visibility: 'group',
          })),
        )
        .onConflictDoNothing({ target: [s.activities.userId, s.activities.walkId] })
        .returning({ id: s.activities.id, userId: s.activities.userId })
    : [];

  if (!w.confirmedAt) {
    await db
      .update(s.walks)
      .set({ confirmedAt: new Date(), confirmedBy: userId, confirmedDistanceKm: body.distanceKm, confirmedDurationMinutes: body.durationMinutes })
      .where(eq(s.walks.id, w.id));
  }
  for (const a of inserted) {
    try {
      await onActivityRecorded(a.userId, a.id);
    } catch (err) {
      console.error('Punkte/Abzeichen fehlgeschlagen', err);
    }
    if (a.userId !== userId) {
      await notify(a.userId, 'walk_confirmed', { walkId: w.id, title: w.title, distanceKm: body.distanceKm, activityId: a.id });
    }
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.activities)
    .where(eq(s.activities.walkId, w.id));
  res.json({ confirmedCount: Number(n) });
});
