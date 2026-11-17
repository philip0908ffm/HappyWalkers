import { JOIN_POLICIES, LIMITS, TEMPOS } from '@happywalkers/shared';
import { and, asc, eq, gt, gte, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { Router, type Request } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import {
  canJoinWomenOnly,
  getMembership,
  isActiveMember,
  isFounder,
  isGroupLead,
  requireActiveMember,
  requireGroup,
  requireGroupLead,
  type Membership,
} from '../lib/access.js';
import { sendMail, textToHtml } from '../lib/email.js';
import { boundingBox, distanceKm, lookupPostalCode, nearestPlace, type Place } from '../lib/geo.js';
import { badRequest, conflict, forbidden, notFound, parse, tooManyRequests, zId, zPostalCode, zText } from '../lib/http.js';
import { codeLookupLimiter } from '../lib/ratelimit.js';
import { me, requireUser } from '../middleware/auth.js';
import { awardBadge } from '../services/gamification.js';
import { notifyInterest } from '../services/interest.js';
import { notify } from '../services/notify.js';
import { deleteStoredFiles, resolveKey, storeImage } from '../services/storage.js';
import { locationQuery, walkSummaries, type WalkSummary } from './walks.js';

/** Modul „groups“ – Endpunkte siehe docs/API.md (Paket A). */
export const router = Router();

type GroupRow = typeof s.groups.$inferSelect;

/* ------------------------------------------------------------------ */
/* Gemeinsame Bausteine (auch von walks, invites, rural genutzt)       */
/* ------------------------------------------------------------------ */

export interface PersonRef {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Personen als PersonRef – nie E-Mail, Telefon, Geburtsjahr, Geschlecht. */
export async function personRefs(ids: (string | null | undefined)[]): Promise<Map<string, PersonRef>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, PersonRef>();
  if (!unique.length) return out;
  const rows = await db
    .select({ id: s.profile.userId, displayName: s.profile.displayName, avatarPath: s.profile.avatarPath })
    .from(s.profile)
    .where(inArray(s.profile.userId, unique));
  for (const r of rows) {
    out.set(r.id, { id: r.id, displayName: r.displayName || 'Mitglied', avatarUrl: r.avatarPath ? `/api/v1/photos/avatar/${r.id}` : null });
  }
  for (const id of unique) if (!out.has(id)) out.set(id, { id, displayName: 'Mitglied', avatarUrl: null });
  return out;
}

export async function personRef(id: string | null | undefined): Promise<PersonRef | null> {
  if (!id) return null;
  return (await personRefs([id])).get(id) ?? null;
}

/** Personen, die mit `viewerId` in einer Blockierung stehen (in beide Richtungen). */
export async function blockedIds(viewerId: string | undefined): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const rows = await db
    .select({ a: s.blocks.blockerId, b: s.blocks.blockedId })
    .from(s.blocks)
    .where(or(eq(s.blocks.blockerId, viewerId), eq(s.blocks.blockedId, viewerId)));
  return new Set(rows.map((r) => (r.a === viewerId ? r.b : r.a)));
}

export async function resolveCenter(
  q: { postalCode?: string; lat?: number; lon?: number },
  userId: string | undefined,
): Promise<Place | null> {
  if (q.postalCode) {
    const place = lookupPostalCode(q.postalCode);
    if (!place) throw badRequest('postal_code_unknown');
    return place;
  }
  if (q.lat !== undefined && q.lon !== undefined) {
    const near = nearestPlace(q.lat, q.lon);
    const lat = Math.round(q.lat * 1000) / 1000;
    const lon = Math.round(q.lon * 1000) / 1000;
    return near ? { ...near, lat, lon } : { postalCode: '', city: '', district: '', state: '', lat, lon };
  }
  if (userId) {
    const [p] = await db.select({ postalCode: s.profile.postalCode }).from(s.profile).where(eq(s.profile.userId, userId)).limit(1);
    if (p?.postalCode) return lookupPostalCode(p.postalCode);
  }
  return null;
}

export const roundKm = (km: number) => Math.round(km * 10) / 10;

/** E-Mail an eine Person in ihrer Anrede (Sie/Du), nur wenn E-Mail-Benachrichtigungen erlaubt sind. */
export async function mailPerson(
  userId: string,
  build: (v: { du: boolean; name: string }) => { subject: string; text: string; button?: { label: string; url: string } },
  opts: { force?: boolean } = {},
) {
  const [row] = await db
    .select({ email: s.user.email, name: s.profile.displayName, anrede: s.profile.anrede, emailNotifications: s.profile.emailNotifications })
    .from(s.user)
    .leftJoin(s.profile, eq(s.profile.userId, s.user.id))
    .where(eq(s.user.id, userId))
    .limit(1);
  if (!row?.email || row.email.endsWith('.invalid')) return;
  if (!opts.force && row.emailNotifications === false) return;
  const m = build({ du: row.anrede === 'du', name: row.name ?? '' });
  try {
    await sendMail({ to: row.email, subject: m.subject, text: m.text, html: textToHtml(m.text, m.button) });
  } catch (err) {
    console.error('E-Mail fehlgeschlagen', err);
  }
}

export const greeting = (du: boolean, name: string) =>
  name ? (du ? `Hallo ${name},` : `Guten Tag ${name},`) : du ? 'Hallo,' : 'Guten Tag,';
export const signOff = (du: boolean) => `Herzliche Grüße\n${du ? 'Dein' : 'Ihr'} ${config.APP_NAME}-Team`;

/* ------------------------------------------------------------------ */
/* Einladungscode                                                      */
/* ------------------------------------------------------------------ */

/** Ohne verwechselbare Zeichen 0/O/1/I. 32 Zeichen → gleichverteilt aus einem Byte. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'WALK-' + Array.from(bytes, (b) => CODE_ALPHABET[b % 32]).join('');
}

/** „walk 4k7p9x“, „4K7P9X“ → „WALK-4K7P9X“ */
export function normalizeCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = raw.startsWith('WALK') ? raw.slice(4) : raw;
  return `WALK-${body}`;
}

export const isInviteCode = (input: string) => /^(WALK)?[-\s]?[A-Z0-9]{6}$/i.test(input.trim());

export function inviteLinks(code: string, groupName: string) {
  const url = `${config.APP_URL}/einladung/${code}`;
  const text = `Kommen Sie mit zu unserer Gehgruppe „${groupName}“ bei ${config.APP_NAME}! Hier können Sie beitreten: ${url} (Einladungscode: ${code})`;
  return {
    url,
    code,
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}`,
    mailtoUrl: `mailto:?subject=${encodeURIComponent(`Einladung: ${groupName}`)}&body=${encodeURIComponent(text)}`,
  };
}

/* ------------------------------------------------------------------ */
/* Darstellung                                                         */
/* ------------------------------------------------------------------ */

export interface GroupSummary {
  id: string;
  name: string;
  city: string;
  district: string | null;
  distanceKm: number | null;
  memberCount: number;
  joinPolicy: string;
  womenOnly: boolean;
  defaultTempo: string;
  photoUrl: string | null;
  nextWalk: { id: string; title: string; startsAt: Date } | null;
  myMembership: { role: string; status: string } | null;
}

export const groupPhotoUrl = (g: { id: string; photoPath: string | null }) =>
  g.photoPath ? `/api/v1/groups/${g.id}/photo?v=${encodeURIComponent(g.photoPath.slice(-12, -4))}` : null;

export async function groupSummaries(rows: GroupRow[], viewerId?: string, center?: { lat: number; lon: number } | null): Promise<GroupSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((g) => g.id);
  const counts = await db
    .select({ groupId: s.groupMembers.groupId, n: sql<number>`count(*)::int` })
    .from(s.groupMembers)
    .where(and(inArray(s.groupMembers.groupId, ids), eq(s.groupMembers.status, 'active')))
    .groupBy(s.groupMembers.groupId);
  const countMap = new Map(counts.map((c) => [c.groupId, Number(c.n)]));
  const next = await db
    .selectDistinctOn([s.walks.groupId], { groupId: s.walks.groupId, id: s.walks.id, title: s.walks.title, startsAt: s.walks.startsAt })
    .from(s.walks)
    .where(and(inArray(s.walks.groupId, ids), eq(s.walks.status, 'planned'), gt(s.walks.startsAt, new Date())))
    .orderBy(s.walks.groupId, asc(s.walks.startsAt));
  const nextMap = new Map(next.map((w) => [w.groupId, { id: w.id, title: w.title, startsAt: w.startsAt }]));
  const mine = viewerId
    ? await db
        .select({ groupId: s.groupMembers.groupId, role: s.groupMembers.role, status: s.groupMembers.status })
        .from(s.groupMembers)
        .where(and(inArray(s.groupMembers.groupId, ids), eq(s.groupMembers.userId, viewerId)))
    : [];
  const mineMap = new Map(mine.map((m) => [m.groupId, { role: m.role, status: m.status }]));
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    city: g.city,
    district: g.district,
    distanceKm: center ? roundKm(distanceKm(center.lat, center.lon, g.lat, g.lon)) : null,
    memberCount: countMap.get(g.id) ?? 0,
    joinPolicy: g.joinPolicy,
    womenOnly: g.womenOnly,
    defaultTempo: g.defaultTempo,
    photoUrl: groupPhotoUrl(g),
    nextWalk: nextMap.get(g.id) ?? null,
    myMembership: mineMap.get(g.id) ?? null,
  }));
}

export function seriesSummary(x: typeof s.walkSeries.$inferSelect) {
  return {
    id: x.id,
    title: x.title,
    weekday: x.weekday,
    timeOfDay: x.timeOfDay,
    durationMinutes: x.durationMinutes,
    tempo: x.tempo,
    distanceKm: x.distanceKm,
    active: x.active,
  };
}

export async function upcomingGroupWalks(groupId: string, viewerId: string | undefined, limit = 8): Promise<WalkSummary[]> {
  const rows = await db
    .select()
    .from(s.walks)
    .where(and(eq(s.walks.groupId, groupId), gt(s.walks.startsAt, new Date())))
    .orderBy(asc(s.walks.startsAt))
    .limit(limit);
  return walkSummaries(rows, viewerId, null);
}

export async function groupDetail(g: GroupRow, viewerId: string | undefined) {
  const [summary] = await groupSummaries([g], viewerId, null);
  const m = await getMembership(g.id, viewerId);
  const leadRows = await db
    .select({ userId: s.groupMembers.userId, role: s.groupMembers.role })
    .from(s.groupMembers)
    .where(and(eq(s.groupMembers.groupId, g.id), eq(s.groupMembers.status, 'active'), inArray(s.groupMembers.role, ['founder', 'moderator'])))
    .orderBy(asc(s.groupMembers.joinedAt));
  const refs = await personRefs(leadRows.map((l) => l.userId));
  const leads = leadRows
    .sort((a, b) => (a.role === 'founder' ? -1 : b.role === 'founder' ? 1 : 0))
    .map((l) => ({ ...refs.get(l.userId)!, role: l.role as 'founder' | 'moderator' }));
  const series = await db
    .select()
    .from(s.walkSeries)
    .where(and(eq(s.walkSeries.groupId, g.id), eq(s.walkSeries.active, true)))
    .orderBy(asc(s.walkSeries.weekday), asc(s.walkSeries.timeOfDay));
  return {
    ...summary,
    description: g.description,
    rules: g.rules,
    leads,
    upcomingWalks: await upcomingGroupWalks(g.id, viewerId),
    series: series.map(seriesSummary),
    inviteCode: isActiveMember(m) ? g.inviteCode : null,
    canManage: isGroupLead(m),
    isFounder: isFounder(m),
  };
}

/** Darf die Person die Gruppe sehen? „Nur auf Einladung“: nur Mitglieder und per E-Mail Eingeladene. */
async function canViewGroup(g: GroupRow, viewer: { id: string; email: string } | undefined, m: Membership): Promise<boolean> {
  if (g.joinPolicy !== 'invite') return true;
  if (!viewer) return false;
  if (m && (m.status === 'active' || m.status === 'pending')) return true;
  const inv = await db
    .select({ id: s.groupInvites.id })
    .from(s.groupInvites)
    .where(
      and(
        eq(s.groupInvites.groupId, g.id),
        eq(s.groupInvites.email, viewer.email.toLowerCase()),
        gt(s.groupInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return inv.length > 0;
}

async function loadVisibleGroup(req: Request) {
  const { id } = parse(z.object({ id: zId }), req.params);
  const g = await requireGroup(id);
  const m = await getMembership(g.id, req.user?.id);
  if (!(await canViewGroup(g, req.user, m))) throw notFound('group_not_found');
  return { g, m };
}

/* ------------------------------------------------------------------ */
/* Beitreten (auch von invites genutzt)                                */
/* ------------------------------------------------------------------ */

/**
 * Tritt einer Gruppe bei. `viaInvite`: Einladung umgeht „auf Anfrage“ und „nur auf Einladung“,
 * nicht aber Sperre und „nur Frauen“. Idempotent.
 */
export async function joinGroup(
  g: GroupRow,
  userId: string,
  opts: { viaInvite?: boolean; viaCode?: boolean; message?: string; invitedBy?: string | null } = {},
): Promise<{ membership: { role: string; status: string }; newlyActive: boolean }> {
  const m = await getMembership(g.id, userId);
  if (m?.status === 'banned') throw forbidden('banned');
  if (m?.status === 'active') return { membership: { role: m.role, status: m.status }, newlyActive: false };
  if (g.womenOnly && !(await canJoinWomenOnly(userId))) throw forbidden('women_only');

  let status: 'active' | 'pending';
  if (opts.viaInvite) status = 'active';
  else if (opts.viaCode) status = g.joinPolicy === 'request' ? 'pending' : 'active';
  else if (g.joinPolicy === 'invite') throw forbidden('invite_only');
  else status = g.joinPolicy === 'request' ? 'pending' : 'active';

  if (m?.status === 'pending' && status === 'pending') return { membership: { role: m.role, status: 'pending' }, newlyActive: false };

  await db
    .insert(s.groupMembers)
    .values({
      groupId: g.id,
      userId,
      role: 'member',
      status,
      requestMessage: status === 'pending' ? (opts.message ?? null) : null,
      invitedBy: opts.invitedBy ?? null,
    })
    .onConflictDoUpdate({
      target: [s.groupMembers.groupId, s.groupMembers.userId],
      set: { status, ...(opts.invitedBy ? { invitedBy: opts.invitedBy } : {}) },
      // eine Sperre, die zwischenzeitlich gesetzt wurde, nie überschreiben
      setWhere: ne(s.groupMembers.status, 'banned'),
    });
  const after = await getMembership(g.id, userId);
  if (!after || after.status === 'banned') throw forbidden('banned');

  if (after.status === 'pending' && m?.status !== 'pending') {
    const leads = await db
      .select({ userId: s.groupMembers.userId })
      .from(s.groupMembers)
      .where(and(eq(s.groupMembers.groupId, g.id), eq(s.groupMembers.status, 'active'), inArray(s.groupMembers.role, ['founder', 'moderator'])));
    const ref = await personRef(userId);
    for (const l of leads) {
      await notify(l.userId, 'join_request', { groupId: g.id, groupName: g.name, userId, displayName: ref?.displayName });
    }
  }
  return { membership: { role: after.role, status: after.status }, newlyActive: after.status === 'active' };
}

/* ------------------------------------------------------------------ */
/* Vorlagen                                                            */
/* ------------------------------------------------------------------ */

const TEMPLATES = [
  {
    key: 'morgenrunde',
    name: 'Morgenrunde im Park',
    description:
      'Wir treffen uns am Vormittag im Park und gehen gemeinsam eine Stunde zügig. Danach ist oft noch Zeit für ein kurzes Gespräch. Neue Gesichter sind herzlich willkommen.',
    rules:
      'Wir warten höchstens 5 Minuten. Bitte sagen Sie kurz zu, wenn Sie kommen. Wir gehen zusammen los und kommen zusammen an – niemand wird zurückgelassen.',
    defaultTempo: 'zuegig',
    joinPolicy: 'open',
    series: { weekday: 2, timeOfDay: '10:00', durationMinutes: 60, tempo: 'zuegig' },
  },
  {
    key: 'feierabend',
    name: 'Feierabend-Walk',
    description:
      'Nach der Arbeit oder am frühen Abend den Kopf frei bekommen: Wir gehen eine gute Stunde in flottem Schritt durch die Stadt oder am Wasser entlang.',
    rules:
      'Bitte tragen Sie bei Dunkelheit helle Kleidung oder eine Leuchtweste. Bitte sagen Sie ab, wenn Sie doch nicht kommen können.',
    defaultTempo: 'flott',
    joinPolicy: 'open',
    series: { weekday: 4, timeOfDay: '18:00', durationMinutes: 60, tempo: 'flott' },
  },
  {
    key: 'frauen-wochenende',
    name: 'Frauen-Walk am Wochenende',
    description:
      'Eine Gruppe nur für Frauen. Wir gehen am Samstagvormittag gemeinsam zügig und in angenehmer Runde. Ob Anfängerin oder geübt – Sie sind willkommen.',
    rules:
      'Diese Gruppe ist nur für Frauen. Wir gehen gemeinsam los und achten aufeinander. Was in der Gruppe besprochen wird, bleibt in der Gruppe.',
    defaultTempo: 'zuegig',
    joinPolicy: 'request',
    womenOnly: true,
    series: { weekday: 6, timeOfDay: '10:00', durationMinutes: 75, tempo: 'zuegig' },
  },
  {
    key: 'dorfrunde',
    name: 'Dorfrunde',
    description:
      'Wir gehen gemeinsam durch unser Dorf und die Felder ringsum. Jede und jeder kann mitmachen, das Tempo ist gemütlich bis zügig. Treffpunkt ist ein bekannter Ort im Ort.',
    rules:
      'Wir passen das Tempo an die langsamste Person an. Bitte melden Sie sich kurz, wenn Sie mitkommen. Hunde an der Leine sind willkommen.',
    defaultTempo: 'gemuetlich',
    joinPolicy: 'open',
    series: { weekday: 3, timeOfDay: '15:00', durationMinutes: 60, tempo: 'gemuetlich' },
  },
] as const;

/* ------------------------------------------------------------------ */
/* Routen                                                              */
/* ------------------------------------------------------------------ */

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.maxUploadBytes, files: 1 } });

router.get('/templates', (_req, res) => {
  res.json({ templates: TEMPLATES.map((t) => ({ womenOnly: false, ...t })) });
});

/** Suche (öffentlich): nur Gruppen, die nicht „nur auf Einladung“ sind. */
router.get('/', async (req, res) => {
  const q = parse(locationQuery.extend({ q: z.string().trim().max(60).optional() }), req.query);
  const viewerId = req.user?.id;
  const center = await resolveCenter(q, viewerId);
  const conds = [ne(s.groups.joinPolicy, 'invite')];
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
    conds.push(or(ilike(s.groups.name, like), ilike(s.groups.city, like), ilike(s.groups.description, like))!);
  }
  if (!center) {
    const rows = await db.select().from(s.groups).where(and(...conds)).orderBy(asc(s.groups.name)).limit(50);
    res.json({ groups: await groupSummaries(rows, viewerId, null), center: null, nearest: [] });
    return;
  }
  const box = boundingBox(center.lat, center.lon, 100);
  const rows = await db
    .select()
    .from(s.groups)
    .where(
      and(
        ...conds,
        gte(s.groups.lat, box.minLat),
        sql`${s.groups.lat} <= ${box.maxLat}`,
        gte(s.groups.lon, box.minLon),
        sql`${s.groups.lon} <= ${box.maxLon}`,
      ),
    );
  const withDist = rows
    .map((g) => ({ g, d: distanceKm(center.lat, center.lon, g.lat, g.lon) }))
    .filter((x) => x.d <= 100)
    .sort((a, b) => a.d - b.d);
  const inside = withDist.filter((x) => x.d <= q.radiusKm);
  const outside = inside.length < 3 ? withDist.filter((x) => x.d > q.radiusKm).slice(0, 3) : [];
  res.json({
    groups: await groupSummaries(inside.slice(0, 100).map((x) => x.g), viewerId, center),
    center,
    nearest: await groupSummaries(outside.map((x) => x.g), viewerId, center),
  });
});

const groupBody = z.object({
  name: z.string().trim().min(3).max(80),
  description: zText(LIMITS.maxTextLength).default(''),
  rules: zText(LIMITS.maxTextLength).default(''),
  joinPolicy: z.enum(JOIN_POLICIES).default('open'),
  womenOnly: z.boolean().default(false),
  postalCode: zPostalCode,
  defaultTempo: z.enum(TEMPOS).default('zuegig'),
});

function placeOf(postalCode: string) {
  const place = lookupPostalCode(postalCode);
  if (!place) throw badRequest('postal_code_unknown');
  return place;
}

router.post('/', requireUser, async (req, res) => {
  const body = parse(groupBody, req.body);
  const userId = me(req).id;
  if (body.womenOnly && !(await canJoinWomenOnly(userId))) throw forbidden('women_only');
  const place = placeOf(body.postalCode);
  const g = await db.transaction(async (tx) => {
    let created: GroupRow | undefined;
    for (let i = 0; i < 5 && !created; i++) {
      [created] = await tx
        .insert(s.groups)
        .values({
          name: body.name,
          description: body.description,
          rules: body.rules,
          joinPolicy: body.joinPolicy,
          womenOnly: body.womenOnly,
          defaultTempo: body.defaultTempo,
          postalCode: place.postalCode,
          city: place.city,
          district: place.district,
          lat: place.lat,
          lon: place.lon,
          inviteCode: newInviteCode(),
          createdBy: userId,
        })
        .onConflictDoNothing({ target: s.groups.inviteCode })
        .returning();
    }
    if (!created) throw new Error('Kein freier Einladungscode');
    await tx.insert(s.groupMembers).values({ groupId: created.id, userId, role: 'founder', status: 'active' });
    return created;
  });
  await awardBadge(userId, 'group_founder');
  if (g.joinPolicy !== 'invite') {
    await notifyInterest({ kind: 'group', lat: g.lat, lon: g.lon, city: g.city, actorId: userId, path: `/gruppen/${g.id}` });
  }
  res.status(201).json({ group: await groupDetail(g, userId) });
});

router.get('/:id', async (req, res) => {
  const { g } = await loadVisibleGroup(req);
  res.json({ group: await groupDetail(g, req.user?.id) });
});

router.patch('/:id', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const body = parse(groupBody.partial(), req.body);
  const userId = me(req).id;
  const g = await requireGroup(id);
  await requireGroupLead(g.id, userId);
  // .partial() lässt die Standardwerte stehen → nur wirklich gesendete Felder übernehmen
  const sent = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const patch: Partial<typeof s.groups.$inferInsert> = {};
  for (const key of ['name', 'description', 'rules', 'joinPolicy', 'womenOnly', 'defaultTempo'] as const) {
    if (key in sent && body[key] !== undefined) (patch as Record<string, unknown>)[key] = body[key];
  }
  if (patch.womenOnly && !g.womenOnly && !(await canJoinWomenOnly(userId))) throw forbidden('women_only');
  let place: Place | null = null;
  if (body.postalCode && body.postalCode !== g.postalCode) {
    place = placeOf(body.postalCode);
    Object.assign(patch, { postalCode: place.postalCode, city: place.city, district: place.district, lat: place.lat, lon: place.lon });
  }
  if (Object.keys(patch).length) {
    await db.update(s.groups).set(patch).where(eq(s.groups.id, g.id));
    if (place) {
      // ungefährer Ort künftiger Termine mitziehen
      await db
        .update(s.walks)
        .set({ postalCode: place.postalCode, city: place.city, district: place.district, lat: place.lat, lon: place.lon })
        .where(and(eq(s.walks.groupId, g.id), gt(s.walks.startsAt, new Date())));
    }
  }
  res.json({ group: await groupDetail(await requireGroup(g.id), userId) });
});

router.delete('/:id', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const userId = me(req).id;
  const g = await requireGroup(id);
  if (!isFounder(await getMembership(g.id, userId))) throw forbidden('not_founder');
  await db.delete(s.groups).where(eq(s.groups.id, g.id));
  await deleteStoredFiles([g.photoPath]);
  res.json({ ok: true });
});

/* ---------- Foto der Gruppenleitung / der Gruppe ---------- */

router.post('/:id/photo', requireUser, upload.single('photo'), async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const g = await requireGroup(id);
  await requireGroupLead(g.id, me(req).id);
  if (!req.file) throw badRequest('invalid_input', [{ field: 'photo', code: 'required', message: 'photo' }]);
  const stored = await storeImage(req.file.buffer, { folder: 'groups', maxSize: 1200 });
  await db.update(s.groups).set({ photoPath: stored.key }).where(eq(s.groups.id, g.id));
  await deleteStoredFiles([g.photoPath]);
  res.json({ photoUrl: groupPhotoUrl({ id: g.id, photoPath: stored.key }) });
});

/** Gruppenbild: öffentlich wie Name und Ort der Gruppe (auch auf der Einladungsseite sichtbar). */
router.get('/:id/photo', async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const g = await requireGroup(id);
  if (!g.photoPath) throw notFound('photo_not_found');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(resolveKey(g.photoPath), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: { code: 'photo_not_found' } });
  });
});

/* ---------- Mitgliedschaft ---------- */

router.post('/join-by-code', requireUser, codeLookupLimiter, async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().min(4).max(20) }), req.body);
  const [g] = await db.select().from(s.groups).where(eq(s.groups.inviteCode, normalizeCode(code))).limit(1);
  if (!g) throw notFound('invite_invalid');
  const { membership } = await joinGroup(g, me(req).id, { viaCode: true });
  res.json({ groupId: g.id, membership });
});

router.post('/:id/join', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const { message } = parse(z.object({ message: zText(500).optional() }), req.body ?? {});
  const g = await requireGroup(id);
  // Einladungsgruppen: wer sie nicht sehen darf, erfährt auch hier nicht, dass es sie gibt (404 statt 403)
  if (!(await canViewGroup(g, req.user, await getMembership(g.id, me(req).id)))) throw notFound('group_not_found');
  const { membership } = await joinGroup(g, me(req).id, { message });
  res.json({ membership });
});

router.post('/:id/leave', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const userId = me(req).id;
  const g = await requireGroup(id);
  const m = await getMembership(g.id, userId);
  if (m?.role === 'founder' && m.status === 'active') throw conflict('founder_cannot_leave');
  // Eine Sperre bleibt bestehen (sonst könnte man sie durch Austreten aufheben).
  if (m && m.status !== 'banned') {
    await db.delete(s.groupMembers).where(and(eq(s.groupMembers.groupId, g.id), eq(s.groupMembers.userId, userId)));
  }
  res.json({ ok: true });
});

async function memberView(groupId: string, userId: string) {
  const [row] = await db
    .select()
    .from(s.groupMembers)
    .where(and(eq(s.groupMembers.groupId, groupId), eq(s.groupMembers.userId, userId)))
    .limit(1);
  if (!row) return null;
  const ref = await personRef(userId);
  return { ...ref!, role: row.role, status: row.status, joinedAt: row.joinedAt };
}

router.get('/:id/members', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const userId = me(req).id;
  const g = await requireGroup(id);
  const m = await getMembership(g.id, userId);
  if (!isActiveMember(m)) {
    if (!(await canViewGroup(g, req.user, m))) throw notFound('group_not_found');
    throw forbidden('not_group_member');
  }
  const lead = isGroupLead(m);
  const rows = await db
    .select()
    .from(s.groupMembers)
    .where(and(eq(s.groupMembers.groupId, g.id), lead ? undefined : eq(s.groupMembers.status, 'active')))
    .orderBy(asc(s.groupMembers.joinedAt));
  const blocked = await blockedIds(userId);
  const visible = rows.filter((r) => r.userId === userId || !blocked.has(r.userId));
  const refs = await personRefs(visible.map((r) => r.userId));
  const roleOrder: Record<string, number> = { founder: 0, moderator: 1, member: 2 };
  const statusOrder: Record<string, number> = { pending: 0, active: 1, banned: 2 };
  res.json({
    members: visible
      .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || roleOrder[a.role] - roleOrder[b.role])
      .map((r) => ({
        ...refs.get(r.userId)!,
        role: r.role,
        status: r.status,
        joinedAt: r.joinedAt,
        ...(lead && r.status === 'pending' && r.requestMessage ? { requestMessage: r.requestMessage } : {}),
      })),
  });
});

const MEMBER_ACTIONS = ['approve', 'decline', 'remove', 'ban', 'unban', 'make_moderator', 'remove_moderator', 'make_founder'] as const;

router.patch('/:id/members/:userId', requireUser, async (req, res) => {
  const params = parse(z.object({ id: zId, userId: zId }), req.params);
  const { action } = parse(z.object({ action: z.enum(MEMBER_ACTIONS) }), req.body);
  const actorId = me(req).id;
  const g = await requireGroup(params.id);
  const actor = await requireGroupLead(g.id, actorId);
  const targetId = params.userId;
  if (targetId === actorId) throw badRequest('invalid_input', [{ field: 'userId', code: 'self', message: 'self' }]);
  const target = await getMembership(g.id, targetId);
  if (!target && action !== 'ban') throw notFound('user_not_found');
  const where = and(eq(s.groupMembers.groupId, g.id), eq(s.groupMembers.userId, targetId));
  const founderOnly = ['make_moderator', 'remove_moderator', 'make_founder'].includes(action);
  if (founderOnly && actor.role !== 'founder') throw forbidden('not_founder');
  // Moderatorinnen dürfen keine andere Leitung entfernen oder sperren
  if (target && target.role !== 'member' && target.status === 'active' && actor.role !== 'founder') throw forbidden('not_founder');
  if (target?.role === 'founder') throw forbidden('not_founder');

  switch (action) {
    case 'approve':
      if (target!.status === 'pending') {
        // „nur Frauen“ gilt auch bei der Freigabe (Gruppe kann seit der Anfrage umgestellt worden sein)
        if (g.womenOnly && !(await canJoinWomenOnly(targetId))) throw forbidden('women_only');
        await db.update(s.groupMembers).set({ status: 'active', requestMessage: null }).where(where);
        await notify(targetId, 'join_approved', { groupId: g.id, groupName: g.name });
      } else if (target!.status === 'banned') throw forbidden('banned');
      break;
    case 'decline':
      // still ablehnen, keine Benachrichtigung
      if (target!.status === 'pending') await db.delete(s.groupMembers).where(where);
      break;
    case 'remove':
      // KEINE Benachrichtigung an die betroffene Person
      if (target!.status !== 'banned') await db.delete(s.groupMembers).where(where);
      break;
    case 'ban': {
      // KEINE Benachrichtigung; Sperre auch ohne bestehende Mitgliedschaft möglich
      const [exists] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.id, targetId)).limit(1);
      if (!exists) throw notFound('user_not_found');
      await db
        .insert(s.groupMembers)
        .values({ groupId: g.id, userId: targetId, role: 'member', status: 'banned' })
        .onConflictDoUpdate({ target: [s.groupMembers.groupId, s.groupMembers.userId], set: { role: 'member', status: 'banned', requestMessage: null } });
      break;
    }
    case 'unban':
      if (target!.status === 'banned') await db.delete(s.groupMembers).where(where);
      break;
    case 'make_moderator':
      if (target!.status !== 'active') throw forbidden('not_group_member');
      await db.update(s.groupMembers).set({ role: 'moderator' }).where(where);
      break;
    case 'remove_moderator':
      if (target!.role === 'moderator') await db.update(s.groupMembers).set({ role: 'member' }).where(where);
      break;
    case 'make_founder':
      if (target!.status !== 'active') throw forbidden('not_group_member');
      await db.transaction(async (tx) => {
        await tx.update(s.groupMembers).set({ role: 'founder' }).where(where);
        await tx
          .update(s.groupMembers)
          .set({ role: 'moderator' })
          .where(and(eq(s.groupMembers.groupId, g.id), eq(s.groupMembers.userId, actorId)));
      });
      break;
  }
  res.json({ member: await memberView(g.id, targetId) });
});

/* ---------- Einladen ---------- */

router.get('/:id/invite', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const g = await requireGroup(id);
  await requireActiveMember(g.id, me(req).id);
  res.json(inviteLinks(g.inviteCode, g.name));
});

const INVITE_DAYS = 14;
/** Höchstens so viele Einladungs-Mails je Person in 24 Stunden (Schutz vor Spam über unsere Absender-Domain). */
export const INVITE_MAILS_PER_DAY = 30;

router.post('/:id/invite/email', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const body = parse(
    z.object({
      emails: z.array(z.email().trim().toLowerCase().max(200)).min(1).max(10),
      message: zText(500).optional(),
    }),
    req.body,
  );
  const userId = me(req).id;
  const g = await requireGroup(id);
  await requireActiveMember(g.id, userId);
  const inviter = await personRef(userId);
  const emails = [...new Set(body.emails.map((e) => e.toLowerCase()))];
  const [{ n: sentToday }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.groupInvites)
    .where(and(eq(s.groupInvites.createdBy, userId), gt(s.groupInvites.createdAt, new Date(Date.now() - 86_400_000))));
  if (Number(sentToday) + emails.length > INVITE_MAILS_PER_DAY) throw tooManyRequests();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  let sent = 0;
  for (const email of emails) {
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
    await db.insert(s.groupInvites).values({ groupId: g.id, token, email, createdBy: userId, expiresAt });
    const url = `${config.APP_URL}/einladung/${token}`;
    const name = inviter?.displayName ?? 'Ein Mitglied';
    const text = [
      'Guten Tag,',
      `${name} lädt Sie in die Gehgruppe „${g.name}“ in ${g.city} ein. Bei ${config.APP_NAME} verabreden sich Menschen, um gemeinsam zügig zu gehen – in angenehmer Gesellschaft und im eigenen Tempo.`,
      ...(body.message ? [`Persönliche Nachricht von ${name}:\n„${body.message}“`] : []),
      `Mit diesem Link können Sie der Gruppe beitreten:\n${url}`,
      `Der Link ist ${INVITE_DAYS} Tage gültig. Wenn Sie die Einladung nicht annehmen möchten, löschen Sie diese E-Mail einfach.`,
      signOff(false),
    ].join('\n\n');
    try {
      await sendMail({
        to: email,
        subject: `${name} lädt Sie zur Gehgruppe „${g.name}“ ein`,
        text,
        html: textToHtml(text, { label: 'Einladung ansehen', url }),
      });
      sent++;
    } catch (err) {
      console.error('Einladungs-Mail fehlgeschlagen', err);
    }
  }
  res.json({ sent });
});

router.get('/:id/poster', requireUser, async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const userId = me(req).id;
  const g = await requireGroup(id);
  await requireActiveMember(g.id, userId);
  const links = inviteLinks(g.inviteCode, g.name);
  const qrSvg = await QRCode.toString(links.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  const series = await db
    .select()
    .from(s.walkSeries)
    .where(and(eq(s.walkSeries.groupId, g.id), eq(s.walkSeries.active, true)))
    .orderBy(asc(s.walkSeries.weekday));
  const nextWalks = (await upcomingGroupWalks(g.id, userId, 4)).filter((w) => w.status === 'planned');
  res.json({
    group: { name: g.name, city: g.city, description: g.description },
    code: g.inviteCode,
    url: links.url,
    qrSvg,
    series: series.map(seriesSummary),
    nextWalks,
  });
});
