import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { sentMails } from '../src/lib/email.js';
import { onActivityRecorded } from '../src/services/gamification.js';
import { berlinParts, berlinToUtc, generateAllSeries, occurrences } from '../src/services/series.js';
import { getApp, signUp, type Agent } from './helpers.js';

vi.mock('../src/services/gamification.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/services/gamification.js')>();
  return { ...orig, awardBadge: vi.fn(orig.awardBadge), onActivityRecorded: vi.fn(orig.onActivityRecorded) };
});

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

async function newGroup(agent: Agent, over: Record<string, unknown> = {}) {
  const res = await agent.post('/api/v1/groups').send({
    name: 'Walkrunde',
    description: '',
    rules: '',
    joinPolicy: 'open',
    womenOnly: false,
    postalCode: '34117',
    defaultTempo: 'zuegig',
    ...over,
  });
  expect(res.status).toBe(201);
  return res.body.group;
}

function walkBody(groupId: string, over: Record<string, unknown> = {}) {
  return {
    kind: 'group',
    groupId,
    title: 'Dienstagsrunde',
    description: 'Eine Stunde zügig.',
    startsAt: inDays(2),
    durationMinutes: 60,
    distanceKm: 5,
    tempo: 'zuegig',
    meetingPointName: 'Orangerie',
    meetingAddress: 'An der Karlsaue 20c, 34121 Kassel',
    meetingDescription: 'Links neben der Treppe',
    ...over,
  };
}

describe('Berliner Zeit für wiederkehrende Termine', () => {
  it('rechnet Ortszeit inkl. Sommerzeit korrekt in UTC um', () => {
    expect(berlinToUtc(2026, 1, 6, '10:00').toISOString()).toBe('2026-01-06T09:00:00.000Z');
    expect(berlinToUtc(2026, 7, 7, '10:00').toISOString()).toBe('2026-07-07T08:00:00.000Z');
    // Umstellungstage
    expect(berlinToUtc(2026, 3, 29, '10:00').toISOString()).toBe('2026-03-29T08:00:00.000Z');
    expect(berlinToUtc(2026, 10, 25, '10:00').toISOString()).toBe('2026-10-25T09:00:00.000Z');
    expect(berlinToUtc(2026, 3, 28, '23:30').toISOString()).toBe('2026-03-28T22:30:00.000Z');
  });

  it('erzeugt über die Zeitumstellung hinweg immer Dienstag 10:00 Ortszeit', () => {
    const list = occurrences(2, '10:00', new Date('2026-10-01T12:00:00Z'), 8);
    expect(list.length).toBe(8);
    for (const d of list) {
      const p = berlinParts(d);
      expect(p.weekday).toBe(2);
      expect([p.hour, p.minute]).toEqual([10, 0]);
    }
    expect(list.map((d) => d.getUTCHours())).toContain(8); // Oktober: Sommerzeit
    expect(list.map((d) => d.getUTCHours())).toContain(9); // November: Winterzeit
  });
});

describe('Walks', () => {
  let lead: Awaited<ReturnType<typeof signUp>>;
  let member: Awaited<ReturnType<typeof signUp>>;
  let group: { id: string };
  beforeAll(async () => {
    lead = await signUp({ name: 'Leiterin' });
    member = await signUp({ name: 'Mitglied' });
    group = await newGroup(lead.agent);
    await member.agent.post(`/api/v1/groups/${group.id}/join`).send({}).expect(200);
  });

  it('nur die Leitung legt Gruppen-Walks an; Treffpunkt ist Pflicht', async () => {
    const r = await member.agent.post('/api/v1/walks').send(walkBody(group.id));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('not_group_lead');
    const r2 = await lead.agent.post('/api/v1/walks').send(walkBody(group.id, { meetingAddress: '' }));
    expect(r2.status).toBe(400);
    expect(r2.body.error.details[0].field).toBe('meetingAddress');
    const r3 = await lead.agent.post('/api/v1/walks').send(walkBody(group.id, { startsAt: inDays(-1) }));
    expect(r3.status).toBe(409);
    expect(r3.body.error.code).toBe('walk_in_past');
    const ok = await lead.agent.post('/api/v1/walks').send(walkBody(group.id)).expect(201);
    expect(ok.body.walk).toMatchObject({ kind: 'group', tempo: 'zuegig', canManage: true, status: 'planned', city: 'Kassel' });
    expect(ok.body.walk.meetingPoint.address).toBe('An der Karlsaue 20c, 34121 Kassel');
  });

  it('Zusage: deutlich, idempotent, nur für Mitglieder', async () => {
    const { body } = await lead.agent.post('/api/v1/walks').send(walkBody(group.id)).expect(201);
    const id = body.walk.id;
    const a = await member.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'yes' }).expect(200);
    const b = await member.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'yes' }).expect(200);
    expect(a.body).toEqual({ myRsvp: 'yes', participantCount: 1 });
    expect(b.body).toEqual(a.body);
    const d = await member.agent.get(`/api/v1/walks/${id}`).expect(200);
    expect(d.body.walk.myRsvp).toBe('yes');
    expect(d.body.walk.participants).toEqual([{ id: member.userId, displayName: 'Mitglied', avatarUrl: null }]);
    const stranger = await signUp();
    const r = await stranger.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'yes' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('not_group_member');
    const no = await member.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'no' }).expect(200);
    expect(no.body).toEqual({ myRsvp: null, participantCount: 0 });
    await member.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'no' }).expect(200);
  });

  it('voll → walk_full', async () => {
    const { body } = await lead.agent.post('/api/v1/walks').send(walkBody(group.id, { maxParticipants: 2 })).expect(201);
    const id = body.walk.id;
    await lead.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'yes' }).expect(200);
    await member.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'yes' }).expect(200);
    const third = await signUp();
    await third.agent.post(`/api/v1/groups/${group.id}/join`).send({}).expect(200);
    const r = await third.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'yes' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('walk_full');
    // bereits Zugesagte bekommen weiterhin „ok“
    await member.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'yes' }).expect(200);
  });

  it('Absage: Zusagende werden benachrichtigt (App + E-Mail), Zusage danach nicht mehr möglich', async () => {
    const { body } = await lead.agent.post('/api/v1/walks').send(walkBody(group.id, { title: 'Wird abgesagt' })).expect(201);
    const id = body.walk.id;
    await member.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'yes' }).expect(200);
    expect((await member.agent.delete(`/api/v1/walks/${id}`)).status).toBe(403);
    await lead.agent.delete(`/api/v1/walks/${id}`).expect(200);
    await lead.agent.delete(`/api/v1/walks/${id}`).expect(200);
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, member.userId));
    expect(notes.filter((n) => n.type === 'walk_cancelled' && n.data.walkId === id)).toHaveLength(1);
    const mails = sentMails.filter((m) => m.to === member.email && m.subject.includes('Wird abgesagt'));
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain('Guten Tag Mitglied');
    const r = await member.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'yes' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('walk_cancelled');
  });

  it('vergangener Walk → walk_in_past', async () => {
    const { body } = await lead.agent.post('/api/v1/walks').send(walkBody(group.id)).expect(201);
    await db.update(s.walks).set({ startsAt: new Date(Date.now() - 3600_000) }).where(eq(s.walks.id, body.walk.id));
    const r = await member.agent.put(`/api/v1/walks/${body.walk.id}/rsvp`).send({ status: 'yes' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('walk_in_past');
  });

  it('Kalenderdatei: Treffpunkt nur für Berechtigte', async () => {
    const { body } = await lead.agent.post('/api/v1/walks').send(walkBody(group.id, { title: 'Kalenderrunde' })).expect(201);
    const m = await member.agent.get(`/api/v1/walks/${body.walk.id}/ics`).expect(200);
    expect(m.headers['content-type']).toContain('text/calendar');
    expect(m.text).toContain('BEGIN:VCALENDAR');
    expect(m.text).toContain('SUMMARY:Kalenderrunde');
    expect(m.text).toContain('Karlsaue 20c');
    const anon = await request(getApp()).get(`/api/v1/walks/${body.walk.id}/ics`).expect(200);
    expect(anon.text).not.toContain('Karlsaue 20c');
    expect(anon.text).toContain('LOCATION:Kassel');
  });

  it('wiederkehrender Termin: Serie mit Terminen am richtigen Wochentag um 10:00 Berliner Zeit', async () => {
    const res = await lead.agent
      .post('/api/v1/walks')
      .send(walkBody(group.id, { title: 'Jeden Dienstag', startsAt: undefined, recurring: { weekday: 2, timeOfDay: '10:00' } }))
      .expect(201);
    expect(res.body.seriesId).toBeTruthy();
    const walks = await db.select().from(s.walks).where(eq(s.walks.seriesId, res.body.seriesId));
    expect(walks.length).toBeGreaterThanOrEqual(8);
    expect(walks.length).toBeLessThanOrEqual(9);
    for (const w of walks) {
      const p = berlinParts(w.startsAt);
      expect(p.weekday).toBe(2);
      expect(`${p.hour}:${p.minute}`).toBe('10:0');
      expect(w.meetingAddress).toBe('An der Karlsaue 20c, 34121 Kassel');
    }
    // Job ist idempotent
    await generateAllSeries();
    expect((await db.select().from(s.walks).where(eq(s.walks.seriesId, res.body.seriesId))).length).toBe(walks.length);
    const detail = await member.agent.get(`/api/v1/groups/${group.id}`).expect(200);
    expect(detail.body.group.series.find((x: { id: string }) => x.id === res.body.seriesId)).toMatchObject({
      weekday: 2,
      timeOfDay: '10:00',
      active: true,
    });

    // Serie ändern: auf Donnerstag 18:00 → künftige Termine ohne Zusagen werden verschoben
    const first = walks.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
    await member.agent.put(`/api/v1/walks/${first.id}/rsvp`).send({ status: 'yes' }).expect(200);
    const patch = await lead.agent
      .patch(`/api/v1/walks/series/${res.body.seriesId}`)
      .send({ weekday: 4, timeOfDay: '18:00' })
      .expect(200);
    expect(patch.body.series).toMatchObject({ weekday: 4, timeOfDay: '18:00' });
    const after = await db.select().from(s.walks).where(eq(s.walks.seriesId, res.body.seriesId));
    expect(after.some((w) => w.id === first.id)).toBe(true); // mit Zusage bleibt
    const moved = after.filter((w) => w.id !== first.id);
    expect(moved.length).toBeGreaterThanOrEqual(8);
    for (const w of moved) expect(berlinParts(w.startsAt)).toMatchObject({ weekday: 4, hour: 18, minute: 0 });

    // Serie beenden: Termin mit Zusage wird abgesagt, Rest entfällt
    expect((await member.agent.delete(`/api/v1/walks/series/${res.body.seriesId}`)).status).toBe(403);
    await lead.agent.delete(`/api/v1/walks/series/${res.body.seriesId}`).expect(200);
    const end = await db.select().from(s.walks).where(eq(s.walks.seriesId, res.body.seriesId));
    expect(end).toHaveLength(1);
    expect(end[0].status).toBe('cancelled');
  });

  it('Walk bestätigen: legt Einträge für Teilnehmende an, idempotent', async () => {
    const { body } = await lead.agent.post('/api/v1/walks').send(walkBody(group.id, { title: 'Bestätigungsrunde' })).expect(201);
    const id = body.walk.id;
    await member.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'yes' }).expect(200);
    await lead.agent.put(`/api/v1/walks/${id}/rsvp`).send({ status: 'yes' }).expect(200);
    const early = await lead.agent.post(`/api/v1/walks/${id}/confirm`).send({ distanceKm: 5.2, durationMinutes: 62 });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('walk_not_started');
    await db.update(s.walks).set({ startsAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(s.walks.id, id));
    const d = await lead.agent.get(`/api/v1/walks/${id}`).expect(200);
    expect(d.body.walk.canConfirm).toBe(true);
    expect((await member.agent.post(`/api/v1/walks/${id}/confirm`).send({ distanceKm: 5, durationMinutes: 60 })).status).toBe(403);

    vi.mocked(onActivityRecorded).mockClear();
    const c1 = await lead.agent.post(`/api/v1/walks/${id}/confirm`).send({ distanceKm: 5.2, durationMinutes: 62 }).expect(200);
    expect(c1.body.confirmedCount).toBe(2);
    expect(onActivityRecorded).toHaveBeenCalledTimes(2);
    const c2 = await lead.agent.post(`/api/v1/walks/${id}/confirm`).send({ distanceKm: 5.2, durationMinutes: 62 }).expect(200);
    expect(c2.body.confirmedCount).toBe(2);
    expect(onActivityRecorded).toHaveBeenCalledTimes(2);
    const acts = await db.select().from(s.activities).where(eq(s.activities.walkId, id));
    expect(acts).toHaveLength(2);
    expect(acts[0]).toMatchObject({ source: 'group', distanceKm: 5.2, durationMinutes: 62 });
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, member.userId));
    expect(notes.filter((n) => n.type === 'walk_confirmed' && n.data.walkId === id)).toHaveLength(1);
    const after = await member.agent.get(`/api/v1/walks/${id}`).expect(200);
    expect(after.body.walk.confirmed).toBe(true);
  });

  it('Suche: Liste mit ungefährem Ort, Filter Tempo und Gruppenkalender', async () => {
    const g2 = await newGroup(lead.agent, { name: 'Flotte Runde', postalCode: '34131' });
    const { body } = await lead.agent.post('/api/v1/walks').send(walkBody(g2.id, { tempo: 'flott', title: 'Flott' })).expect(201);
    const res = await request(getApp()).get('/api/v1/walks?postalCode=34117&radiusKm=15&tempo=flott').expect(200);
    const item = res.body.walks.find((w: { id: string }) => w.id === body.walk.id);
    expect(item).toBeTruthy();
    expect(item.tempo).toBe('flott');
    expect(item.distanceFromCenterKm).toBeGreaterThan(0);
    expect(item.group).toMatchObject({ id: g2.id, name: 'Flotte Runde' });
    expect(item.meetingPoint).toBeUndefined();
    expect(res.body.walks.every((w: { tempo: string }) => w.tempo === 'flott')).toBe(true);
    const times = res.body.walks.map((w: { startsAt: string }) => w.startsAt);
    expect([...times].sort()).toEqual(times);
    const cal = await request(getApp()).get(`/api/v1/walks?groupId=${g2.id}`).expect(200);
    expect(cal.body.walks.map((w: { id: string }) => w.id)).toEqual([body.walk.id]);
  });

  it('Gemeinsam auf Distanz: jede Person kann anlegen, ohne Treffpunkt, ohne Ortsfilter', async () => {
    const p = await signUp({ name: 'Landfrau', postalCode: '17509' });
    const res = await p.agent
      .post('/api/v1/walks')
      .send({ kind: 'distance', title: 'Sonntag gemeinsam auf Distanz', startsAt: inDays(4), durationMinutes: 45, tempo: 'zuegig' })
      .expect(201);
    expect(res.body.walk.kind).toBe('distance');
    expect(res.body.walk.myRsvp).toBe('yes');
    expect(res.body.walk.canConfirm).toBe(false);
    const list = await member.agent.get('/api/v1/walks?kind=distance').expect(200);
    expect(list.body.walks.map((w: { id: string }) => w.id)).toContain(res.body.walk.id);
    const other = await member.agent.put(`/api/v1/walks/${res.body.walk.id}/rsvp`).send({ status: 'yes' }).expect(200);
    expect(other.body.participantCount).toBe(2);
    const d = await member.agent.get(`/api/v1/walks/${res.body.walk.id}`).expect(200);
    expect(d.body.walk.meetingPoint).toBeNull();
    expect(d.body.walk.participants).toHaveLength(2);
    // Gruppenkalender-Walks erscheinen nicht in der Distanz-Liste
    expect(list.body.walks.every((w: { kind: string }) => w.kind === 'distance')).toBe(true);
  });

  it('ändern nur durch Leitung', async () => {
    const { body } = await lead.agent.post('/api/v1/walks').send(walkBody(group.id)).expect(201);
    expect((await member.agent.patch(`/api/v1/walks/${body.walk.id}`).send({ title: 'Neu' })).status).toBe(403);
    const ok = await lead.agent.patch(`/api/v1/walks/${body.walk.id}`).send({ title: 'Neuer Titel', tempo: 'flott' }).expect(200);
    expect(ok.body.walk).toMatchObject({ title: 'Neuer Titel', tempo: 'flott', durationMinutes: 60 });
    expect((await lead.agent.get('/api/v1/walks/unbekannt')).body.error.code).toBe('walk_not_found');
  });
});
