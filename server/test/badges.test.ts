import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { BADGES, BADGE_NAMES } from '@gehmeinsam/shared';
import { badgeName } from '../src/modules/badges.js';
import { awardBadge, onActivityRecorded } from '../src/services/gamification.js';
import { getApp, signUp } from './helpers.js';
import { hoursAgo, insertActivity } from './fixtures/paket-b.js';

const DAY = 86400_000;

describe('Abzeichen-Namen (eine Quelle)', () => {
  it('jedes Abzeichen hat einen Namen; Urkunde nutzt dieselben Namen wie die Oberfläche', () => {
    for (const b of BADGES) {
      expect(BADGE_NAMES.de[b.key as keyof typeof BADGE_NAMES.de]).toBeTruthy();
      expect(badgeName(b.key, null)).toBe(BADGE_NAMES.de[b.key as keyof typeof BADGE_NAMES.de]);
    }
    expect(badgeName('first_5k', null)).toBe('Erster 5-km-Walk');
    expect(badgeName('region:Landkreis Kassel', 'Landkreis Kassel')).toBe('Wappen Landkreis Kassel');
  });
});

describe('Punkte und Abzeichen', () => {
  it('vergibt bei doppeltem Aufruf nichts doppelt (idempotent)', async () => {
    const { userId } = await signUp();
    const a = await insertActivity(userId, { distanceKm: 3, source: 'group' });
    const first = await onActivityRecorded(userId, a.id);
    // 10 + 3×2 + 15 Gruppenbonus = 31, dazu first_walk, first_group_walk, Wappen (je 20)
    expect(first.newBadges).toEqual(expect.arrayContaining(['first_walk', 'first_group_walk', 'region:Kreisfreie Stadt Kassel']));
    expect(first.pointsAwarded).toBe(31 + 3 * 20);
    const second = await onActivityRecorded(userId, a.id);
    expect(second).toEqual({ pointsAwarded: 0, newBadges: [], completedChallenges: [] });
    const ledger = await db.select().from(s.pointsLedger).where(eq(s.pointsLedger.userId, userId));
    expect(ledger.reduce((sum, l) => sum + l.amount, 0)).toBe(91);
    const notes = await db
      .select()
      .from(s.notifications)
      .where(and(eq(s.notifications.userId, userId), eq(s.notifications.type, 'badge')));
    expect(notes).toHaveLength(3);
    expect(notes.map((n) => n.data)).toContainEqual({ key: 'region:Kreisfreie Stadt Kassel', label: 'Kreisfreie Stadt Kassel' });
    // fremde Aktivität wird ignoriert
    const other = await signUp();
    expect((await onActivityRecorded(other.userId, a.id)).pointsAwarded).toBe(0);
  });

  it('first_5k nur für einen einzelnen Walk ab 5 km', async () => {
    const { agent } = await signUp();
    const r1 = await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(5), durationMinutes: 40, distanceKm: 3 }).expect(201);
    const r2 = await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(3), durationMinutes: 40, distanceKm: 3 }).expect(201);
    expect([...r1.body.award.newBadges, ...r2.body.award.newBadges]).not.toContain('first_5k');
    const r3 = await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(1), durationMinutes: 60, distanceKm: 5 }).expect(201);
    expect(r3.body.award.newBadges).toContain('first_5k');
  });

  it('vergibt week_streak_4 und Orte-Abzeichen', async () => {
    const { userId } = await signUp();
    let last;
    for (let w = 0; w < 4; w++) {
      last = await insertActivity(userId, { distanceKm: 2, startedAt: new Date(Date.now() - w * 7 * DAY - 3600_000) });
    }
    const r = await onActivityRecorded(userId, last!.id);
    expect(r.newBadges).toContain('week_streak_4');
    await insertActivity(userId, { distanceKm: 2, city: 'Göttingen', district: 'Landkreis Göttingen' });
    const x = await insertActivity(userId, { distanceKm: 2, city: 'Hann. Münden', district: 'Landkreis Göttingen' });
    const r2 = await onActivityRecorded(userId, x.id);
    expect(r2.newBadges).toEqual(expect.arrayContaining(['places_3', 'region:Landkreis Göttingen']));
  });

  it('awardBadge (für Paket A) ist idempotent', async () => {
    const { userId } = await signUp();
    expect(await awardBadge(userId, 'group_founder')).toBe(true);
    expect(await awardBadge(userId, 'group_founder')).toBe(false);
    const pts = await db.select().from(s.pointsLedger).where(eq(s.pointsLedger.userId, userId));
    expect(pts).toEqual([expect.objectContaining({ reason: 'badge', ref: 'group_founder', amount: 20 })]);
  });

  it('zeigt die Vitrine mit Fortschritt', async () => {
    const { agent } = await signUp();
    await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(1), durationMinutes: 40, distanceKm: 3.5 }).expect(201);
    const res = await agent.get('/api/v1/badges').expect(200);
    expect(res.body).toMatchObject({ walksCount: 1, totalKm: 3.5, groupWalksCount: 0 });
    expect(res.body.points).toBe(10 + 8 + 2 * 20);
    const keys = res.body.earned.map((b: { key: string }) => b.key);
    expect(keys).toEqual(expect.arrayContaining(['first_walk', 'region:Kreisfreie Stadt Kassel']));
    const region = res.body.earned.find((b: { key: string }) => b.key.startsWith('region:'));
    expect(region).toMatchObject({ label: 'Kreisfreie Stadt Kassel', kind: 'region', tier: 1, shareUrl: null });
    const k5 = res.body.available.find((b: { key: string }) => b.key === 'first_5k');
    expect(k5).toMatchObject({ earned: false, progress: { current: 3.5, target: 5 } });
    const founder = res.body.available.find((b: { key: string }) => b.key === 'group_founder');
    expect(founder.progress).toBeNull();
  });

  it('liefert die Urkunde als PDF', async () => {
    const { agent } = await signUp({ name: 'Gisela' });
    await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(1), durationMinutes: 60, distanceKm: 5.5 }).expect(201);
    const res = await agent
      .get('/api/v1/badges/first_5k/certificate.pdf')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const region = await agent.get(`/api/v1/badges/${encodeURIComponent('region:Kreisfreie Stadt Kassel')}/certificate.pdf`);
    expect(region.status).toBe(200);
    const missing = await agent.get('/api/v1/badges/walks_100/certificate.pdf').expect(404);
    expect(missing.body.error.code).toBe('badge_not_found');
  });

  it('teilt ein Abzeichen öffentlich und beendet das Teilen wieder', async () => {
    const { agent } = await signUp({ name: 'Helga' });
    await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(1), durationMinutes: 30, distanceKm: 2 }).expect(201);
    const share = await agent.post('/api/v1/badges/first_walk/share').expect(200);
    expect(share.body.shareUrl).toMatch(/^http:\/\/localhost:5173\/abzeichen\/geteilt\/[A-Za-z0-9_-]{32}$/);
    const again = await agent.post('/api/v1/badges/first_walk/share').expect(200);
    expect(again.body.shareUrl).toBe(share.body.shareUrl);
    const token = share.body.shareUrl.split('/').pop();

    const anon = request(getApp());
    const pub = await anon.get(`/api/v1/badges/shared/${token}`).expect(200);
    expect(pub.body).toEqual({
      displayName: 'Helga',
      badge: { key: 'first_walk', label: null, kind: 'count', tier: 1, awardedAt: expect.any(String) },
    });
    const img = await anon.get(`/api/v1/badges/shared/${token}/image.png`).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    const meta = await (await import('sharp')).default(img.body as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);

    const vitrine = await agent.get('/api/v1/badges').expect(200);
    expect(vitrine.body.earned.find((b: { key: string }) => b.key === 'first_walk').shareUrl).toBe(share.body.shareUrl);

    await agent.delete('/api/v1/badges/first_walk/share').expect(200);
    const gone = await anon.get(`/api/v1/badges/shared/${token}`).expect(404);
    expect(gone.body.error.code).toBe('badge_not_found');
    await anon.get(`/api/v1/badges/shared/${token}/image.png`).expect(404);
    await agent.post('/api/v1/badges/walks_100/share').expect(404);
  });
});
