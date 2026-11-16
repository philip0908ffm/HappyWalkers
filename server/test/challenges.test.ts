import { and, eq, like } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { challengePeriods } from '../src/db/seed.js';
import { signUp } from './helpers.js';
import { hoursAgo, makeGroup } from './fixtures/paket-b.js';

async function seeded(prefix: string) {
  const [c] = await db.select().from(s.challenges).where(like(s.challenges.slug, `${prefix}%`)).limit(1);
  return c;
}

const DAY = 86400_000;

describe('Zeiträume der allgemeinen Challenges (Berliner Zeit)', () => {
  it('Monats- und Jahresgrenzen liegen auf Mitternacht in Berlin (Winter- und Sommerzeit)', () => {
    const nov = challengePeriods(new Date('2026-11-16T10:00:00Z'));
    expect(nov.monthKey).toBe('2026-11');
    expect(nov.monthStart.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(nov.monthEnd.toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(nov.yearStart.toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(nov.yearEnd.toISOString()).toBe('2026-12-31T23:00:00.000Z');
    const jun = challengePeriods(new Date('2026-06-10T10:00:00Z'));
    expect(jun.monthStart.toISOString()).toBe('2026-05-31T22:00:00.000Z');
    expect(jun.monthEnd.toISOString()).toBe('2026-06-30T22:00:00.000Z');
    // 30.11. 23:30 UTC ist in Berlin schon der 1. Dezember
    const dec = challengePeriods(new Date('2026-11-30T23:30:00Z'));
    expect(dec.monthKey).toBe('2026-12');
    expect(dec.monthEnd.toISOString()).toBe('2026-12-31T23:00:00.000Z');
    // Silvester 23:30 UTC → schon das neue Jahr
    expect(challengePeriods(new Date('2026-12-31T23:30:00Z')).year).toBe(2027);
  });
});

describe('Challenges', () => {
  it('listet allgemeine Challenges mit Einheit und Ein-Satz-Erklärung', async () => {
    const { agent } = await signUp();
    const res = await agent.get('/api/v1/challenges').expect(200);
    const five = res.body.active.find((c: { slug: string }) => c.slug.startsWith('5km-eigene-strecke'));
    expect(five).toMatchObject({ type: 'single_distance', unit: 'km', target: 5, joined: false, progress: 0, completedAt: null, group: null });
    expect(five.summary.length).toBeGreaterThan(10);
    const count = res.body.active.find((c: { slug: string }) => c.slug.startsWith('10-walks'));
    expect(count.unit).toBe('walks');
  });

  it('berechnet beim Beitritt den Fortschritt aus vorhandenen Walks; Beitritt ist idempotent', async () => {
    const { agent } = await signUp();
    const ch = await seeded('50km-');
    await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(2), durationMinutes: 60, distanceKm: 4.5 }).expect(201);
    await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(1), durationMinutes: 40, distanceKm: 3 }).expect(201);
    const j1 = await agent.post(`/api/v1/challenges/${ch.id}/join`).expect(200);
    expect(j1.body.challenge).toMatchObject({ joined: true, progress: 7.5, participantCount: expect.any(Number) });
    const j2 = await agent.post(`/api/v1/challenges/${ch.id}/join`).expect(200);
    expect(j2.body.challenge.progress).toBe(7.5);
    expect(j2.body.challenge.participantCount).toBe(j1.body.challenge.participantCount);
    // Löschen berechnet neu
    const list = await agent.get('/api/v1/activities').expect(200);
    await agent.delete(`/api/v1/activities/${list.body.activities[0].id}`).expect(200);
    const detail = await agent.get(`/api/v1/challenges/${ch.id}`).expect(200);
    expect(detail.body.challenge.progress).toBe(4.5);
    await agent.delete(`/api/v1/challenges/${ch.id}/join`).expect(200);
    const after = await agent.get(`/api/v1/challenges/${ch.id}`).expect(200);
    expect(after.body.challenge.joined).toBe(false);
  });

  it('schließt eine Challenge mit einem passenden Walk ab (Punkte, Abzeichen, Benachrichtigung)', async () => {
    const { agent, userId } = await signUp();
    const ch = await seeded('5km-eigene-strecke');
    await agent.post(`/api/v1/challenges/${ch.id}/join`).expect(200);
    const short = await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(2), durationMinutes: 40, distanceKm: 3 }).expect(201);
    expect(short.body.award.completedChallenges).toEqual([]);
    const res = await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(1), durationMinutes: 65, distanceKm: 5.6 }).expect(201);
    expect(res.body.award.completedChallenges).toEqual([ch.id]);
    expect(res.body.award.newBadges).toEqual(expect.arrayContaining(['challenge_done', 'first_5k']));
    // 10 + 6×2 Walk, 50 Challenge, 2×20 Abzeichen
    expect(res.body.award.pointsAwarded).toBe(22 + 50 + 40);
    const [p] = await db
      .select()
      .from(s.challengeParticipants)
      .where(and(eq(s.challengeParticipants.challengeId, ch.id), eq(s.challengeParticipants.userId, userId)));
    expect(p.completedAt).not.toBeNull();
    expect(p.progress).toBe(5.6);
    const notes = await db
      .select()
      .from(s.notifications)
      .where(and(eq(s.notifications.userId, userId), eq(s.notifications.type, 'challenge_done')));
    expect(notes).toHaveLength(1);
    // weiterer Walk: kein zweiter Abschluss
    const more = await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(0.5), durationMinutes: 70, distanceKm: 6 }).expect(201);
    expect(more.body.award.completedChallenges).toEqual([]);
  });

  it('Beitritt kann direkt abschließen; beendete Challenges → challenge_ended', async () => {
    const { agent } = await signUp();
    await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(1), durationMinutes: 60, distanceKm: 5 }).expect(201);
    const ch = await seeded('5km-eigene-strecke');
    const j = await agent.post(`/api/v1/challenges/${ch.id}/join`).expect(200);
    expect(j.body.challenge.completedAt).not.toBeNull();

    const [ended] = await db
      .insert(s.challenges)
      .values({
        slug: `ended-${crypto.randomUUID()}`,
        title: 'Vorbei',
        summary: 'Diese Challenge ist schon vorbei.',
        type: 'walk_count',
        target: 3,
        startsAt: new Date(Date.now() - 30 * DAY),
        endsAt: new Date(Date.now() - DAY),
      })
      .returning();
    const res = await agent.post(`/api/v1/challenges/${ended.id}/join`).expect(409);
    expect(res.body.error.code).toBe('challenge_ended');
    const list = await agent.get('/api/v1/challenges').expect(200);
    expect(list.body.past.map((c: { id: string }) => c.id)).toContain(ended.id);
    await agent.get('/api/v1/challenges/gibt-es-nicht').expect(404);
  });

  it('Rangliste zeigt nur Anzeigenamen, bei „hidden“ neutral', async () => {
    const a = await signUp({ name: 'Anneliese' });
    const b = await signUp({ name: 'Bruno' });
    await b.agent.patch('/api/v1/me/settings').send({ leaderboardMode: 'hidden' }).expect(200);
    const [ch] = await db
      .insert(s.challenges)
      .values({
        slug: `lb-${crypto.randomUUID()}`,
        title: 'Rangliste',
        summary: 'Sammeln Sie Kilometer.',
        type: 'total_distance',
        target: 1000,
        startsAt: new Date(Date.now() - DAY),
        endsAt: new Date(Date.now() + 10 * DAY),
      })
      .returning();
    await a.agent.post('/api/v1/activities').send({ startedAt: hoursAgo(1), durationMinutes: 30, distanceKm: 2 }).expect(201);
    await b.agent.post('/api/v1/activities').send({ startedAt: hoursAgo(1), durationMinutes: 60, distanceKm: 6 }).expect(201);
    await a.agent.post(`/api/v1/challenges/${ch.id}/join`).expect(200);
    await b.agent.post(`/api/v1/challenges/${ch.id}/join`).expect(200);
    const res = await a.agent.get(`/api/v1/challenges/${ch.id}`).expect(200);
    expect(res.body.leaderboard).toEqual([
      { rank: 1, name: 'Teilnehmende Person', progress: 6, isMe: false },
      { rank: 2, name: 'Anneliese', progress: 2, isMe: true },
    ]);
    const own = await b.agent.get(`/api/v1/challenges/${ch.id}`).expect(200);
    expect(own.body.leaderboard[0]).toEqual({ rank: 1, name: 'Bruno', progress: 6, isMe: true });
    expect(JSON.stringify(res.body)).not.toContain(b.userId);
  });

  it('Gruppenleitung legt Gruppen-Challenges an, nur Mitglieder sehen sie', async () => {
    const lead = await signUp();
    const member = await signUp();
    const outsider = await signUp({ postalCode: '80331' });
    const g = await makeGroup([{ userId: lead.userId, role: 'founder' }, { userId: member.userId }]);
    const body = {
      groupId: g.id,
      title: '20 km im Advent',
      summary: 'Gehen Sie bis Weihnachten zusammen 20 Kilometer.',
      type: 'total_distance',
      target: 20,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 30 * DAY).toISOString(),
    };
    const denied = await member.agent.post('/api/v1/challenges').send(body).expect(403);
    expect(denied.body.error.code).toBe('not_group_lead');
    const res = await lead.agent.post('/api/v1/challenges').send(body).expect(201);
    expect(res.body.challenge).toMatchObject({ scope: 'group', group: { id: g.id, name: g.name }, unit: 'km', target: 20 });
    const id = res.body.challenge.id;
    await member.agent.get(`/api/v1/challenges/${id}`).expect(200);
    const list = await member.agent.get('/api/v1/challenges').expect(200);
    expect(list.body.active.map((c: { id: string }) => c.id)).toContain(id);
    const hidden = await outsider.agent.get(`/api/v1/challenges/${id}`).expect(404);
    expect(hidden.body.error.code).toBe('challenge_not_found');
    await outsider.agent.post(`/api/v1/challenges/${id}/join`).expect(404);
    await lead.agent.post('/api/v1/challenges').send({ ...body, endsAt: body.startsAt }).expect(400);
  });

  it('Stadt-Challenges nur für die eigene Profil-Stadt', async () => {
    const kassel = await signUp({ postalCode: '34117' });
    const muenchen = await signUp({ postalCode: '80331' });
    const [ch] = await db
      .insert(s.challenges)
      .values({
        slug: `stadt-${crypto.randomUUID()}`,
        title: 'Kassel geht',
        summary: 'Gehen Sie in diesem Monat 5 Walks in Kassel.',
        type: 'walk_count',
        target: 5,
        scope: 'city',
        city: 'Kassel',
        startsAt: new Date(Date.now() - DAY),
        endsAt: new Date(Date.now() + 10 * DAY),
      })
      .returning();
    await kassel.agent.get(`/api/v1/challenges/${ch.id}`).expect(200);
    await muenchen.agent.get(`/api/v1/challenges/${ch.id}`).expect(404);
  });
});
