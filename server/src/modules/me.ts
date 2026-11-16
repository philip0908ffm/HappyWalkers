import { ANREDEN, FONT_SCALES, LOCALES, PROFILE_VISIBILITIES } from '@gehmeinsam/shared';
import { and, asc, eq, inArray, ne, or } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { lookupPostalCode } from '../lib/geo.js';
import { badRequest, parse } from '../lib/http.js';
import { me, requireUser } from '../middleware/auth.js';

export const router = Router();
router.use(requireUser);

/** Eigenes Profil inkl. Einstellungen (nur für die Person selbst). */
export async function loadMe(userId: string) {
  const [u] = await db.select().from(s.user).where(eq(s.user.id, userId)).limit(1);
  let [p] = await db.select().from(s.profile).where(eq(s.profile.userId, userId)).limit(1);
  if (!p) {
    [p] = await db.insert(s.profile).values({ userId, displayName: '' }).returning();
  }
  const [sub] = await db.select().from(s.subscriptions).where(eq(s.subscriptions.userId, userId)).limit(1);
  const premium = !!sub && sub.currentPeriodEnd > new Date() && sub.status !== 'expired';
  return {
    id: u.id,
    email: u.email.endsWith('.invalid') ? null : u.email,
    phoneNumber: u.phoneNumber,
    displayName: p.displayName,
    bio: p.bio,
    postalCode: p.postalCode,
    city: p.city,
    district: p.district,
    birthYear: p.birthYear,
    gender: p.gender,
    avatarUrl: p.avatarPath ? `/api/v1/photos/avatar/${u.id}` : null,
    onboarded: !!p.onboardedAt,
    premium,
    subscription: sub
      ? { status: sub.status, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, priceCents: sub.priceCents }
      : null,
    settings: {
      anrede: p.anrede,
      locale: p.locale,
      fontScale: p.fontScale,
      profileVisibility: p.profileVisibility,
      leaderboardMode: p.leaderboardMode,
      emailNotifications: p.emailNotifications,
    },
  };
}

router.get('/', async (req, res) => {
  res.json({ me: await loadMe(me(req).id) });
});

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  postalCode: z.string().regex(/^\d{5}$/).optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear() - 16).nullable().optional(),
  gender: z.enum(['woman', 'man', 'diverse']).nullable().optional(),
  /** beim ersten Ausfüllen setzen */
  completeOnboarding: z.boolean().optional(),
});

router.patch('/profile', async (req, res) => {
  const body = parse(profileSchema, req.body);
  const userId = me(req).id;
  const patch: Partial<typeof s.profile.$inferInsert> = {};
  if (body.displayName !== undefined) patch.displayName = body.displayName;
  if (body.bio !== undefined) patch.bio = body.bio;
  if (body.birthYear !== undefined) patch.birthYear = body.birthYear;
  if (body.gender !== undefined) patch.gender = body.gender;
  if (body.postalCode) {
    const place = lookupPostalCode(body.postalCode);
    if (!place) throw badRequest('postal_code_unknown');
    Object.assign(patch, { postalCode: place.postalCode, city: place.city, district: place.district, lat: place.lat, lon: place.lon });
  }
  if (body.completeOnboarding) patch.onboardedAt = new Date();
  if (Object.keys(patch).length) {
    await db.update(s.profile).set(patch).where(eq(s.profile.userId, userId));
    if (body.displayName) await db.update(s.user).set({ name: body.displayName }).where(eq(s.user.id, userId));
  }
  res.json({ me: await loadMe(userId) });
});

const settingsSchema = z.object({
  anrede: z.enum(ANREDEN).optional(),
  locale: z.enum(LOCALES).optional(),
  fontScale: z.enum(FONT_SCALES).optional(),
  profileVisibility: z.enum(PROFILE_VISIBILITIES).optional(),
  leaderboardMode: z.enum(['display', 'hidden']).optional(),
  emailNotifications: z.boolean().optional(),
});

router.patch('/settings', async (req, res) => {
  const body = parse(settingsSchema, req.body);
  const userId = me(req).id;
  if (Object.keys(body).length) await db.update(s.profile).set(body).where(eq(s.profile.userId, userId));
  res.json({ me: await loadMe(userId) });
});

/** Datenexport (DSGVO Art. 20): alle eigenen Daten als JSON-Datei. */
router.get('/export', async (req, res) => {
  const userId = me(req).id;
  const [u] = await db.select().from(s.user).where(eq(s.user.id, userId));
  const data = {
    hinweis: 'Dies sind alle Daten, die Gehmeinsam über Sie gespeichert hat.',
    exportiertAm: new Date().toISOString(),
    konto: { id: u.id, email: u.email, telefon: u.phoneNumber, erstelltAm: u.createdAt },
    profil: (await db.select().from(s.profile).where(eq(s.profile.userId, userId)))[0] ?? null,
    gruppenmitgliedschaften: await db.select().from(s.groupMembers).where(eq(s.groupMembers.userId, userId)),
    zusagen: await db.select().from(s.walkRsvps).where(eq(s.walkRsvps.userId, userId)),
    eingetrageneWalks: await db.select().from(s.activities).where(eq(s.activities.userId, userId)),
    beitraege: await db.select().from(s.posts).where(eq(s.posts.authorId, userId)),
    kommentare: await db.select().from(s.comments).where(eq(s.comments.authorId, userId)),
    fotos: (await db.select().from(s.photos).where(eq(s.photos.ownerId, userId))).map((p) => ({
      id: p.id,
      beschreibung: p.altText,
      sichtbarkeit: p.visibility,
      erstelltAm: p.createdAt,
    })),
    herzen: await db.select().from(s.likes).where(eq(s.likes.userId, userId)),
    folgen: await db
      .select()
      .from(s.follows)
      .where(or(eq(s.follows.followerId, userId), eq(s.follows.followeeId, userId))),
    blockiert: await db.select().from(s.blocks).where(eq(s.blocks.blockerId, userId)),
    meldungen: await db.select().from(s.reports).where(eq(s.reports.reporterId, userId)),
    abzeichen: await db.select().from(s.userBadges).where(eq(s.userBadges.userId, userId)),
    punkte: await db.select().from(s.pointsLedger).where(eq(s.pointsLedger.userId, userId)),
    challenges: await db.select().from(s.challengeParticipants).where(eq(s.challengeParticipants.userId, userId)),
    interesseInDerNaehe: await db.select().from(s.interestAlerts).where(eq(s.interestAlerts.userId, userId)),
    gehpartner: await db.select().from(s.partnerOffers).where(eq(s.partnerOffers.userId, userId)),
    ziele: await db.select().from(s.goals).where(eq(s.goals.userId, userId)),
    abo: await db.select().from(s.subscriptions).where(eq(s.subscriptions.userId, userId)),
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="gehmeinsam-meine-daten.json"');
  res.send(JSON.stringify(data, null, 2));
});

/**
 * Konto löschen (DSGVO Art. 17). Bestätigung durch Eingabe von „LÖSCHEN“.
 * Gruppen, die man gegründet hat, gehen an die dienstälteste Moderatorin bzw. das älteste Mitglied;
 * Gruppen ohne weitere Mitglieder werden gelöscht.
 */
router.delete('/', async (req, res) => {
  parse(z.object({ confirm: z.literal('LÖSCHEN') }), req.body);
  const userId = me(req).id;
  await db.transaction(async (tx) => {
    const founded = await tx
      .select({ groupId: s.groupMembers.groupId })
      .from(s.groupMembers)
      .where(and(eq(s.groupMembers.userId, userId), eq(s.groupMembers.role, 'founder')));
    for (const { groupId } of founded) {
      const others = await tx
        .select()
        .from(s.groupMembers)
        .where(and(eq(s.groupMembers.groupId, groupId), ne(s.groupMembers.userId, userId), eq(s.groupMembers.status, 'active')))
        .orderBy(asc(s.groupMembers.joinedAt));
      const successor = others.find((m) => m.role === 'moderator') ?? others[0];
      if (successor) {
        await tx
          .update(s.groupMembers)
          .set({ role: 'founder' })
          .where(and(eq(s.groupMembers.groupId, groupId), eq(s.groupMembers.userId, successor.userId)));
      } else {
        await tx.delete(s.groups).where(eq(s.groups.id, groupId));
      }
    }
    const photoKeys = await tx.select({ key: s.photos.storageKey }).from(s.photos).where(eq(s.photos.ownerId, userId));
    await tx.delete(s.user).where(eq(s.user.id, userId));
    res.locals.photoKeys = photoKeys.map((p) => p.key);
  });
  // Dateien nach erfolgreicher Löschung entfernen
  const { deleteStoredFiles } = await import('../services/storage.js');
  await deleteStoredFiles(res.locals.photoKeys as string[]);
  res.json({ ok: true });
});

/** Mitgliedschaften (für Navigation und Startseite). */
router.get('/groups', async (req, res) => {
  const userId = me(req).id;
  const rows = await db
    .select({ id: s.groups.id, name: s.groups.name, city: s.groups.city, role: s.groupMembers.role, status: s.groupMembers.status })
    .from(s.groupMembers)
    .innerJoin(s.groups, eq(s.groups.id, s.groupMembers.groupId))
    .where(and(eq(s.groupMembers.userId, userId), inArray(s.groupMembers.status, ['active', 'pending'])));
  res.json({ groups: rows });
});
