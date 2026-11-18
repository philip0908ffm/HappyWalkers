import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import sharp from 'sharp';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { sentMails } from '../src/lib/email.js';
import { displayNameFromEmail, seedAdmins } from '../src/services/seed-admins.js';
import { resolveKey } from '../src/services/storage.js';
import { getApp, signUp } from './helpers.js';

const api = '/api/v1';
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Wanderweg-am-See-2026';
let n = 0;
const uniqueEmail = (prefix = 'chefin') => `${prefix}${Date.now()}${n++}@example.org`;

/** Anmeldung „Mit Passwort“ (Better Auth /sign-in/email). */
async function passwordLogin(email: string, password: string) {
  const agent = request.agent(getApp());
  const res = await agent.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email, password });
  return { agent, res };
}

/** Legt per Seed ein Admin-Konto an und meldet es mit Passwort an. */
async function adminAgent() {
  const email = uniqueEmail();
  const r = await seedAdmins({ emails: [email], password: PASSWORD, production: true, log: () => {} });
  expect(r.created).toEqual([email]);
  const { agent, res } = await passwordLogin(email, PASSWORD);
  expect(res.status).toBe(200);
  const me = await agent.get(`${api}/me`).expect(200);
  return { agent, email, userId: me.body.me.id as string };
}

async function jpeg(): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 24, channels: 3, background: { r: 10, g: 120, b: 40 } } })
    .jpeg()
    .toBuffer();
}

describe('Passwort-Anmeldung', () => {
  it('klappt für ein angelegtes Start-Konto; Profil ist fertig, Rolle admin', async () => {
    const { agent, email } = await adminAgent();
    const me = (await agent.get(`${api}/me`).expect(200)).body.me;
    expect(me.isAdmin).toBe(true);
    expect(me.onboarded).toBe(true);
    expect(me.email).toBe(email);
    expect(me.displayName).toBe(displayNameFromEmail(email));
    expect(me.displayName.charAt(0)).toBe('C');
    expect(me.postalCode).toBeNull();
    const [u] = await db.select().from(s.user).where(eq(s.user.email, email));
    expect(u.emailVerified).toBe(true);
  });

  it('falsches Passwort und unbekannte E-Mail ergeben denselben Fehler', async () => {
    const { email } = await adminAgent();
    const wrong = (await passwordLogin(email, 'falsches-passwort-123')).res;
    const unknown = (await passwordLogin(uniqueEmail('niemand'), 'falsches-passwort-123')).res;
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect(unknown.body.code).toBe(wrong.body.code);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('Konto ohne Passwort (Magic Link) kann sich nicht per Passwort anmelden', async () => {
    const { email } = await signUp({ name: 'Ohnepasswort' });
    const { res } = await passwordLogin(email, PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');
  });

  it('Registrierung per Passwort ist abgeschaltet', async () => {
    const email = uniqueEmail('neu');
    const res = await request(getApp())
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ email, password: PASSWORD, name: 'Neu' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const rows = await db.select().from(s.user).where(eq(s.user.email, email));
    expect(rows).toHaveLength(0);
  });
});

describe('Admin-Rechte', () => {
  it('Nicht-Admins bekommen 403, Abgemeldete 401 – auch bei den Better-Auth-Admin-Endpunkten', async () => {
    const { agent } = await signUp({ name: 'Normal' });
    expect((await agent.get(`${api}/me`).expect(200)).body.me.isAdmin).toBe(false);
    const r1 = await agent.get(`${api}/admin/reports`).expect(403);
    expect(r1.body.error.code).toBe('not_admin');
    await agent.post(`${api}/admin/reports/x/close`).expect(403);
    await agent.post(`${api}/admin/reports/x/remove-content`).expect(403);
    await request(getApp()).get(`${api}/admin/reports`).expect(401);
    const lu = await agent.get('/api/auth/admin/list-users').set('Origin', ORIGIN);
    expect(lu.status).toBe(403);
    const sr = await agent.post('/api/auth/admin/set-role').set('Origin', ORIGIN).send({ userId: 'x', role: 'admin' });
    expect(sr.status).toBe(403);
  });

  it('niemand kann sich die Admin-Rolle selbst geben oder die Sperre selbst aufheben', async () => {
    const { agent, userId } = await signUp({ name: 'Schlau' });
    await agent.post('/api/auth/update-user').set('Origin', ORIGIN).send({ role: 'admin', banned: false });
    const [u] = await db.select().from(s.user).where(eq(s.user.id, userId));
    expect(u.role).toBe('user');
    await agent.get(`${api}/admin/reports`).expect(403);
  });

  it('Anmelden als andere Person und Konto-Löschen sind abgeschaltet', async () => {
    const { agent } = await adminAgent();
    const other = await signUp({ name: 'Ziel' });
    const imp = await agent.post('/api/auth/admin/impersonate-user').set('Origin', ORIGIN).send({ userId: other.userId });
    expect(imp.status).toBe(404);
    const rm = await agent.post('/api/auth/admin/remove-user').set('Origin', ORIGIN).send({ userId: other.userId });
    expect(rm.status).toBe(404);
    const pw = await agent.post('/api/auth/admin/set-user-password').set('Origin', ORIGIN).send({ userId: other.userId, newPassword: PASSWORD });
    expect(pw.status).toBe(404);
  });

  it('Admin kann Personen auflisten, Rolle geben/nehmen, aber die eigene Rolle nicht entziehen', async () => {
    const admin = await adminAgent();
    const other = await signUp({ name: 'Helferin' });
    const list = await admin.agent
      .get('/api/auth/admin/list-users')
      .query({ searchField: 'email', searchOperator: 'contains', searchValue: other.email })
      .set('Origin', ORIGIN)
      .expect(200);
    expect(list.body.users.map((u: { id: string }) => u.id)).toEqual([other.userId]);
    // nur nötige Felder (keine Telefonnummer, kein Bild)
    expect(Object.keys(list.body.users[0]).sort()).toEqual(['banExpires', 'banReason', 'banned', 'createdAt', 'email', 'id', 'name', 'role']);
    const one = await admin.agent.get('/api/auth/admin/get-user').query({ id: other.userId }).set('Origin', ORIGIN).expect(200);
    expect(one.body).not.toHaveProperty('phoneNumber');
    expect(one.body.email).toBe(other.email);

    await admin.agent.post('/api/auth/admin/set-role').set('Origin', ORIGIN).send({ userId: other.userId, role: 'admin' }).expect(200);
    expect((await other.agent.get(`${api}/me`).expect(200)).body.me.isAdmin).toBe(true);
    await other.agent.get(`${api}/admin/reports`).expect(200);
    await admin.agent.post('/api/auth/admin/set-role').set('Origin', ORIGIN).send({ userId: other.userId, role: 'user' }).expect(200);
    await other.agent.get(`${api}/admin/reports`).expect(403);

    const self = await admin.agent.post('/api/auth/admin/set-role').set('Origin', ORIGIN).send({ userId: admin.userId, role: 'user' });
    expect(self.status).toBe(400);
    expect((await admin.agent.get(`${api}/me`).expect(200)).body.me.isAdmin).toBe(true);
    // unbekannte Rollen lehnt das Plugin ab
    const bogus = await admin.agent.post('/api/auth/admin/set-role').set('Origin', ORIGIN).send({ userId: other.userId, role: 'superuser' });
    expect(bogus.status).toBe(400);
  });
});

describe('Meldungen verwalten', () => {
  it('liefert Meldungen mit Vorschau (PersonRef, ohne E-Mail) und schließt sie idempotent', async () => {
    const admin = await adminAgent();
    const author = await signUp({ name: 'Autorin' });
    const reporter = await signUp({ name: 'Melderin' });
    const post = await author.agent.post(`${api}/posts`).send({ text: 'Ein unfreundlicher Beitrag', visibility: 'public' }).expect(201);
    await reporter.agent.post(`${api}/reports`).send({ targetType: 'post', targetId: post.body.post.id, reason: 'Beleidigend' }).expect(200);

    const open = await admin.agent.get(`${api}/admin/reports?status=open`).expect(200);
    const rep = open.body.reports.find((r: { target: { id: string } }) => r.target.id === post.body.post.id);
    expect(rep).toMatchObject({
      status: 'open',
      reason: 'Beleidigend',
      reporter: { id: reporter.userId, displayName: 'Melderin' },
      target: { type: 'post', exists: true, excerpt: 'Ein unfreundlicher Beitrag', removable: true, author: { id: author.userId, displayName: 'Autorin' } },
    });
    expect(JSON.stringify(open.body)).not.toContain('@example.org');
    expect(open.body).toHaveProperty('nextCursor');

    await admin.agent.post(`${api}/admin/reports/${rep.id}/close`).expect(200);
    await admin.agent.post(`${api}/admin/reports/${rep.id}/close`).expect(200); // doppelter Klick
    const closed = await admin.agent.get(`${api}/admin/reports?status=closed`).expect(200);
    expect(closed.body.reports.some((r: { id: string }) => r.id === rep.id)).toBe(true);
    // Inhalt bleibt beim reinen Schließen erhalten
    await author.agent.get(`${api}/feed?userId=${author.userId}`).expect(200);
    const [still] = await db.select().from(s.posts).where(eq(s.posts.id, post.body.post.id));
    expect(still).toBeTruthy();

    await admin.agent.post(`${api}/admin/reports/unbekannt/close`).expect(404);
    await admin.agent.get(`${api}/admin/reports?status=egal`).expect(400);
  });

  it('entfernt gemeldeten Beitrag samt Fotodatei, Kommentar und Foto und schließt die Meldungen', async () => {
    const admin = await adminAgent();
    const author = await signUp({ name: 'Fotografin' });
    const reporter = await signUp({ name: 'Aufmerksam' });
    const reporter2 = await signUp({ name: 'Auchda' });

    // Beitrag mit Foto
    const photo = await author.agent
      .post(`${api}/photos`)
      .field('altText', 'Weg am Fluss')
      .field('visibility', 'public')
      .attach('photo', await jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(201);
    const post = await author.agent
      .post(`${api}/posts`)
      .send({ text: 'Mit Foto', visibility: 'public', photoIds: [photo.body.photo.id] })
      .expect(201);
    const [row] = await db.select().from(s.photos).where(eq(s.photos.id, photo.body.photo.id));
    const file = resolveKey(row.storageKey);
    expect(fs.existsSync(file)).toBe(true);

    await reporter.agent.post(`${api}/reports`).send({ targetType: 'post', targetId: post.body.post.id, reason: 'Spam' }).expect(200);
    await reporter2.agent.post(`${api}/reports`).send({ targetType: 'post', targetId: post.body.post.id, reason: 'Auch Spam' }).expect(200);
    await reporter.agent.post(`${api}/reports`).send({ targetType: 'photo', targetId: photo.body.photo.id, reason: 'Foto' }).expect(200);
    const reports = (await admin.agent.get(`${api}/admin/reports?limit=100`).expect(200)).body.reports as { id: string; reason: string }[];
    const postReport = reports.find((r) => r.reason === 'Spam')!;

    const rm = await admin.agent.post(`${api}/admin/reports/${postReport.id}/remove-content`).expect(200);
    expect(rm.body).toEqual({ ok: true, removed: true });
    expect(await db.select().from(s.posts).where(eq(s.posts.id, post.body.post.id))).toHaveLength(0);
    expect(fs.existsSync(file)).toBe(false);
    // alle Meldungen zum Beitrag und zum Foto darin sind geschlossen
    const after = (await admin.agent.get(`${api}/admin/reports?limit=100`).expect(200)).body.reports as { reason: string }[];
    expect(after.some((r) => ['Spam', 'Auch Spam', 'Foto'].includes(r.reason))).toBe(false);
    // doppelter Klick: kein Fehler, nichts mehr zu löschen
    const again = await admin.agent.post(`${api}/admin/reports/${postReport.id}/remove-content`).expect(200);
    expect(again.body.removed).toBe(false);

    // Kommentar
    const post2 = await author.agent.post(`${api}/posts`).send({ text: 'Neuer Beitrag', visibility: 'public' }).expect(201);
    const comment = await reporter.agent.post(`${api}/posts/${post2.body.post.id}/comments`).send({ text: 'Gemeiner Kommentar' }).expect(201);
    await author.agent.post(`${api}/reports`).send({ targetType: 'comment', targetId: comment.body.comment.id, reason: 'Kommentar gemein' }).expect(200);
    const cRep = ((await admin.agent.get(`${api}/admin/reports`).expect(200)).body.reports as { id: string; reason: string; target: { excerpt: string } }[]).find(
      (r) => r.reason === 'Kommentar gemein',
    )!;
    expect(cRep.target.excerpt).toBe('Gemeiner Kommentar');
    await admin.agent.post(`${api}/admin/reports/${cRep.id}/remove-content`).expect(200);
    const comments = await author.agent.get(`${api}/posts/${post2.body.post.id}/comments`).expect(200);
    expect(comments.body.comments).toHaveLength(0);

    // Einzelnes Foto
    const photo2 = await author.agent
      .post(`${api}/photos`)
      .field('altText', 'Einzelfoto')
      .field('visibility', 'public')
      .attach('photo', await jpeg(), { filename: 'b.jpg', contentType: 'image/jpeg' })
      .expect(201);
    const [row2] = await db.select().from(s.photos).where(eq(s.photos.id, photo2.body.photo.id));
    await reporter.agent.post(`${api}/reports`).send({ targetType: 'photo', targetId: photo2.body.photo.id, reason: 'Einzelfoto melden' }).expect(200);
    const pRep = ((await admin.agent.get(`${api}/admin/reports`).expect(200)).body.reports as { id: string; reason: string }[]).find(
      (r) => r.reason === 'Einzelfoto melden',
    )!;
    await admin.agent.post(`${api}/admin/reports/${pRep.id}/remove-content`).expect(200);
    expect(await db.select().from(s.photos).where(eq(s.photos.id, photo2.body.photo.id))).toHaveLength(0);
    expect(fs.existsSync(resolveKey(row2.storageKey))).toBe(false);

    // Personen-Meldung: Inhalt entfernen gibt es nicht
    await reporter.agent.post(`${api}/reports`).send({ targetType: 'user', targetId: author.userId, reason: 'Person melden' }).expect(200);
    const uRep = ((await admin.agent.get(`${api}/admin/reports`).expect(200)).body.reports as { id: string; reason: string; target: { removable: boolean } }[]).find(
      (r) => r.reason === 'Person melden',
    )!;
    expect(uRep.target.removable).toBe(false);
    const bad = await admin.agent.post(`${api}/admin/reports/${uRep.id}/remove-content`).expect(400);
    expect(bad.body.error.code).toBe('content_not_removable');
  });
});

describe('Sperren', () => {
  it('beendet bestehende Sitzungen und verhindert neue Anmeldungen bis zum Entsperren', async () => {
    const admin = await adminAgent();
    const target = await signUp({ name: 'Gesperrt' });
    await target.agent.get(`${api}/me`).expect(200);

    const self = await admin.agent.post('/api/auth/admin/ban-user').set('Origin', ORIGIN).send({ userId: admin.userId });
    expect(self.status).toBe(400);

    await admin.agent
      .post('/api/auth/admin/ban-user')
      .set('Origin', ORIGIN)
      .send({ userId: target.userId, banReason: 'Beleidigungen' })
      .expect(200);
    await target.agent.get(`${api}/me`).expect(401);

    // neuer Anmelde-Link funktioniert nicht
    const fresh = request.agent(getApp());
    await fresh.post('/api/auth/sign-in/magic-link').set('Origin', ORIGIN).send({ email: target.email, callbackURL: '/' }).expect(200);
    const mail = [...sentMails].reverse().find((m) => m.to === target.email)!;
    const url = new URL(mail.text.match(/https?:\/\/\S+/)![0]);
    await fresh.get(url.pathname + url.search).set('Origin', ORIGIN);
    await fresh.get(`${api}/me`).expect(401);

    // auch eine Sitzung, die trotz Sperre noch bestünde, gilt nicht
    const [u] = await db.select().from(s.user).where(eq(s.user.id, target.userId));
    expect(u.banned).toBe(true);
    expect(u.banReason).toBe('Beleidigungen');
    expect(await db.select().from(s.session).where(eq(s.session.userId, target.userId))).toHaveLength(0);

    await admin.agent.post('/api/auth/admin/unban-user').set('Origin', ORIGIN).send({ userId: target.userId }).expect(200);
    const again = request.agent(getApp());
    await again.post('/api/auth/sign-in/magic-link').set('Origin', ORIGIN).send({ email: target.email, callbackURL: '/' }).expect(200);
    const mail2 = [...sentMails].reverse().find((m) => m.to === target.email)!;
    const url2 = new URL(mail2.text.match(/https?:\/\/\S+/)![0]);
    await again.get(url2.pathname + url2.search).set('Origin', ORIGIN);
    await again.get(`${api}/me`).expect(200);
  });

  it('gesperrtes Passwort-Konto kann sich nicht anmelden', async () => {
    const admin = await adminAgent();
    const email = uniqueEmail('zweite');
    await seedAdmins({ emails: [email], password: PASSWORD, log: () => {} });
    const [u] = await db.select().from(s.user).where(eq(s.user.email, email));
    await admin.agent.post('/api/auth/admin/ban-user').set('Origin', ORIGIN).send({ userId: u.id }).expect(200);
    const { res, agent } = await passwordLogin(email, PASSWORD);
    expect(res.status).toBe(403);
    await agent.get(`${api}/me`).expect(401);
  });
});

describe('Start-Konten (seedAdmins)', () => {
  it('ist idempotent und überschreibt kein bestehendes Passwort', async () => {
    const email = uniqueEmail('seed');
    const log: string[] = [];
    const first = await seedAdmins({ emails: [email.toUpperCase()], password: PASSWORD, log: (m) => log.push(m) });
    expect(first.created).toEqual([email]);
    const second = await seedAdmins({ emails: [email], password: 'ein-ganz-anderes-passwort', log: (m) => log.push(m) });
    expect(second).toEqual({ promoted: [], created: [], skipped: [] });

    const users = await db.select().from(s.user).where(eq(s.user.email, email));
    expect(users).toHaveLength(1);
    const accounts = await db.select().from(s.account).where(eq(s.account.userId, users[0].id));
    expect(accounts).toHaveLength(1);
    expect(accounts[0].providerId).toBe('credential');
    expect(accounts[0].password).not.toContain(PASSWORD); // nur der Hash

    expect((await passwordLogin(email, PASSWORD)).res.status).toBe(200);
    expect((await passwordLogin(email, 'ein-ganz-anderes-passwort')).res.status).toBe(401);
    expect(log.join('\n')).not.toContain(PASSWORD);
  });

  it('stuft vorhandene Konten hoch, ohne ein Passwort anzulegen', async () => {
    const person = await signUp({ name: 'Vorhanden' });
    const r = await seedAdmins({ emails: [person.email], password: PASSWORD, log: () => {} });
    expect(r.promoted).toEqual([person.email]);
    expect((await person.agent.get(`${api}/me`).expect(200)).body.me.isAdmin).toBe(true);
    expect(await db.select().from(s.account).where(eq(s.account.userId, person.userId))).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ providerId: 'credential' })]),
    );
    expect((await passwordLogin(person.email, PASSWORD)).res.status).toBe(401);
    // zweiter Lauf: nichts mehr zu tun
    expect((await seedAdmins({ emails: [person.email], password: PASSWORD, log: () => {} })).promoted).toEqual([]);
  });

  it('legt ohne Startpasswort oder mit zu kurzem Passwort in Produktion nichts an', async () => {
    const a = uniqueEmail('ohne');
    const b = uniqueEmail('kurz');
    const log: string[] = [];
    expect((await seedAdmins({ emails: [a], password: undefined, log: (m) => log.push(m) })).skipped).toEqual([a]);
    const short = await seedAdmins({ emails: [b], password: 'kurz123', production: true, log: (m) => log.push(m) });
    expect(short.skipped).toEqual([b]);
    expect(await db.select().from(s.user).where(eq(s.user.email, b))).toHaveLength(0);
    expect(log.some((m) => m.includes('kürzer als 12'))).toBe(true);
    expect(log.join('\n')).not.toContain('kurz123');
  });
});
