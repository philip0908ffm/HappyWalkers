import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { getApp, signUp } from './helpers.js';
import { hoursAgo, makeGroup } from './fixtures/paket-b.js';

const fixture = (name: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);

describe('Walks eintragen', () => {
  it('verlangt eine Anmeldung', async () => {
    const res = await request(getApp()).get('/api/v1/activities');
    expect(res.status).toBe(401);
  });

  it('trägt einen Walk manuell ein und vergibt Punkte, Abzeichen und Wappen (Ort aus Profil-PLZ)', async () => {
    const { agent, userId } = await signUp({ name: 'Erika', postalCode: '34117' });
    const res = await agent
      .post('/api/v1/activities')
      .send({ startedAt: hoursAgo(2), durationMinutes: 55, distanceKm: 5.2, title: 'Runde an der Fulda' })
      .expect(201);
    const { activity, award, post } = res.body;
    expect(activity.distanceKm).toBe(5.2);
    expect(activity.source).toBe('manual');
    expect(activity.city).toBe('Kassel');
    expect(activity.district).toBe('Kreisfreie Stadt Kassel');
    expect(activity.speedKmh).toBe(5.7);
    expect(activity.visibility).toBe('group');
    expect(post).toBeNull();
    expect(award.newBadges).toEqual(expect.arrayContaining(['first_walk', 'first_5k', 'region:Kreisfreie Stadt Kassel']));
    expect(award.newBadges).not.toContain('first_10k');
    // 10 + 6 × 2 für den Walk, je 20 für drei Abzeichen
    expect(award.pointsAwarded).toBe(22 + 3 * 20);
    const notes = await db
      .select()
      .from(s.notifications)
      .where(and(eq(s.notifications.userId, userId), eq(s.notifications.type, 'badge')));
    expect(notes.length).toBe(3);
  });

  it('nimmt den Ort aus dem Routenstart und vereinfacht die Route', async () => {
    const { agent } = await signUp({ postalCode: '34117' });
    const route: [number, number][] = Array.from({ length: 2500 }, (_, i) => [9.939 + i * 0.00001, 51.5364 + Math.sin(i / 20) * 0.0005]);
    const res = await agent
      .post('/api/v1/activities')
      .send({ startedAt: hoursAgo(3), durationMinutes: 40, distanceKm: 3.4, route, source: 'gpx' })
      .expect(201);
    expect(res.body.activity.city).toBe('Göttingen');
    expect(res.body.activity.district).toBe('Landkreis Göttingen');
    expect(res.body.activity.source).toBe('gpx');
    expect(res.body.activity.route.length).toBeLessThanOrEqual(2000);
    expect(res.body.award.newBadges).toContain('region:Landkreis Göttingen');
  });

  it('prüft die Plausibilität', async () => {
    const { agent } = await signUp();
    const base = { startedAt: hoursAgo(1), durationMinutes: 60, distanceKm: 5 };
    const cases = [
      { distanceKm: 0 },
      { distanceKm: 101 },
      { durationMinutes: 0 },
      { durationMinutes: 1441 },
      { startedAt: new Date(Date.now() + 86400_000).toISOString() },
      { distanceKm: 20, durationMinutes: 60 }, // 20 km/h
    ];
    for (const c of cases) {
      const res = await agent.post('/api/v1/activities').send({ ...base, ...c });
      expect(res.status, JSON.stringify(c)).toBe(400);
      expect(res.body.error.code).toBe('implausible_activity');
    }
    const wrongType = await agent.post('/api/v1/activities').send({ ...base, distanceKm: 'fünf' });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error.code).toBe('invalid_input');
    const badRoute = await agent.post('/api/v1/activities').send({ ...base, route: [[200, 95], [9, 51]] });
    expect(badRoute.body.error.code).toBe('invalid_input');
  });

  it('listet eigene Walks seitenweise, neueste zuerst', async () => {
    const { agent } = await signUp();
    for (let i = 1; i <= 5; i++) {
      await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(i * 24), durationMinutes: 30, distanceKm: i }).expect(201);
    }
    const p1 = await agent.get('/api/v1/activities?limit=3').expect(200);
    expect(p1.body.activities.map((a: { distanceKm: number }) => a.distanceKm)).toEqual([1, 2, 3]);
    expect(p1.body.nextCursor).toBeTruthy();
    const p2 = await agent.get(`/api/v1/activities?limit=3&cursor=${p1.body.nextCursor}`).expect(200);
    expect(p2.body.activities.map((a: { distanceKm: number }) => a.distanceKm)).toEqual([4, 5]);
    expect(p2.body.nextCursor).toBeNull();
    const ranged = await agent.get(`/api/v1/activities?from=${encodeURIComponent(hoursAgo(50))}`).expect(200);
    expect(ranged.body.activities).toHaveLength(2);
  });

  it('zeigt fremde Walks nur nach Sichtbarkeit (Gruppe = gemeinsame aktive Gruppe)', async () => {
    const a = await signUp({ name: 'Anna' });
    const b = await signUp({ name: 'Bernd' });
    const c = await signUp({ name: 'Clara' });
    await makeGroup([{ userId: a.userId, role: 'founder' }, { userId: b.userId }]);
    const grp = await a.agent.post('/api/v1/activities').send({ startedAt: hoursAgo(1), durationMinutes: 30, distanceKm: 2 }).expect(201);
    const priv = await a.agent
      .post('/api/v1/activities')
      .send({ startedAt: hoursAgo(1), durationMinutes: 30, distanceKm: 2, visibility: 'private' })
      .expect(201);
    const pub = await a.agent
      .post('/api/v1/activities')
      .send({ startedAt: hoursAgo(1), durationMinutes: 30, distanceKm: 2, visibility: 'public' })
      .expect(201);

    const seen = await b.agent.get(`/api/v1/activities/${grp.body.activity.id}`).expect(200);
    expect(seen.body.author).toEqual({ id: a.userId, displayName: 'Anna', avatarUrl: null });
    expect(JSON.stringify(seen.body)).not.toMatch(/birthYear|email|gender/);
    await c.agent.get(`/api/v1/activities/${grp.body.activity.id}`).expect(404);
    const hidden = await b.agent.get(`/api/v1/activities/${priv.body.activity.id}`).expect(404);
    expect(hidden.body.error.code).toBe('activity_not_found');
    await c.agent.get(`/api/v1/activities/${pub.body.activity.id}`).expect(200);
    // Blockieren gilt immer
    await db.insert(s.blocks).values({ blockerId: a.userId, blockedId: c.userId });
    await c.agent.get(`/api/v1/activities/${pub.body.activity.id}`).expect(404);
  });

  it('teilt einen Walk als Beitrag (Gruppe nur für aktive Mitglieder)', async () => {
    const a = await signUp();
    const other = await signUp();
    const g = await makeGroup([{ userId: a.userId }]);
    const foreign = await makeGroup([{ userId: other.userId }]);
    const res = await a.agent
      .post('/api/v1/activities')
      .send({ startedAt: hoursAgo(1), durationMinutes: 30, distanceKm: 2.5, share: true, groupId: g.id, note: 'Schön war es!' })
      .expect(201);
    expect(res.body.post.id).toBeTruthy();
    const [p] = await db.select().from(s.posts).where(eq(s.posts.id, res.body.post.id));
    expect(p).toMatchObject({ authorId: a.userId, groupId: g.id, activityId: res.body.activity.id, text: 'Schön war es!', visibility: 'group' });
    const denied = await a.agent
      .post('/api/v1/activities')
      .send({ startedAt: hoursAgo(1), durationMinutes: 30, distanceKm: 2.5, share: true, groupId: foreign.id })
      .expect(403);
    expect(denied.body.error.code).toBe('not_group_member');
  });

  it('ändert und löscht nur eigene Walks; bestätigte Gruppen-Walks bleiben bei km/Dauer fest', async () => {
    const a = await signUp();
    const b = await signUp();
    const created = await a.agent.post('/api/v1/activities').send({ startedAt: hoursAgo(1), durationMinutes: 30, distanceKm: 2 }).expect(201);
    const id = created.body.activity.id;
    const patched = await a.agent.patch(`/api/v1/activities/${id}`).send({ title: 'Neu', distanceKm: 2.5 }).expect(200);
    expect(patched.body.activity).toMatchObject({ title: 'Neu', distanceKm: 2.5 });
    const bad = await a.agent.patch(`/api/v1/activities/${id}`).send({ distanceKm: 30 }).expect(400);
    expect(bad.body.error.code).toBe('implausible_activity');
    await b.agent.patch(`/api/v1/activities/${id}`).send({ title: 'fremd' }).expect(404);
    await b.agent.delete(`/api/v1/activities/${id}`).expect(404);

    const [grp] = await db
      .insert(s.activities)
      .values({ userId: a.userId, startedAt: new Date(), durationMinutes: 60, distanceKm: 5, source: 'group' })
      .returning();
    await a.agent.patch(`/api/v1/activities/${grp.id}`).send({ distanceKm: 6 }).expect(400);
    await a.agent.patch(`/api/v1/activities/${grp.id}`).send({ note: 'Toller Walk' }).expect(200);

    await a.agent.delete(`/api/v1/activities/${id}`).expect(200);
    await a.agent.get(`/api/v1/activities/${id}`).expect(404);
  });
});

describe('GPX-Import', () => {
  it('liefert eine Vorschau, ohne zu speichern', async () => {
    const { agent } = await signUp();
    const res = await agent.post('/api/v1/activities/gpx').attach('file', fixture('walk.gpx')).expect(200);
    expect(res.body.preview).toMatchObject({ startedAt: '2026-11-10T09:00:00.000Z', durationMinutes: 32 });
    expect(res.body.preview.route).toHaveLength(5);
    const list = await agent.get('/api/v1/activities').expect(200);
    expect(list.body.activities).toHaveLength(0);
    // danach speichern
    const p = res.body.preview;
    await agent
      .post('/api/v1/activities')
      .send({ startedAt: p.startedAt, durationMinutes: p.durationMinutes, distanceKm: p.distanceKm, route: p.route, source: 'gpx' })
      .expect(201);
  });

  it('meldet kaputte Dateien, XXE-Versuche und fehlende Dateien als invalid_gpx', async () => {
    const { agent } = await signUp();
    for (const f of ['kaputt.gpx', 'xxe.gpx', 'billion-laughs.gpx', 'kein-gpx.xml']) {
      const res = await agent.post('/api/v1/activities/gpx').attach('file', fixture(f));
      expect(res.status, f).toBe(400);
      expect(res.body.error.code).toBe('invalid_gpx');
      expect(JSON.stringify(res.body)).not.toContain('root:');
    }
    const none = await agent.post('/api/v1/activities/gpx').expect(400);
    expect(none.body.error.code).toBe('invalid_gpx');
  });
});
