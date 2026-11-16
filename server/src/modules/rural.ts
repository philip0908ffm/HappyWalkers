import { TEMPOS } from '@gehmeinsam/shared';
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { isBlockedEitherWay } from '../lib/access.js';
import { distanceKm, lookupPostalCode } from '../lib/geo.js';
import { badRequest, conflict, notFound, parse, zId, zPostalCode, zText } from '../lib/http.js';
import { me, requireUser } from '../middleware/auth.js';
import { notifyInterest } from '../services/interest.js';
import { notify } from '../services/notify.js';
import { blockedIds, greeting, groupSummaries, mailPerson, personRefs, resolveCenter, roundKm, signOff } from './groups.js';
import { formatBerlin, walkSummaries, zRadius } from './walks.js';

/** Modul „rural“ – ländliche Regionen: Überblick, Interesse anmelden, Gehpartner. */
export const router = Router();
router.use(requireUser);

const RADIUS_OPTIONS = [15, 30, 50] as const;
/** In ländlichen Regionen ist der Standard-Umkreis größer als in der Stadt. */
const ruralRadius = zRadius.default(30);

function placeOf(postalCode: string) {
  const place = lookupPostalCode(postalCode);
  if (!place) throw badRequest('postal_code_unknown');
  return place;
}

async function myInterest(userId: string) {
  const [a] = await db.select().from(s.interestAlerts).where(eq(s.interestAlerts.userId, userId)).limit(1);
  if (!a) return null;
  return { postalCode: a.postalCode, city: lookupPostalCode(a.postalCode)?.city ?? '', radiusKm: a.radiusKm, createdAt: a.createdAt };
}

/* ------------------------------------------------------------------ */
/* Überblick                                                           */
/* ------------------------------------------------------------------ */

router.get('/overview', async (req, res) => {
  const q = parse(z.object({ postalCode: zPostalCode.optional(), radiusKm: ruralRadius }), req.query);
  const userId = me(req).id;
  const center = await resolveCenter(q, userId);
  if (!center) throw badRequest('postal_code_unknown');

  // alle auffindbaren Gruppen (ohne „nur auf Einladung“), Entfernung in JS
  const allGroups = await db
    .select({ id: s.groups.id, city: s.groups.city, lat: s.groups.lat, lon: s.groups.lon })
    .from(s.groups)
    .where(ne(s.groups.joinPolicy, 'invite'));
  const byDist = allGroups.map((g) => ({ ...g, d: distanceKm(center.lat, center.lon, g.lat, g.lon) })).sort((a, b) => a.d - b.d);
  const inRadius = byDist.filter((g) => g.d <= q.radiusKm);
  const nearestIds = byDist.filter((g) => g.d <= 100).slice(0, 3).map((g) => g.id);
  const nearestRows = nearestIds.length ? await db.select().from(s.groups).where(inArray(s.groups.id, nearestIds)) : [];
  const nearestGroups = (await groupSummaries(nearestRows, userId, center)).sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  const nearestTown = byDist[0] ? { city: byDist[0].city, distanceKm: roundKm(byDist[0].d) } : null;

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86_400_000);
  const inRadiusIds = inRadius.map((g) => g.id);
  const walksInRadius = inRadiusIds.length
    ? Number(
        (
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(s.walks)
            .where(
              and(
                inArray(s.walks.groupId, inRadiusIds),
                eq(s.walks.status, 'planned'),
                gte(s.walks.startsAt, now),
                lte(s.walks.startsAt, in30),
              ),
            )
        )[0].n,
      )
    : 0;

  const blocked = await blockedIds(userId);
  const offers = await db
    .select({ userId: s.partnerOffers.userId, lat: s.partnerOffers.lat, lon: s.partnerOffers.lon })
    .from(s.partnerOffers)
    .where(and(eq(s.partnerOffers.active, true), ne(s.partnerOffers.userId, userId)));
  const partnersNearby = offers.filter((o) => !blocked.has(o.userId) && distanceKm(center.lat, center.lon, o.lat, o.lon) <= q.radiusKm).length;

  const distanceRows = await db
    .select()
    .from(s.walks)
    .where(and(eq(s.walks.kind, 'distance'), eq(s.walks.status, 'planned'), gte(s.walks.startsAt, now), lte(s.walks.startsAt, in30)))
    .orderBy(asc(s.walks.startsAt))
    .limit(20);
  const distanceWalks = await walkSummaries(
    distanceRows.filter((w) => !w.createdBy || !blocked.has(w.createdBy)).slice(0, 10),
    userId,
    null,
  );

  res.json({
    center,
    groupsInRadius: inRadius.length,
    walksInRadius,
    nearestGroups,
    nearestTown,
    partnersNearby,
    distanceWalks,
    interest: await myInterest(userId),
    radiusOptions: RADIUS_OPTIONS,
  });
});

/* ------------------------------------------------------------------ */
/* Interesse anmelden                                                  */
/* ------------------------------------------------------------------ */

router.get('/interest', async (req, res) => {
  res.json({ interest: await myInterest(me(req).id) });
});

router.put('/interest', async (req, res) => {
  const body = parse(z.object({ postalCode: zPostalCode, radiusKm: ruralRadius }), req.body);
  const userId = me(req).id;
  const place = placeOf(body.postalCode);
  await db
    .insert(s.interestAlerts)
    .values({ userId, postalCode: place.postalCode, lat: place.lat, lon: place.lon, radiusKm: body.radiusKm })
    .onConflictDoUpdate({
      target: s.interestAlerts.userId,
      set: { postalCode: place.postalCode, lat: place.lat, lon: place.lon, radiusKm: body.radiusKm },
    });
  res.json({ interest: await myInterest(userId) });
});

router.delete('/interest', async (req, res) => {
  await db.delete(s.interestAlerts).where(eq(s.interestAlerts.userId, me(req).id));
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Gehpartner                                                          */
/* ------------------------------------------------------------------ */

type OfferRow = typeof s.partnerOffers.$inferSelect;
const offerView = (o: OfferRow) => ({
  id: o.id,
  postalCode: o.postalCode,
  city: o.city,
  tempo: o.tempo,
  availability: o.availability,
  note: o.note,
  active: o.active,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
});

router.get('/partners', async (req, res) => {
  const q = parse(z.object({ postalCode: zPostalCode.optional(), radiusKm: ruralRadius }), req.query);
  const userId = me(req).id;
  let center: { lat: number; lon: number } | null = null;
  if (q.postalCode) center = placeOf(q.postalCode);
  else {
    const [own] = await db.select().from(s.partnerOffers).where(eq(s.partnerOffers.userId, userId)).limit(1);
    center = own ?? (await resolveCenter({}, userId));
  }
  if (!center) throw badRequest('postal_code_unknown');
  const c = center;
  const blocked = await blockedIds(userId);
  const rows = await db.select().from(s.partnerOffers).where(eq(s.partnerOffers.active, true));
  const matches = rows
    .filter((o) => o.userId === userId || !blocked.has(o.userId))
    .map((o) => ({ o, d: distanceKm(c.lat, c.lon, o.lat, o.lon) }))
    .filter((x) => x.o.userId === userId || x.d <= q.radiusKm)
    .sort((a, b) => a.d - b.d)
    .slice(0, 100);
  const refs = await personRefs(matches.map((m) => m.o.userId));
  res.json({
    offers: matches.map(({ o, d }) => ({
      id: o.id,
      person: refs.get(o.userId)!,
      city: o.city,
      distanceKm: Math.round(d),
      tempo: o.tempo,
      availability: o.availability,
      note: o.note,
      isMine: o.userId === userId,
    })),
  });
});

router.get('/partner-offer', async (req, res) => {
  const [o] = await db.select().from(s.partnerOffers).where(eq(s.partnerOffers.userId, me(req).id)).limit(1);
  res.json({ offer: o ? offerView(o) : null });
});

router.put('/partner-offer', async (req, res) => {
  const body = parse(
    z.object({
      postalCode: zPostalCode,
      tempo: z.enum(TEMPOS).default('zuegig'),
      availability: zText(300).default(''),
      note: zText(500).default(''),
      active: z.boolean().default(true),
    }),
    req.body,
  );
  const userId = me(req).id;
  const place = placeOf(body.postalCode);
  const [before] = await db.select({ active: s.partnerOffers.active }).from(s.partnerOffers).where(eq(s.partnerOffers.userId, userId)).limit(1);
  const values = {
    postalCode: place.postalCode,
    city: place.city,
    lat: place.lat,
    lon: place.lon,
    tempo: body.tempo,
    availability: body.availability,
    note: body.note,
    active: body.active,
  };
  const [o] = await db
    .insert(s.partnerOffers)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: s.partnerOffers.userId, set: values })
    .returning();
  if (o.active && !before?.active) {
    await notifyInterest({ kind: 'partner', lat: o.lat, lon: o.lon, city: o.city, actorId: userId, path: '/in-der-naehe' });
  }
  res.json({ offer: offerView(o) });
});

router.delete('/partner-offer', async (req, res) => {
  await db.delete(s.partnerOffers).where(eq(s.partnerOffers.userId, me(req).id));
  res.json({ ok: true });
});

/* ---------- Anfragen ---------- */

type RequestRow = typeof s.partnerRequests.$inferSelect;

async function requestViews(rows: { r: RequestRow; toUserId: string }[]) {
  const refs = await personRefs(rows.flatMap((x) => [x.r.fromUserId, x.toUserId]));
  return rows.map(({ r, toUserId }) => ({
    id: r.id,
    from: refs.get(r.fromUserId)!,
    to: refs.get(toUserId)!,
    message: r.message,
    status: r.status,
    walkId: r.walkId,
    createdAt: r.createdAt,
  }));
}

router.post('/partners/:offerId/request', async (req, res) => {
  const { offerId } = parse(z.object({ offerId: zId }), req.params);
  const { message } = parse(z.object({ message: zText(500).default('') }), req.body ?? {});
  const userId = me(req).id;
  const [offer] = await db.select().from(s.partnerOffers).where(eq(s.partnerOffers.id, offerId)).limit(1);
  if (!offer || !offer.active || offer.userId === userId || (await isBlockedEitherWay(userId, offer.userId))) {
    throw notFound('offer_not_found');
  }
  const [created] = await db
    .insert(s.partnerRequests)
    .values({ offerId: offer.id, fromUserId: userId, message })
    .onConflictDoNothing({ target: [s.partnerRequests.offerId, s.partnerRequests.fromUserId] })
    .returning();
  const [r] = created
    ? [created]
    : await db
        .select()
        .from(s.partnerRequests)
        .where(and(eq(s.partnerRequests.offerId, offer.id), eq(s.partnerRequests.fromUserId, userId)))
        .limit(1);
  if (created) {
    const refs = await personRefs([userId]);
    const fromName = refs.get(userId)!.displayName;
    await notify(offer.userId, 'partner_request', { requestId: r.id, fromUserId: userId, displayName: fromName });
    // ohne Kontaktdaten: Antwort nur über die App
    await mailPerson(offer.userId, ({ du, name }) => ({
      subject: du ? `${fromName} möchte mit dir gehen` : `${fromName} möchte mit Ihnen gehen`,
      text: [
        greeting(du, name),
        du
          ? `${fromName} hat dein Gehpartner-Gesuch gesehen und möchte gern einmal mit dir gehen.`
          : `${fromName} hat Ihr Gehpartner-Gesuch gesehen und möchte gern einmal mit Ihnen gehen.`,
        ...(message ? [`Nachricht von ${fromName}:\n„${message}“`] : []),
        du
          ? 'Ob du zusagst, entscheidest du ganz in Ruhe in der App. Deine Kontaktdaten werden dabei nicht weitergegeben.'
          : 'Ob Sie zusagen, entscheiden Sie ganz in Ruhe in der App. Ihre Kontaktdaten werden dabei nicht weitergegeben.',
        signOff(du),
      ].join('\n\n'),
      button: { label: 'Anfrage ansehen', url: `${config.APP_URL}/in-der-naehe` },
    }));
  }
  const [view] = await requestViews([{ r, toUserId: offer.userId }]);
  res.json({ request: view });
});

router.get('/partner-requests', async (req, res) => {
  const userId = me(req).id;
  const blocked = await blockedIds(userId);
  const incoming = await db
    .select({ r: s.partnerRequests, toUserId: s.partnerOffers.userId })
    .from(s.partnerRequests)
    .innerJoin(s.partnerOffers, eq(s.partnerOffers.id, s.partnerRequests.offerId))
    .where(eq(s.partnerOffers.userId, userId))
    .orderBy(desc(s.partnerRequests.createdAt));
  const outgoing = await db
    .select({ r: s.partnerRequests, toUserId: s.partnerOffers.userId })
    .from(s.partnerRequests)
    .innerJoin(s.partnerOffers, eq(s.partnerOffers.id, s.partnerRequests.offerId))
    .where(eq(s.partnerRequests.fromUserId, userId))
    .orderBy(desc(s.partnerRequests.createdAt));
  res.json({
    incoming: await requestViews(incoming.filter((x) => !blocked.has(x.r.fromUserId))),
    outgoing: await requestViews(outgoing.filter((x) => !blocked.has(x.toUserId))),
  });
});

async function requireIncomingRequest(id: string, userId: string) {
  const [row] = await db
    .select({ r: s.partnerRequests, offer: s.partnerOffers })
    .from(s.partnerRequests)
    .innerJoin(s.partnerOffers, eq(s.partnerOffers.id, s.partnerRequests.offerId))
    .where(eq(s.partnerRequests.id, id))
    .limit(1);
  if (!row || row.offer.userId !== userId) throw notFound('not_found');
  return row;
}

router.post('/partner-requests/:id/accept', async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const body = parse(
    z.object({
      startsAt: z.coerce.date(),
      meetingPointName: z.string().trim().min(2).max(120),
      meetingAddress: z.string().trim().min(2).max(200),
      meetingDescription: zText(1000).default(''),
      durationMinutes: z.number().int().min(10).max(600).default(60),
      tempo: z.enum(TEMPOS).optional(),
    }),
    req.body,
  );
  const userId = me(req).id;
  const { r, offer } = await requireIncomingRequest(id, userId);
  if (r.status === 'accepted' && r.walkId) {
    res.json({ walkId: r.walkId });
    return;
  }
  if (r.status === 'declined') throw conflict('conflict');
  if (body.startsAt.getTime() < Date.now()) throw conflict('walk_in_past');

  const walkId = await db.transaction(async (tx) => {
    const [w] = await tx
      .insert(s.walks)
      .values({
        kind: 'partner',
        title: 'Gemeinsamer Walk',
        startsAt: body.startsAt,
        durationMinutes: body.durationMinutes,
        tempo: body.tempo ?? offer.tempo,
        meetingPointName: body.meetingPointName,
        meetingAddress: body.meetingAddress,
        meetingDescription: body.meetingDescription,
        postalCode: offer.postalCode,
        city: offer.city,
        district: lookupPostalCode(offer.postalCode)?.district ?? null,
        lat: offer.lat,
        lon: offer.lon,
        maxParticipants: 2,
        createdBy: userId,
      })
      .returning({ id: s.walks.id });
    const updated = await tx
      .update(s.partnerRequests)
      .set({ status: 'accepted', walkId: w.id })
      .where(and(eq(s.partnerRequests.id, r.id), eq(s.partnerRequests.status, 'pending')))
      .returning({ id: s.partnerRequests.id });
    if (!updated.length) {
      // gleichzeitiger Doppelklick: den bereits angelegten Walk zurückgeben
      tx.rollback();
    }
    await tx.insert(s.walkRsvps).values([
      { walkId: w.id, userId, status: 'yes' },
      { walkId: w.id, userId: r.fromUserId, status: 'yes' },
    ]);
    return w.id;
  }).catch(async (err) => {
    const [again] = await db.select().from(s.partnerRequests).where(eq(s.partnerRequests.id, r.id)).limit(1);
    if (again?.status === 'accepted' && again.walkId) return again.walkId;
    throw err;
  });

  const refs = await personRefs([userId]);
  const name = refs.get(userId)!.displayName;
  const when = formatBerlin(body.startsAt);
  await notify(r.fromUserId, 'partner_accepted', { walkId, displayName: name, startsAt: body.startsAt.toISOString() });
  await mailPerson(r.fromUserId, ({ du, name: toName }) => ({
    subject: du ? `${name} geht gern mit dir` : `${name} geht gern mit Ihnen`,
    text: [
      greeting(du, toName),
      du
        ? `${name} hat deine Anfrage angenommen. Ihr trefft euch am ${when}.`
        : `${name} hat Ihre Anfrage angenommen. Sie treffen sich am ${when}.`,
      du ? 'Den Treffpunkt findest du in der App.' : 'Den Treffpunkt finden Sie in der App.',
      signOff(du),
    ].join('\n\n'),
    button: { label: 'Termin ansehen', url: `${config.APP_URL}/walks/${walkId}` },
  }));
  res.json({ walkId });
});

router.post('/partner-requests/:id/decline', async (req, res) => {
  const { id } = parse(z.object({ id: zId }), req.params);
  const { r } = await requireIncomingRequest(id, me(req).id);
  // keine Benachrichtigung an die Absenderin – sie sieht nur den Status
  if (r.status === 'pending') {
    await db.update(s.partnerRequests).set({ status: 'declined' }).where(eq(s.partnerRequests.id, r.id));
  }
  res.json({ ok: true });
});
