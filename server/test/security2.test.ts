/**
 * Zweite Sicherheitsprüfung (Aylin Demir) – Pakete A/B/C, siehe docs/SICHERHEIT.md Abschnitt 6.
 * Jeder Test gehört zu einem Befund (S2-xx).
 */
import { and, eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { safeSubject, sendMail, sentMails } from '../src/lib/email.js';
import { errorHandler } from '../src/lib/http.js';
import { buildIcs } from '../src/lib/ics.js';
import { createCodeLookupLimiter } from '../src/lib/ratelimit.js';
import { INVITE_MAILS_PER_DAY } from '../src/modules/groups.js';
import { PARTNER_REQUESTS_PER_DAY } from '../src/modules/rural.js';
import { signUp, type Agent } from './helpers.js';

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

async function newGroup(agent: Agent, over: Record<string, unknown> = {}) {
  const res = await agent.post('/api/v1/groups').send({
    name: 'Sicherheitsrunde',
    description: '',
    rules: '',
    joinPolicy: 'open',
    womenOnly: false,
    postalCode: '34117',
    defaultTempo: 'zuegig',
    ...over,
  });
  expect(res.status).toBe(201);
  return res.body.group as { id: string; inviteCode: string };
}

const groupWalk = (groupId: string, over: Record<string, unknown> = {}) => ({
  kind: 'group',
  groupId,
  title: 'Dienstagsrunde',
  description: '',
  startsAt: inDays(3),
  durationMinutes: 60,
  tempo: 'zuegig',
  meetingPointName: 'Orangerie',
  meetingAddress: 'An der Karlsaue 20c, 34121 Kassel',
  meetingDescription: 'Links neben der Treppe',
  ...over,
});

describe('S2-01 Gesperrte Erstellerin verliert Treffpunkt und Verwaltung (auch Serien)', () => {
  it('nach Sperre: kein Treffpunkt in Detail/Liste/ICS, keine Änderung, keine Teilnehmerliste', async () => {
    const founder = await signUp({ name: 'Gründerin' });
    const mod = await signUp({ name: 'Mona' });
    const g = await newGroup(founder.agent);
    await mod.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    await founder.agent.patch(`/api/v1/groups/${g.id}/members/${mod.userId}`).send({ action: 'make_moderator' }).expect(200);

    const created = await mod.agent
      .post('/api/v1/walks')
      .send(groupWalk(g.id, { startsAt: undefined, recurring: { weekday: 2, timeOfDay: '10:00' } }))
      .expect(201);
    const walkId = created.body.walk.id as string;
    expect(created.body.walk.meetingPoint.address).toContain('Karlsaue');

    await founder.agent.patch(`/api/v1/groups/${g.id}/members/${mod.userId}`).send({ action: 'ban' }).expect(200);

    const detail = await mod.agent.get(`/api/v1/walks/${walkId}`).expect(200);
    expect(detail.body.walk.meetingPoint).toBeNull();
    expect(detail.body.walk.canSeeMeetingPoint).toBe(false);
    expect(detail.body.walk.canManage).toBe(false);
    expect(detail.body.walk.participants).toBeNull();

    const list = await mod.agent.get(`/api/v1/walks?groupId=${g.id}`).expect(200);
    expect(list.body.walks.length).toBeGreaterThan(1);
    expect(list.body.walks.every((w: { canSeeMeetingPoint: boolean }) => !w.canSeeMeetingPoint)).toBe(true);

    const ics = await mod.agent.get(`/api/v1/walks/${walkId}/ics`).expect(200);
    expect(ics.text).not.toContain('Karlsaue');
    expect(ics.text).not.toContain('Treppe');

    expect((await mod.agent.patch(`/api/v1/walks/${walkId}`).send({ title: 'Übernommen' })).status).toBe(403);
    expect((await mod.agent.delete(`/api/v1/walks/${walkId}`)).status).toBe(403);
    // Die Gründerin sieht und verwaltet weiterhin alles
    const own = await founder.agent.get(`/api/v1/walks/${walkId}`).expect(200);
    expect(own.body.walk.meetingPoint.address).toContain('Karlsaue');
    expect(own.body.walk.canManage).toBe(true);
  });
});

describe('S2-02 „Gemeinsam auf Distanz“ aus Einladungsgruppen nicht in öffentlichen Listen', () => {
  it('erscheint nur für Mitglieder in GET /walks?kind=distance und /rural/overview', async () => {
    const lead = await signUp({ name: 'Geheim' });
    const outsider = await signUp({ name: 'Fremde' });
    const g = await newGroup(lead.agent, { joinPolicy: 'invite', name: 'Geheime Runde' });
    const w = await lead.agent
      .post('/api/v1/walks')
      .send({ kind: 'distance', groupId: g.id, title: 'Geheimer Distanztermin', startsAt: inDays(2), durationMinutes: 45, tempo: 'zuegig' })
      .expect(201);
    const id = w.body.walk.id as string;

    const mine = await lead.agent.get('/api/v1/walks?kind=distance').expect(200);
    expect(mine.body.walks.map((x: { id: string }) => x.id)).toContain(id);

    const other = await outsider.agent.get('/api/v1/walks?kind=distance').expect(200);
    expect(other.body.walks.map((x: { id: string }) => x.id)).not.toContain(id);
    expect(JSON.stringify(other.body)).not.toContain('Geheime Runde');
    const anon = await request((await import('./helpers.js')).getApp()).get('/api/v1/walks?kind=distance').expect(200);
    expect(anon.body.walks.map((x: { id: string }) => x.id)).not.toContain(id);

    const overview = await outsider.agent.get('/api/v1/rural/overview?postalCode=34117').expect(200);
    expect(overview.body.distanceWalks.map((x: { id: string }) => x.id)).not.toContain(id);
    await outsider.agent.get(`/api/v1/walks/${id}`).expect(404);
  });
});

describe('S2-03 Einladungs-Mails: Tageskontingent je Person', () => {
  it(`erlaubt ${INVITE_MAILS_PER_DAY} Einladungen in 24 h, danach 429 rate_limited`, async () => {
    const lead = await signUp();
    const g = await newGroup(lead.agent);
    const batch = (n: number, k: number) => Array.from({ length: n }, (_, i) => `einl${Date.now()}-${k}-${i}@example.org`);
    let sent = 0;
    for (let k = 0; sent + 10 <= INVITE_MAILS_PER_DAY; k++) {
      const r = await lead.agent.post(`/api/v1/groups/${g.id}/invite/email`).send({ emails: batch(10, k) }).expect(200);
      sent += r.body.sent;
    }
    expect(sent).toBe(INVITE_MAILS_PER_DAY);
    const blocked = await lead.agent.post(`/api/v1/groups/${g.id}/invite/email`).send({ emails: batch(1, 99) });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('rate_limited');
  });
});

describe('S2-04 Ratenbegrenzung für erratbare Einladungscodes', () => {
  it('der Begrenzer liefert nach dem Limit 429 rate_limited (im Testmodus in den Routen aus)', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/x', createCodeLookupLimiter({ windowMs: 60_000, limit: 3 }), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    for (let i = 0; i < 3; i++) await request(app).get('/x').expect(200);
    const res = await request(app).get('/x').expect(429);
    expect(res.body.error.code).toBe('rate_limited');
  });
});

describe('S2-05 Gehpartner-Anfragen: Tageskontingent (E-Mail-Spam)', () => {
  it(`höchstens ${PARTNER_REQUESTS_PER_DAY} neue Anfragen je Tag; bestehende bleiben idempotent`, async () => {
    const sender = await signUp({ name: 'Sucher', postalCode: '24937' });
    const offerIds: string[] = [];
    for (let i = 0; i <= PARTNER_REQUESTS_PER_DAY; i++) {
      const id = crypto.randomUUID();
      await db.insert(s.user).values({ id, name: '', email: `partner${Date.now()}-${i}@example.org` });
      await db.insert(s.profile).values({ userId: id, displayName: `Partner ${i}` });
      const [o] = await db
        .insert(s.partnerOffers)
        .values({ userId: id, postalCode: '24937', city: 'Flensburg', lat: 54.78, lon: 9.43 })
        .returning();
      offerIds.push(o.id);
    }
    for (let i = 0; i < PARTNER_REQUESTS_PER_DAY; i++) {
      await sender.agent.post(`/api/v1/rural/partners/${offerIds[i]}/request`).send({ message: 'Hallo' }).expect(200);
    }
    const over = await sender.agent.post(`/api/v1/rural/partners/${offerIds[PARTNER_REQUESTS_PER_DAY]}/request`).send({ message: 'Hallo' });
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('rate_limited');
    // Wiederholung einer bestehenden Anfrage bleibt möglich (idempotent, ohne neue Mail)
    await sender.agent.post(`/api/v1/rural/partners/${offerIds[0]}/request`).send({ message: 'Hallo' }).expect(200);
  });
});

describe('S2-06 „Nur Frauen“ gilt auch bei der Freigabe offener Anfragen', () => {
  it('Gruppe nach der Anfrage auf „nur Frauen“ umgestellt → Freigabe eines Mannes 403 women_only', async () => {
    const lead = await signUp({ gender: 'woman' });
    const man = await signUp({ gender: 'man' });
    const g = await newGroup(lead.agent, { joinPolicy: 'request' });
    const join = await man.agent.post(`/api/v1/groups/${g.id}/join`).send({ message: 'Hallo' }).expect(200);
    expect(join.body.membership.status).toBe('pending');
    await lead.agent.patch(`/api/v1/groups/${g.id}`).send({ womenOnly: true }).expect(200);
    const res = await lead.agent.patch(`/api/v1/groups/${g.id}/members/${man.userId}`).send({ action: 'approve' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('women_only');
    const [m] = await db
      .select()
      .from(s.groupMembers)
      .where(and(eq(s.groupMembers.groupId, g.id), eq(s.groupMembers.userId, man.userId)));
    expect(m.status).toBe('pending');
  });
});

describe('S2-07 Einladungsgruppen: Beitrittsversuch verrät die Gruppe nicht', () => {
  it('POST /groups/:id/join auf eine Einladungsgruppe → 404 (auch bei „nur Frauen“)', async () => {
    const lead = await signUp();
    const man = await signUp({ gender: 'man' });
    const g = await newGroup(lead.agent, { joinPolicy: 'invite', womenOnly: true });
    const res = await man.agent.post(`/api/v1/groups/${g.id}/join`).send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('group_not_found');
    // per Code bleibt „nur Frauen“ wirksam
    const byCode = await man.agent.post('/api/v1/groups/join-by-code').send({ code: g.inviteCode });
    expect(byCode.status).toBe(403);
    expect(byCode.body.error.code).toBe('women_only');
    const accept = await man.agent.post(`/api/v1/invites/${g.inviteCode}/accept`).send({});
    expect(accept.body.error.code).toBe('women_only');
  });
});

describe('S2-08 Benutzertexte in E-Mail-Betreff und Kalenderdatei', () => {
  it('entfernt Zeilenumbrüche aus dem Betreff (Header-Injection)', async () => {
    expect(safeSubject('Abgesagt: Runde\r\nBcc: opfer@example.org')).toBe('Abgesagt: Runde Bcc: opfer@example.org');
    await sendMail({ to: 'betreff@example.org', subject: 'A\nB C', text: 'x' });
    expect(sentMails.find((m) => m.to === 'betreff@example.org')!.subject).toBe('A B C');
  });

  it('ICS: einzelnes CR in Titel/Ort erzeugt keine neue Kalender-Eigenschaft', () => {
    const ics = buildIcs({
      uid: 'u1',
      title: 'Runde\rATTENDEE:mailto:x@evil.example',
      description: 'a\r\nb',
      location: 'Ort\rURL:https://evil.example',
      start: new Date('2026-12-01T09:00:00Z'),
      durationMinutes: 60,
    });
    const lines = ics.split('\r\n');
    expect(lines.some((l) => l.startsWith('ATTENDEE'))).toBe(false);
    expect(lines.some((l) => l.startsWith('URL:https://evil'))).toBe(false);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/\r/);
    expect(ics).toContain('SUMMARY:Runde\\nATTENDEE:mailto:x@evil.example');
  });
});

describe('S2-09/S2-10 Benachrichtigungen: Blockieren und Kontolöschung', () => {
  let lead: Awaited<ReturnType<typeof signUp>>;
  let g: { id: string };
  beforeAll(async () => {
    lead = await signUp({ name: 'Leitung' });
    g = await newGroup(lead.agent, { joinPolicy: 'request' });
  });

  it('Beitrittsanfrage einer blockierten Person erscheint nicht mehr', async () => {
    const x = await signUp({ name: 'Störerin' });
    await x.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    const before = await lead.agent.get('/api/v1/notifications').expect(200);
    expect(before.body.notifications.some((n: { data: { userId?: string } }) => n.data.userId === x.userId)).toBe(true);
    await lead.agent.post(`/api/v1/users/${x.userId}/block`).send({}).expect(200);
    const after = await lead.agent.get('/api/v1/notifications').expect(200);
    expect(after.body.notifications.some((n: { data: { userId?: string } }) => n.data.userId === x.userId)).toBe(false);
  });

  it('Kontolöschung entfernt Hinweise bei anderen, die den Namen enthalten', async () => {
    const y = await signUp({ name: 'Yvonne Ausgetreten' });
    await y.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    await y.agent.delete('/api/v1/me').send({ confirm: 'LÖSCHEN' }).expect(200);
    const rows = await db.select().from(s.notifications).where(eq(s.notifications.userId, lead.userId));
    expect(JSON.stringify(rows)).not.toContain('Yvonne Ausgetreten');
  });
});

describe('S2-11 Gruppen-Challenge: Rangliste nur für aktive Mitglieder', () => {
  it('entferntes Mitglied sieht nur noch die eigene Zeile', async () => {
    const lead = await signUp({ name: 'Leitung' });
    const a = await signUp({ name: 'Annegret' });
    const b = await signUp({ name: 'Berta' });
    const g = await newGroup(lead.agent);
    await a.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    await b.agent.post(`/api/v1/groups/${g.id}/join`).send({}).expect(200);
    const ch = await lead.agent
      .post('/api/v1/challenges')
      .send({
        groupId: g.id,
        title: 'Adventsrunde',
        summary: 'Gemeinsam 20 Kilometer bis Weihnachten.',
        type: 'total_distance',
        target: 20,
        startsAt: new Date().toISOString(),
        endsAt: inDays(20),
      })
      .expect(201);
    const id = ch.body.challenge.id as string;
    await a.agent.post(`/api/v1/challenges/${id}/join`).send({}).expect(200);
    await b.agent.post(`/api/v1/challenges/${id}/join`).send({}).expect(200);
    const asMember = await b.agent.get(`/api/v1/challenges/${id}`).expect(200);
    expect(asMember.body.leaderboard.map((r: { name: string }) => r.name)).toContain('Annegret');

    await lead.agent.patch(`/api/v1/groups/${g.id}/members/${b.userId}`).send({ action: 'ban' }).expect(200);
    const asBanned = await b.agent.get(`/api/v1/challenges/${id}`).expect(200);
    expect(asBanned.body.leaderboard).toHaveLength(1);
    expect(asBanned.body.leaderboard[0].isMe).toBe(true);
    expect(JSON.stringify(asBanned.body)).not.toContain('Annegret');
  });
});

describe('S2-12 Gehpartner: Blockieren gilt auch für offene Anfragen', () => {
  it('Annahme einer Anfrage einer (später) blockierten Person → 404', async () => {
    const anna = await signUp({ name: 'Anna', postalCode: '24937' });
    const bernd = await signUp({ name: 'Bernd', postalCode: '24943', gender: 'man' });
    const offer = await anna.agent.put('/api/v1/rural/partner-offer').send({ postalCode: '24937' }).expect(200);
    const r = await bernd.agent.post(`/api/v1/rural/partners/${offer.body.offer.id}/request`).send({ message: 'Hallo' }).expect(200);
    await anna.agent.post(`/api/v1/users/${bernd.userId}/block`).send({}).expect(200);
    const res = await anna.agent
      .post(`/api/v1/rural/partner-requests/${r.body.request.id}/accept`)
      .send({ startsAt: inDays(2), meetingPointName: 'Hafen', meetingAddress: 'Schiffbrücke 1, Flensburg' });
    expect(res.status).toBe(404);
  });
});

describe('Lena-Entscheidungen: Privatzone und geschützte Namen', () => {
  it('kürzt Start und Ziel einer Route für andere, nicht für sich selbst', async () => {
    const { maskRouteForOthers } = await import('../src/lib/geo.js');
    // ca. 2 km gerade Linie in 100-m-Schritten
    const route: [number, number][] = Array.from({ length: 21 }, (_, i) => [9.49, 51.31 + i * 0.0009]);
    const masked = maskRouteForOthers(route)!;
    expect(masked.length).toBeLessThan(route.length);
    expect(masked[0]).not.toEqual(route[0]);
    expect(masked.at(-1)).not.toEqual(route.at(-1));
    expect(maskRouteForOthers(route.slice(0, 4))).toBeNull(); // zu kurz → keine Route
  });

  it('lehnt Anzeigenamen ab, die wie das Gehmeinsam-Team aussehen', async () => {
    const { agent } = await signUp();
    await agent.patch('/api/v1/me/profile').send({ displayName: 'Gehmeinsam Team' }).expect(400);
    await agent.patch('/api/v1/me/profile').send({ displayName: 'Erika' }).expect(200);
  });
});
