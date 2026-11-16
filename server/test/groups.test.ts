import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { lookupPostalCode } from '../src/lib/geo.js';
import { awardBadge } from '../src/services/gamification.js';
import { getApp, signUp, type Agent } from './helpers.js';

vi.mock('../src/services/gamification.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/services/gamification.js')>();
  return { ...orig, awardBadge: vi.fn(orig.awardBadge), onActivityRecorded: vi.fn(orig.onActivityRecorded) };
});

const base = {
  name: 'Testgruppe Karlsaue',
  description: 'Wir gehen zügig.',
  rules: 'Pünktlich sein.',
  joinPolicy: 'open',
  womenOnly: false,
  postalCode: '34117',
  defaultTempo: 'zuegig',
};

async function createGroup(agent: Agent, over: Partial<typeof base> = {}) {
  const res = await agent.post('/api/v1/groups').send({ ...base, ...over });
  expect(res.status).toBe(201);
  return res.body.group;
}

async function createWalk(agent: Agent, groupId: string, over: Record<string, unknown> = {}) {
  const res = await agent.post('/api/v1/walks').send({
    kind: 'group',
    groupId,
    title: 'Runde um den See',
    startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    durationMinutes: 60,
    tempo: 'zuegig',
    meetingPointName: 'Orangerie',
    meetingAddress: 'An der Karlsaue 20c, 34121 Kassel',
    meetingDescription: 'Links neben der Treppe',
    meetingLat: 51.3093,
    meetingLon: 9.4946,
    ...over,
  });
  expect(res.status).toBe(201);
  return res.body.walk;
}

const notificationCount = async (userId: string) =>
  (await db.select().from(s.notifications).where(eq(s.notifications.userId, userId))).length;

describe('Gruppen', () => {
  let founder: Awaited<ReturnType<typeof signUp>>;
  beforeAll(async () => {
    founder = await signUp({ name: 'Renate', postalCode: '34117', gender: 'woman' });
  });

  it('liefert freundliche Vorlagen', async () => {
    const res = await request(getApp()).get('/api/v1/groups/templates').expect(200);
    const names = res.body.templates.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(['Morgenrunde im Park', 'Feierabend-Walk', 'Frauen-Walk am Wochenende', 'Dorfrunde']));
    expect(res.body.templates[0].series).toMatchObject({ weekday: expect.any(Number), timeOfDay: expect.stringMatching(/^\d\d:\d\d$/) });
  });

  it('gründet eine Gruppe: Gründerin, Abzeichen, Einladungscode', async () => {
    const g = await createGroup(founder.agent);
    expect(g.isFounder).toBe(true);
    expect(g.canManage).toBe(true);
    expect(g.memberCount).toBe(1);
    expect(g.city).toBe('Kassel');
    expect(g.inviteCode).toMatch(/^WALK-[A-HJ-NP-Z2-9]{6}$/);
    expect(g.leads[0]).toMatchObject({ id: founder.userId, displayName: 'Renate', role: 'founder' });
    expect(g.leads[0].email).toBeUndefined();
    expect(awardBadge).toHaveBeenCalledWith(founder.userId, 'group_founder');
  });

  it('prüft Eingaben', async () => {
    const res = await founder.agent.post('/api/v1/groups').send({ ...base, postalCode: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
  });

  it('„nur Frauen“: Gründung und Beitritt nur für Frauen', async () => {
    const man = await signUp({ name: 'Klaus', gender: 'man' });
    const r1 = await man.agent.post('/api/v1/groups').send({ ...base, womenOnly: true });
    expect(r1.status).toBe(403);
    expect(r1.body.error.code).toBe('women_only');
    const g = await createGroup(founder.agent, { name: 'Frauenrunde', womenOnly: true });
    const r2 = await man.agent.post(`/api/v1/groups/${g.id}/join`).send({});
    expect(r2.status).toBe(403);
    expect(r2.body.error.code).toBe('women_only');
    const woman = await signUp({ name: 'Ingrid', gender: 'woman' });
    const r3 = await woman.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    expect(r3.body.membership).toEqual({ role: 'member', status: 'active' });
  });

  it('Beitritt offen → aktiv, idempotent', async () => {
    const g = await createGroup(founder.agent, { name: 'Offene Runde' });
    const p = await signUp({ name: 'Heinz', gender: 'man' });
    const a = await p.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    const b = await p.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    expect(a.body.membership).toEqual({ role: 'member', status: 'active' });
    expect(b.body).toEqual(a.body);
    const d = await p.agent.get(`/api/v1/groups/${g.id}`).expect(200);
    expect(d.body.group.memberCount).toBe(2);
    expect(d.body.group.myMembership).toEqual({ role: 'member', status: 'active' });
    expect(d.body.group.inviteCode).toBe(g.inviteCode);
  });

  it('Beitritt auf Anfrage → wartend, Leitung wird benachrichtigt und bestätigt', async () => {
    const g = await createGroup(founder.agent, { name: 'Anfragerunde', joinPolicy: 'request' });
    const p = await signUp({ name: 'Gisela' });
    const before = await notificationCount(founder.userId);
    const r = await p.agent.post(`/api/v1/groups/${g.id}/join`).send({ message: 'Ich würde gern mitgehen.' }).expect(200);
    expect(r.body.membership.status).toBe('pending');
    await p.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    expect(await notificationCount(founder.userId)).toBe(before + 1);
    // wartende Person sieht keinen Code und keine Mitgliederliste
    const d = await p.agent.get(`/api/v1/groups/${g.id}`).expect(200);
    expect(d.body.group.inviteCode).toBeNull();
    expect((await p.agent.get(`/api/v1/groups/${g.id}/members`)).status).toBe(403);
    // Leitung sieht wartende Anfrage mit Nachricht
    const m = await founder.agent.get(`/api/v1/groups/${g.id}/members`).expect(200);
    const pending = m.body.members.find((x: { id: string }) => x.id === p.userId);
    expect(pending).toMatchObject({ status: 'pending', requestMessage: 'Ich würde gern mitgehen.' });
    const ap = await founder.agent.patch(`/api/v1/groups/${g.id}/members/${p.userId}`).send({ action: 'approve' }).expect(200);
    expect(ap.body.member.status).toBe('active');
  });

  it('nur auf Einladung: Beitritt verboten, nicht in Suche, Detail nur für Mitglieder', async () => {
    const g = await createGroup(founder.agent, { name: 'Geheime Einladungsrunde', joinPolicy: 'invite' });
    const p = await signUp({ name: 'Ute' });
    const r = await p.agent.post(`/api/v1/groups/${g.id}/join`).send({});
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('invite_only');
    const search = await p.agent.get('/api/v1/groups?postalCode=34117&radiusKm=15').expect(200);
    expect(search.body.groups.map((x: { id: string }) => x.id)).not.toContain(g.id);
    const q = await p.agent.get('/api/v1/groups?q=Geheime').expect(200);
    expect(q.body.groups).toHaveLength(0);
    expect((await p.agent.get(`/api/v1/groups/${g.id}`)).status).toBe(404);
    expect((await request(getApp()).get(`/api/v1/groups/${g.id}`)).status).toBe(404);
    // Walks dieser Gruppe nicht in der Walk-Suche
    const w = await createWalk(founder.agent, g.id);
    const ws = await p.agent.get('/api/v1/walks?postalCode=34117&radiusKm=15').expect(200);
    expect(ws.body.walks.map((x: { id: string }) => x.id)).not.toContain(w.id);
    expect((await p.agent.get(`/api/v1/walks/${w.id}`)).status).toBe(404);
    const own = await founder.agent.get('/api/v1/walks?postalCode=34117&radiusKm=15').expect(200);
    expect(own.body.walks.map((x: { id: string }) => x.id)).toContain(w.id);
  });

  it('Suche per PLZ mit Umkreis, Entfernung und nächsten Gruppen außerhalb', async () => {
    const g = await createGroup(founder.agent, { name: 'Suchrunde Kassel' });
    const res = await request(getApp()).get('/api/v1/groups?postalCode=34119&radiusKm=5').expect(200);
    const hit = res.body.groups.find((x: { id: string }) => x.id === g.id);
    expect(hit).toBeTruthy();
    expect(hit.distanceKm).toBeGreaterThan(0);
    expect(hit.distanceKm).toBeLessThan(5);
    expect(res.body.center.city).toBe('Kassel');
    // Hann. Münden: Kassel liegt ~16 km entfernt → außerhalb von 5 km, aber unter „nearest“
    const far = await request(getApp()).get('/api/v1/groups?postalCode=34346&radiusKm=5').expect(200);
    expect(far.body.groups.map((x: { id: string }) => x.id)).not.toContain(g.id);
    expect(far.body.nearest.length).toBeGreaterThan(0);
    expect(far.body.nearest.length).toBeLessThanOrEqual(3);
    expect(far.body.nearest[0].distanceKm).toBeGreaterThan(5);
    const bad = await request(getApp()).get('/api/v1/groups?postalCode=34117&radiusKm=7');
    expect(bad.status).toBe(400);
  });

  it('Treffpunkt nur für aktive Mitglieder sichtbar; Suche zeigt nur den ungefähren Ort', async () => {
    const g = await createGroup(founder.agent, { name: 'Treffpunktrunde' });
    const w = await createWalk(founder.agent, g.id);
    const stranger = await signUp({ name: 'Fremd' });
    const d1 = await stranger.agent.get(`/api/v1/walks/${w.id}`).expect(200);
    expect(d1.body.walk.meetingPoint).toBeNull();
    expect(d1.body.walk.canSeeMeetingPoint).toBe(false);
    expect(d1.body.walk.participants).toBeNull();
    expect(JSON.stringify(d1.body)).not.toContain('Karlsaue 20c');
    const anon = await request(getApp()).get(`/api/v1/walks/${w.id}`).expect(200);
    expect(anon.body.walk.meetingPoint).toBeNull();
    // Liste/Karte: Gruppenmittelpunkt statt Treffpunkt
    const list = await stranger.agent.get('/api/v1/walks?postalCode=34117&radiusKm=15').expect(200);
    const item = list.body.walks.find((x: { id: string }) => x.id === w.id);
    expect(item.lat).toBe(lookupPostalCode('34117')!.lat);
    expect(item.lat).not.toBe(51.3093);
    expect(JSON.stringify(list.body)).not.toContain('Karlsaue 20c');
    // nach Beitritt sichtbar
    await stranger.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    const d2 = await stranger.agent.get(`/api/v1/walks/${w.id}`).expect(200);
    expect(d2.body.walk.meetingPoint).toMatchObject({ name: 'Orangerie', address: 'An der Karlsaue 20c, 34121 Kassel' });
    expect(d2.body.walk.participants).toEqual([]);
  });

  it('Sperren und Entfernen ohne Benachrichtigung der Betroffenen', async () => {
    const g = await createGroup(founder.agent, { name: 'Sperrrunde' });
    const a = await signUp({ name: 'Anna' });
    const b = await signUp({ name: 'Berta' });
    await a.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    await b.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    const na = await notificationCount(a.userId);
    const nb = await notificationCount(b.userId);

    const rm = await founder.agent.patch(`/api/v1/groups/${g.id}/members/${a.userId}`).send({ action: 'remove' }).expect(200);
    expect(rm.body.member).toBeNull();
    const ban = await founder.agent.patch(`/api/v1/groups/${g.id}/members/${b.userId}`).send({ action: 'ban' }).expect(200);
    expect(ban.body.member.status).toBe('banned');
    expect(await notificationCount(a.userId)).toBe(na);
    expect(await notificationCount(b.userId)).toBe(nb);

    // entfernt: darf wieder beitreten; gesperrt: nicht
    await a.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    const again = await b.agent.post(`/api/v1/groups/${g.id}/join`).send({});
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('banned');
    // Austreten hebt die Sperre nicht auf
    await b.agent.post(`/api/v1/groups/${g.id}/leave`).send({}).expect(200);
    expect((await b.agent.post(`/api/v1/groups/${g.id}/join`).send({})).body.error.code).toBe('banned');
    // nur die Leitung sieht gesperrte Personen
    const memberView = await a.agent.get(`/api/v1/groups/${g.id}/members`).expect(200);
    expect(memberView.body.members.map((m: { id: string }) => m.id)).not.toContain(b.userId);
    const leadView = await founder.agent.get(`/api/v1/groups/${g.id}/members`).expect(200);
    expect(leadView.body.members.find((m: { id: string }) => m.id === b.userId).status).toBe('banned');
    // Mitglied darf nicht verwalten
    const r = await a.agent.patch(`/api/v1/groups/${g.id}/members/${founder.userId}`).send({ action: 'remove' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('not_group_lead');
    await founder.agent.patch(`/api/v1/groups/${g.id}/members/${b.userId}`).send({ action: 'unban' }).expect(200);
    await b.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
  });

  it('Moderatorinnen ernennt nur die Gründerin; Gründung übergeben', async () => {
    const g = await createGroup(founder.agent, { name: 'Leitungsrunde' });
    const a = await signUp({ name: 'Moni' });
    const b = await signUp({ name: 'Petra' });
    await a.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    await b.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    const mod = await founder.agent.patch(`/api/v1/groups/${g.id}/members/${a.userId}`).send({ action: 'make_moderator' }).expect(200);
    expect(mod.body.member.role).toBe('moderator');
    const r = await a.agent.patch(`/api/v1/groups/${g.id}/members/${b.userId}`).send({ action: 'make_moderator' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('not_founder');
    // Moderatorin darf ein Mitglied entfernen
    await a.agent.patch(`/api/v1/groups/${g.id}/members/${b.userId}`).send({ action: 'remove' }).expect(200);
    // Gründerin kann nicht austreten
    const leave = await founder.agent.post(`/api/v1/groups/${g.id}/leave`).send({});
    expect(leave.status).toBe(409);
    expect(leave.body.error.code).toBe('founder_cannot_leave');
    await founder.agent.patch(`/api/v1/groups/${g.id}/members/${a.userId}`).send({ action: 'make_founder' }).expect(200);
    const d = await a.agent.get(`/api/v1/groups/${g.id}`).expect(200);
    expect(d.body.group.isFounder).toBe(true);
    await founder.agent.post(`/api/v1/groups/${g.id}/leave`).send({}).expect(200);
    // nur Gründerin darf löschen
    const del = await b.agent.delete(`/api/v1/groups/${g.id}`);
    expect(del.status).toBe(403);
    await a.agent.delete(`/api/v1/groups/${g.id}`).expect(200);
    expect((await a.agent.get(`/api/v1/groups/${g.id}`)).status).toBe(404);
  });

  it('ändert eine Gruppe (Leitung) und lehnt andere ab', async () => {
    const g = await createGroup(founder.agent, { name: 'Änderungsrunde' });
    const p = await signUp();
    const r = await p.agent.patch(`/api/v1/groups/${g.id}`).send({ name: 'Neu' });
    expect(r.status).toBe(403);
    const ok = await founder.agent.patch(`/api/v1/groups/${g.id}`).send({ rules: 'Neue Regeln', postalCode: '34131' }).expect(200);
    expect(ok.body.group.rules).toBe('Neue Regeln');
    expect(ok.body.group.description).toBe(base.description);
    expect(ok.body.group.name).toBe('Änderungsrunde');
  });

  it('Einladungslinks und Aushang mit QR-Code', async () => {
    const g = await createGroup(founder.agent, { name: 'Aushangrunde' });
    const inv = await founder.agent.get(`/api/v1/groups/${g.id}/invite`).expect(200);
    expect(inv.body.url).toBe(`http://localhost:5173/einladung/${g.inviteCode}`);
    expect(inv.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(inv.body.whatsappUrl)).toContain(inv.body.url);
    expect(inv.body.mailtoUrl).toMatch(/^mailto:/);
    const poster = await founder.agent.get(`/api/v1/groups/${g.id}/poster`).expect(200);
    expect(poster.body.qrSvg).toContain('<svg');
    expect(poster.body.code).toBe(g.inviteCode);
    const p = await signUp();
    expect((await p.agent.get(`/api/v1/groups/${g.id}/invite`)).status).toBe(403);
    expect((await p.agent.get(`/api/v1/groups/${g.id}/poster`)).status).toBe(403);
  });

  it('Foto der Gruppe hochladen und abrufen', async () => {
    const g = await createGroup(founder.agent, { name: 'Fotorunde' });
    const img = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#3a7' } }).png().toBuffer();
    const up = await founder.agent.post(`/api/v1/groups/${g.id}/photo`).attach('photo', img, 'bild.png').expect(200);
    expect(up.body.photoUrl).toContain(`/api/v1/groups/${g.id}/photo`);
    const get = await request(getApp()).get(up.body.photoUrl).expect(200);
    expect(get.headers['content-type']).toContain('image/jpeg');
    const p = await signUp();
    expect((await p.agent.post(`/api/v1/groups/${g.id}/photo`).attach('photo', img, 'bild.png')).status).toBe(403);
    const bad = await founder.agent.post(`/api/v1/groups/${g.id}/photo`).attach('photo', Buffer.from('kein bild'), 'x.png');
    expect(bad.status).toBe(400);
  });

  it('blockierte Personen erscheinen nicht in der Mitgliederliste', async () => {
    const g = await createGroup(founder.agent, { name: 'Blockrunde' });
    const a = await signUp({ name: 'Alma' });
    const b = await signUp({ name: 'Bodo' });
    await a.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    await b.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    await db.insert(s.blocks).values({ blockerId: a.userId, blockedId: b.userId });
    const ma = await a.agent.get(`/api/v1/groups/${g.id}/members`).expect(200);
    expect(ma.body.members.map((m: { id: string }) => m.id)).not.toContain(b.userId);
    const mb = await b.agent.get(`/api/v1/groups/${g.id}/members`).expect(200);
    expect(mb.body.members.map((m: { id: string }) => m.id)).not.toContain(a.userId);
    const mf = await founder.agent.get(`/api/v1/groups/${g.id}/members`).expect(200);
    expect(mf.body.members).toHaveLength(3);
    for (const m of mf.body.members) {
      expect(Object.keys(m).sort()).toEqual(['avatarUrl', 'displayName', 'id', 'joinedAt', 'role', 'status']);
    }
    await db.delete(s.blocks).where(and(eq(s.blocks.blockerId, a.userId), eq(s.blocks.blockedId, b.userId)));
  });
});
