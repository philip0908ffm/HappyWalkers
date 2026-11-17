/**
 * Sicherheitsprüfung des Grundgerüsts (Aylin Demir) – siehe docs/SICHERHEIT.md.
 * Jeder Test gehört zu einem Befund (S-xx) in docs/SICHERHEIT.md.
 */
import { and, eq } from 'drizzle-orm';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import sharp from 'sharp';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { testMailboxAllowed } from '../src/app.js';
import { config, productionConfigErrors, type Config } from '../src/config.js';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { sentMails } from '../src/lib/email.js';
import { errorHandler } from '../src/lib/http.js';
import { resolveKey, storeImage } from '../src/services/storage.js';
import { getApp, signUp } from './helpers.js';

const APP = 'http://localhost:5173';

/** Anmeldung per Magic Link, liefert Antwort der Link-Bestätigung (für Kopfzeilen). */
async function magicLogin(extraHeaders: Record<string, string> = {}) {
  const email = `sec${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.org`;
  const agent = request.agent(getApp());
  let req = agent.post('/api/auth/sign-in/magic-link').set('Origin', APP);
  for (const [k, v] of Object.entries(extraHeaders)) req = req.set(k, v);
  await req.send({ email, callbackURL: '/' }).expect(200);
  const mail = [...sentMails].reverse().find((m) => m.to === email)!;
  const url = new URL(mail.text.match(/https?:\/\/\S+/)![0]);
  let verify = agent.get(url.pathname + url.search).set('Origin', APP);
  for (const [k, v] of Object.entries(extraHeaders)) verify = verify.set(k, v);
  const res = await verify;
  const [u] = await db.select().from(s.user).where(eq(s.user.email, email));
  return { agent, res, token: url.searchParams.get('token')!, userId: u.id, email };
}

describe('S-01 Sicherheits-Header', () => {
  it('setzt CSP, Permissions-Policy, no-store und verrät keine Server-Software', async () => {
    const res = await request(getApp()).get('/api/v1/health').expect(200);
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).toMatch(/img-src [^;]*https:\/\/tile\.openstreetmap\.org/);
    expect(res.headers['permissions-policy']).toContain('camera=()');
    expect(res.headers['permissions-policy']).toContain('geolocation=(self)');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('S-02 Schutz vor Cross-Site-Anfragen (CSRF) auf /api/v1', () => {
  it('lehnt schreibende Anfragen von fremden Seiten ab, erlaubt die eigene Herkunft und die Mobil-App', async () => {
    const { agent } = await signUp();
    const evil = await agent.patch('/api/v1/me/settings').set('Origin', 'https://evil.example').send({ fontScale: 'gross' });
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe('forbidden');

    const crossSite = await agent.patch('/api/v1/me/settings').set('Sec-Fetch-Site', 'cross-site').send({ fontScale: 'gross' });
    expect(crossSite.status).toBe(403);

    // eigene Herkunft
    await agent.patch('/api/v1/me/settings').set('Origin', APP).send({ fontScale: 'gross' }).expect(200);
    // ohne Origin (Mobil-App, Werkzeuge)
    await agent.patch('/api/v1/me/settings').send({ fontScale: 'normal' }).expect(200);
    // lesende Anfragen sind nicht betroffen
    await agent.get('/api/v1/me').set('Origin', 'https://evil.example').expect(200);
  });

  it('löscht das Konto nicht auf Anfrage einer fremden Seite', async () => {
    const { agent } = await signUp();
    await agent.delete('/api/v1/me').set('Origin', 'https://evil.example').send({ confirm: 'LÖSCHEN' }).expect(403);
    await agent.get('/api/v1/me').expect(200);
  });
});

describe('S-03 Test-Postfach nur in Tests auf localhost', () => {
  it('ist in diesen API-Tests nicht erreichbar (E2E_MAILBOX fehlt)', async () => {
    await request(getApp()).get('/api/test/mailbox?to=a@example.org').expect(404);
  });

  it('verlangt NODE_ENV=test, E2E_MAILBOX=1 und localhost gleichzeitig', () => {
    const on = { E2E_MAILBOX: '1' };
    expect(testMailboxAllowed({ NODE_ENV: 'test', APP_URL: 'http://localhost:5174' }, on)).toBe(true);
    expect(testMailboxAllowed({ NODE_ENV: 'test', APP_URL: 'http://127.0.0.1:5174' }, on)).toBe(true);
    expect(testMailboxAllowed({ NODE_ENV: 'production', APP_URL: 'http://localhost:5174' }, on)).toBe(false);
    expect(testMailboxAllowed({ NODE_ENV: 'development', APP_URL: 'http://localhost:5174' }, on)).toBe(false);
    expect(testMailboxAllowed({ NODE_ENV: 'test', APP_URL: 'https://gehmeinsam.up.railway.app' }, on)).toBe(false);
    expect(testMailboxAllowed({ NODE_ENV: 'test', APP_URL: 'http://localhost.evil.example' }, on)).toBe(false);
    expect(testMailboxAllowed({ NODE_ENV: 'test', APP_URL: 'http://localhost:5174' }, {})).toBe(false);
    expect(testMailboxAllowed({ NODE_ENV: 'test', APP_URL: 'http://localhost:5174' }, { E2E_MAILBOX: 'true' })).toBe(false);
  });
});

describe('S-04 Start in Produktion nur mit sicherer Konfiguration', () => {
  const base: Config = { ...config, NODE_ENV: 'production' };

  it('verweigert Standard-Geheimnis, fehlendes Resend, SMS im Protokoll und http', () => {
    const errors = productionConfigErrors({
      ...base,
      BETTER_AUTH_SECRET: 'dev-secret-bitte-in-produktion-aendern',
      RESEND_API_KEY: undefined,
      SMS_PROVIDER: 'console',
      APP_URL: 'http://gehmeinsam.example',
      EMAIL_FROM: undefined,
    });
    expect(errors).toHaveLength(5);
  });

  it('akzeptiert eine vollständige Produktions-Konfiguration', () => {
    expect(
      productionConfigErrors({
        ...base,
        BETTER_AUTH_SECRET: 'x'.repeat(44),
        RESEND_API_KEY: 're_123',
        SMS_PROVIDER: 'none',
        APP_URL: 'https://gehmeinsam.example',
        EMAIL_FROM: 'Gehmeinsam <hallo@gehmeinsam.example>',
      }),
    ).toEqual([]);
  });

  it('prüft nichts außerhalb der Produktion', () => {
    expect(productionConfigErrors({ ...config, NODE_ENV: 'development' })).toEqual([]);
  });
});

describe('S-05 Anmeldung: Tokens, Bearer, Client-IP', () => {
  it('speichert Magic-Link-Tokens nur als Hash', async () => {
    const email = `hash${Date.now()}@example.org`;
    await request(getApp()).post('/api/auth/sign-in/magic-link').set('Origin', APP).send({ email, callbackURL: '/' }).expect(200);
    const mail = [...sentMails].reverse().find((m) => m.to === email)!;
    const token = new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;
    expect(token.length).toBeGreaterThan(20);
    const rows = await db.select().from(s.verification).where(eq(s.verification.identifier, token));
    expect(rows).toHaveLength(0);
  });

  it('nimmt Bearer-Tokens nur signiert an (roher Token aus der Datenbank reicht nicht)', async () => {
    const { res, userId } = await magicLogin();
    const signed = res.headers['set-auth-token'] as string;
    expect(signed).toContain('.');
    const [sess] = await db.select().from(s.session).where(eq(s.session.userId, userId));
    await request(getApp()).get('/api/v1/me').set('Authorization', `Bearer ${sess.token}`).expect(401);
    const ok = await request(getApp()).get('/api/v1/me').set('Authorization', `Bearer ${signed}`).expect(200);
    expect(ok.body.me.id).toBe(userId);
  });

  it('verweigert Weiterleitungen nach dem Anmelde-Link auf fremde Seiten', async () => {
    for (const callbackURL of ['https://evil.example/', '//evil.example', '/\\evil.example']) {
      const res = await request(getApp())
        .post('/api/auth/sign-in/magic-link')
        .set('Origin', APP)
        .send({ email: `cb${Date.now()}@example.org`, callbackURL });
      expect(res.status).toBe(403);
    }
  });

  it('prüft die Herkunft auch bei Better-Auth-Aufrufen mit Cookie (auch unter NODE_ENV=test)', async () => {
    const { agent } = await signUp();
    await agent.post('/api/auth/revoke-sessions').set('Origin', 'https://evil.example').send({}).expect(403);
    await agent.get('/api/v1/me').expect(200);
  });

  it('nutzt für die Client-IP die Angabe des Proxys, nicht selbst gesetzte Kopfzeilen', async () => {
    // Railway hängt die echte Adresse rechts an X-Forwarded-For an; links steht, was der Browser schickt.
    const { userId } = await magicLogin({
      'X-Forwarded-For': '203.0.113.66, 198.51.100.7',
      'X-Gehmeinsam-Client-IP': '203.0.113.99',
    });
    const [sess] = await db.select().from(s.session).where(eq(s.session.userId, userId));
    expect(sess.ipAddress).toBe('198.51.100.7');
  });

  it('setzt das Sitzungs-Cookie httpOnly und SameSite=Lax', async () => {
    const { res } = await magicLogin();
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const session = cookies.find((c) => c.includes('session_token'))!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
  });
});

describe('S-06 Fehlermeldungen ohne interne Details', () => {
  const mini = (err: unknown) => {
    const app = express();
    app.get('/x', () => {
      throw err;
    });
    app.use(errorHandler);
    return app;
  };

  it('zeigt bei Serverfehlern nur einen Code', async () => {
    const res = await request(mini(new Error('relation "user" does not exist at /srv/app'))).get('/x').expect(500);
    expect(res.body).toEqual({ error: { code: 'server_error' } });
  });

  it('behandelt Upload- und Client-Fehler als 4xx', async () => {
    const multerErr = Object.assign(new Error('Unexpected field'), { name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE' });
    expect((await request(mini(multerErr)).get('/x')).status).toBe(400);
    const charset = Object.assign(new Error('unsupported charset "UTF-7"'), { status: 415, type: 'charset.unsupported' });
    const res = await request(mini(charset)).get('/x');
    expect(res.status).toBe(415);
    expect(JSON.stringify(res.body)).not.toContain('UTF-7');
  });

  it('antwortet auf kaputtes JSON mit invalid_input', async () => {
    const { agent } = await signUp();
    const res = await agent.patch('/api/v1/me/settings').set('Content-Type', 'application/json').send('{"x":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
  });
});

/** PNG mit beliebigen Abmessungen im Kopf, aber winzigem Inhalt („Bildbombe“). */
function pngBomb(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 0; // Graustufen
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.alloc(1024))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('S-07 Bildspeicher', () => {
  it('entfernt EXIF/GPS-Daten durch Neu-Kodierung', async () => {
    const input = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#88aa66' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'Geheim', Artist: 'Erika Musterfrau' } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const stored = await storeImage(input, { folder: 'sec-test' });
    const out = fs.readFileSync(resolveKey(stored.key));
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(out.includes(Buffer.from('Erika'))).toBe(false);
  });

  it('lehnt Bildbomben, SVG, Text und abgeschnittene Dateien als invalid_image ab', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    const jpeg = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const cases = [pngBomb(20_000, 20_000), svg, Buffer.from('Hallo'), Buffer.alloc(0), jpeg.subarray(0, 300)];
    for (const buf of cases) {
      await expect(storeImage(buf)).rejects.toMatchObject({ status: 400, code: 'invalid_image' });
    }
  });

  it('verhindert Pfad-Ausbrüche aus dem Upload-Ordner', () => {
    for (const key of ['../../etc/passwd', '/etc/passwd', '', 'photos/../../x.jpg']) {
      expect(() => resolveKey(key)).toThrow();
    }
    expect(resolveKey('photos/a.jpg')).toBe(path.join(path.resolve(config.UPLOAD_DIR), 'photos/a.jpg'));
  });
});

describe('S-08 Datenexport und Kontolöschung', () => {
  async function makeGroup(founderId: string, extra: Partial<typeof s.groups.$inferInsert> = {}) {
    const [g] = await db
      .insert(s.groups)
      .values({
        name: 'Testgruppe',
        postalCode: '34117',
        city: 'Kassel',
        lat: 51.3,
        lon: 9.5,
        inviteCode: `SEC-${crypto.randomUUID().slice(0, 8)}`,
        createdBy: founderId,
        ...extra,
      })
      .returning();
    await db.insert(s.groupMembers).values({ groupId: g.id, userId: founderId, role: 'founder', status: 'active' });
    return g;
  }

  it('exportiert auch Anmeldungen, Benachrichtigungen und Einladungen – ohne Sitzungs-Token', async () => {
    const { agent, userId, email } = await signUp();
    const g = await makeGroup(userId);
    await db.insert(s.groupInvites).values({ groupId: g.id, token: crypto.randomUUID(), email: 'freundin@example.org', createdBy: userId, expiresAt: new Date(Date.now() + 86400000) });
    await db.insert(s.notifications).values({ userId, type: 'badge', data: { key: 'first_walk' } });
    const res = await agent.get('/api/v1/me/export').expect(200);
    const data = JSON.parse(res.text);
    expect(data.konto.email).toBe(email);
    expect(data.benachrichtigungen).toHaveLength(1);
    expect(data.einladungen[0].email).toBe('freundin@example.org');
    expect(data.gegruendeteGruppen[0].id).toBe(g.id);
    expect(data.anmeldungen.length).toBeGreaterThan(0);
    const [sess] = await db.select().from(s.session).where(eq(s.session.userId, userId));
    expect(res.text).not.toContain(sess.token);
  });

  it('löscht Konto, Sitzungen, Profilbild, eigene Fotos und Bilder aufgelöster Gruppen; übergibt Gruppen mit Mitgliedern', async () => {
    const a = await signUp({ name: 'Anna' });
    const b = await signUp({ name: 'Berta' });
    const img = () => sharp({ create: { width: 20, height: 20, channels: 3, background: '#123456' } }).png().toBuffer();

    const avatar = await storeImage(await img(), { folder: 'avatars' });
    await db.update(s.profile).set({ avatarPath: avatar.key }).where(eq(s.profile.userId, a.userId));
    const own = await storeImage(await img());
    await db.insert(s.photos).values({ ownerId: a.userId, storageKey: own.key });

    // Gruppe nur mit Anna → wird aufgelöst, inkl. Gruppenbild
    const groupPhoto = await storeImage(await img(), { folder: 'groups' });
    const lonely = await makeGroup(a.userId, { photoPath: groupPhoto.key });
    // Gruppe mit Berta → geht an Berta
    const shared = await makeGroup(a.userId);
    await db.insert(s.groupMembers).values({ groupId: shared.id, userId: b.userId, role: 'member', status: 'active' });
    // Einladung an Annas Adresse aus einer fremden Gruppe → enthält ihre E-Mail, wird gelöscht
    const other = await makeGroup(b.userId);
    await db.insert(s.groupInvites).values({ groupId: other.id, token: crypto.randomUUID(), email: a.email, createdBy: b.userId, expiresAt: new Date(Date.now() + 86400000) });

    await a.agent.delete('/api/v1/me').send({ confirm: 'LÖSCHEN' }).expect(200);

    expect(await db.select().from(s.user).where(eq(s.user.id, a.userId))).toHaveLength(0);
    expect(await db.select().from(s.session).where(eq(s.session.userId, a.userId))).toHaveLength(0);
    expect(await db.select().from(s.groups).where(eq(s.groups.id, lonely.id))).toHaveLength(0);
    expect(await db.select().from(s.groupInvites).where(eq(s.groupInvites.email, a.email))).toHaveLength(0);
    for (const key of [avatar.key, own.key, groupPhoto.key]) expect(fs.existsSync(resolveKey(key))).toBe(false);

    const [heir] = await db
      .select()
      .from(s.groupMembers)
      .where(and(eq(s.groupMembers.groupId, shared.id), eq(s.groupMembers.userId, b.userId)));
    expect(heir.role).toBe('founder');
    await a.agent.get('/api/v1/me').expect(401);
  });
});
