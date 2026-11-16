import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { sentMails } from '../src/lib/email.js';
import { awardBadge } from '../src/services/gamification.js';
import { getApp, signUp, type Agent } from './helpers.js';

vi.mock('../src/services/gamification.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/services/gamification.js')>();
  return { ...orig, awardBadge: vi.fn(orig.awardBadge), onActivityRecorded: vi.fn(orig.onActivityRecorded) };
});

async function newGroup(agent: Agent, over: Record<string, unknown> = {}) {
  const res = await agent.post('/api/v1/groups').send({
    name: 'Einladungsrunde',
    description: 'Wir gehen jeden Dienstag.',
    rules: '',
    joinPolicy: 'invite',
    womenOnly: false,
    postalCode: '34119',
    defaultTempo: 'zuegig',
    ...over,
  });
  expect(res.status).toBe(201);
  return res.body.group as { id: string; inviteCode: string; name: string };
}

describe('Einladungen', () => {
  let founder: Awaited<ReturnType<typeof signUp>>;
  beforeAll(async () => {
    founder = await signUp({ name: 'Gründerin' });
  });

  it('Einladungscode: öffentliche Vorschau und Annahme führt direkt in die Gruppe', async () => {
    const g = await newGroup(founder.agent);
    const preview = await request(getApp()).get(`/api/v1/invites/${g.inviteCode}`).expect(200);
    expect(preview.body).toMatchObject({ valid: true, group: { id: g.id, name: 'Einladungsrunde', city: 'Kassel', memberCount: 1, womenOnly: false } });
    // klein geschrieben und ohne Bindestrich funktioniert auch
    const lower = await request(getApp()).get(`/api/v1/invites/${g.inviteCode.replace('-', '').toLowerCase()}`).expect(200);
    expect(lower.body.valid).toBe(true);
    const p = await signUp({ name: 'Neue' });
    const a = await p.agent.post(`/api/v1/invites/${g.inviteCode}/accept`).send({}).expect(200);
    expect(a.body).toEqual({ groupId: g.id, membership: { role: 'member', status: 'active' } });
    const b = await p.agent.post(`/api/v1/invites/${g.inviteCode}/accept`).send({}).expect(200);
    expect(b.body).toEqual(a.body);
    const d = await p.agent.get(`/api/v1/groups/${g.id}`).expect(200);
    expect(d.body.group.myMembership.status).toBe('active');
    const mine = await p.agent.get('/api/v1/me/groups').expect(200);
    expect(mine.body.groups.map((x: { id: string }) => x.id)).toContain(g.id);
  });

  it('ungültiger Code', async () => {
    const res = await request(getApp()).get('/api/v1/invites/WALK-ZZZZZZ').expect(200);
    expect(res.body).toEqual({ valid: false, group: null });
    const p = await signUp();
    const r = await p.agent.post('/api/v1/invites/WALK-ZZZZZZ/accept').send({});
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('invite_invalid');
    expect((await request(getApp()).post('/api/v1/invites/WALK-ZZZZZZ/accept').send({})).status).toBe(401);
  });

  it('E-Mail-Einladung mit persönlichem Link; Einladende bekommt Abzeichen', async () => {
    const g = await newGroup(founder.agent, { name: 'Mailrunde' });
    const email = `eingeladen${Date.now()}@example.org`;
    const res = await founder.agent
      .post(`/api/v1/groups/${g.id}/invite/email`)
      .send({ emails: [email, email.toUpperCase()], message: 'Komm doch mit!' })
      .expect(200);
    expect(res.body.sent).toBe(1);
    const mail = sentMails.find((m) => m.to === email);
    expect(mail).toBeTruthy();
    expect(mail!.subject).toContain('Mailrunde');
    expect(mail!.text).toContain('Sie');
    expect(mail!.text).toContain('Komm doch mit!');
    expect(mail!.html).toContain('Einladung ansehen');
    const token = mail!.text.match(/\/einladung\/([A-Za-z0-9_-]+)/)![1];
    expect(token.length).toBeGreaterThan(20);

    const preview = await request(getApp()).get(`/api/v1/invites/${token}`).expect(200);
    expect(preview.body.valid).toBe(true);
    expect(preview.body.group.name).toBe('Mailrunde');

    vi.mocked(awardBadge).mockClear();
    const p = await signUp({ name: 'Eingeladene' });
    const a = await p.agent.post(`/api/v1/invites/${token}/accept`).send({}).expect(200);
    expect(a.body.membership.status).toBe('active');
    expect(awardBadge).toHaveBeenCalledWith(founder.userId, 'inviter');
    const [row] = await db.select().from(s.groupMembers).where(eq(s.groupMembers.userId, p.userId));
    expect(row.invitedBy).toBe(founder.userId);
    // doppelt annehmen schadet nicht
    await p.agent.post(`/api/v1/invites/${token}/accept`).send({}).expect(200);
    expect(vi.mocked(awardBadge).mock.calls.filter((c) => c[1] === 'inviter')).toHaveLength(1);
    // persönlicher Link: für andere nicht mehr gültig
    const other = await signUp();
    const r = await other.agent.post(`/api/v1/invites/${token}/accept`).send({});
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('invite_invalid');
  });

  it('abgelaufener Link ist ungültig', async () => {
    const g = await newGroup(founder.agent, { name: 'Ablaufrunde' });
    await db.insert(s.groupInvites).values({ groupId: g.id, token: 'abgelaufen-token-1234567890', email: null, createdBy: founder.userId, expiresAt: new Date(Date.now() - 1000) });
    const res = await request(getApp()).get('/api/v1/invites/abgelaufen-token-1234567890').expect(200);
    expect(res.body.valid).toBe(false);
  });

  it('nur aktive Mitglieder dürfen per E-Mail einladen; höchstens 10 Adressen', async () => {
    const g = await newGroup(founder.agent, { name: 'Grenzrunde', joinPolicy: 'open' });
    const p = await signUp();
    const r = await p.agent.post(`/api/v1/groups/${g.id}/invite/email`).send({ emails: ['a@example.org'] });
    expect(r.status).toBe(403);
    const many = Array.from({ length: 11 }, (_, i) => `x${i}@example.org`);
    expect((await founder.agent.post(`/api/v1/groups/${g.id}/invite/email`).send({ emails: many })).status).toBe(400);
    expect((await founder.agent.post(`/api/v1/groups/${g.id}/invite/email`).send({ emails: ['keine-mail'] })).status).toBe(400);
  });

  it('Einladung umgeht „auf Anfrage“, aber nicht Sperre und „nur Frauen“', async () => {
    const g = await newGroup(founder.agent, { name: 'Anfrage mit Einladung', joinPolicy: 'request' });
    const p = await signUp();
    const viaCode = await p.agent.post('/api/v1/groups/join-by-code').send({ code: g.inviteCode }).expect(200);
    expect(viaCode.body).toEqual({ groupId: g.id, membership: { role: 'member', status: 'pending' } });
    const viaLink = await p.agent.post(`/api/v1/invites/${g.inviteCode}/accept`).send({}).expect(200);
    expect(viaLink.body.membership.status).toBe('active');

    const banned = await signUp();
    await founder.agent.patch(`/api/v1/groups/${g.id}/members/${banned.userId}`).send({ action: 'ban' }).expect(200);
    const rb = await banned.agent.post(`/api/v1/invites/${g.inviteCode}/accept`).send({});
    expect(rb.status).toBe(403);
    expect(rb.body.error.code).toBe('banned');

    const wg = await newGroup(founder.agent, { name: 'Frauen mit Einladung', womenOnly: true });
    const man = await signUp({ gender: 'man' });
    const rw = await man.agent.post(`/api/v1/invites/${wg.inviteCode}/accept`).send({});
    expect(rw.status).toBe(403);
    expect(rw.body.error.code).toBe('women_only');
  });

  it('Beitritt per Code: offen/Einladung → aktiv; falscher Code → invite_invalid', async () => {
    const g = await newGroup(founder.agent, { name: 'Coderunde' });
    const p = await signUp();
    const r = await p.agent.post('/api/v1/groups/join-by-code').send({ code: ` ${g.inviteCode.toLowerCase()} ` }).expect(200);
    expect(r.body.membership.status).toBe('active');
    const bad = await p.agent.post('/api/v1/groups/join-by-code').send({ code: 'WALK-ZZZZZZ' });
    expect(bad.status).toBe(404);
    expect(bad.body.error.code).toBe('invite_invalid');
  });
});
