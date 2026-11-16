import { describe, expect, it } from 'vitest';
import { getApp, signUp } from './helpers.js';

/** Zusammenspiel der Pakete A + B ohne Attrappen: Gruppen-Walk bestätigen → Punkte, Abzeichen. */
describe('Gruppen-Walk zählt für alle Teilnehmenden', () => {
  it('Bestätigung vergibt Eintrag, Punkte und Abzeichen „Erster Gruppen-Walk“ – nur einmal', async () => {
    getApp();
    const lead = await signUp({ name: 'Gisela' });
    const erika = await signUp({ name: 'Erika' });
    const g = await lead.agent
      .post('/api/v1/groups')
      .send({ name: 'Dienstagsrunde', description: 'Wir gehen zügig.', rules: 'Pünktlich sein.', joinPolicy: 'open', womenOnly: false, postalCode: '34117', defaultTempo: 'zuegig' })
      .expect((r) => expect([200, 201]).toContain(r.status));
    const groupId = g.body.group.id;
    await erika.agent.post(`/api/v1/groups/${groupId}/join`).send({}).expect(200);
    const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const w = await lead.agent
      .post('/api/v1/walks')
      .send({ kind: 'group', groupId, title: 'Runde am Fluss', startsAt, durationMinutes: 60, distanceKm: 5.2, tempo: 'zuegig', meetingPointName: 'Brücke', meetingAddress: 'Am Fluss 1, Kassel' })
      .expect((r) => expect([200, 201]).toContain(r.status));
    const walkId = w.body.walk.id;
    await erika.agent.put(`/api/v1/walks/${walkId}/rsvp`).send({ status: 'yes' }).expect(200);
    await erika.agent.put(`/api/v1/walks/${walkId}/rsvp`).send({ status: 'yes' }).expect(200); // Doppelklick

    // Walk in die Vergangenheit verlegen, damit bestätigt werden darf
    const { db } = await import('../src/db/index.js');
    const { walks } = await import('../src/db/schema.js');
    const { eq } = await import('drizzle-orm');
    await db.update(walks).set({ startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }).where(eq(walks.id, walkId));

    await lead.agent.post(`/api/v1/walks/${walkId}/confirm`).send({ distanceKm: 5.2, durationMinutes: 62 }).expect(200);
    await lead.agent.post(`/api/v1/walks/${walkId}/confirm`).send({ distanceKm: 5.2, durationMinutes: 62 }).expect(200);

    const acts = await erika.agent.get('/api/v1/activities').expect(200);
    expect(acts.body.activities).toHaveLength(1);
    expect(acts.body.activities[0].source).toBe('group');

    const badges = await erika.agent.get('/api/v1/badges').expect(200);
    const keys = badges.body.earned.map((b: { key: string }) => b.key);
    expect(keys).toEqual(expect.arrayContaining(['first_walk', 'first_5k', 'first_group_walk']));
    expect(badges.body.points).toBeGreaterThan(0);
    const leadBadges = await lead.agent.get('/api/v1/badges').expect(200);
    expect(leadBadges.body.earned.map((b: { key: string }) => b.key)).toContain('group_founder');
  });
});
