import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { admin } from 'better-auth/plugins/admin';
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/admin/access';
import { bearer } from 'better-auth/plugins/bearer';
import { magicLink } from 'better-auth/plugins/magic-link';
import { phoneNumber } from 'better-auth/plugins/phone-number';
import { eq } from 'drizzle-orm';
import { config, isProd, isTest } from './config.js';
import { db } from './db/index.js';
import * as schema from './db/schema.js';
import { sendMail, textToHtml } from './lib/email.js';
import { sendSmsCode } from './lib/sms.js';

const DAY = 60 * 60 * 24;

/** Mindestlänge für Passwörter (Anmeldung „Mit Passwort“ und Start-Konten). */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Rollen für das Admin-Plugin. Admins dürfen nur das, was die Verwaltungsseite braucht:
 * Personen auflisten/ansehen, sperren/entsperren, Rolle ändern, Sitzungen beenden.
 * Bewusst NICHT: als andere Person anmelden (impersonate), Konten anlegen/löschen, Passwörter setzen.
 */
const ac = createAccessControl(defaultStatements);
export const adminRoles = {
  admin: ac.newRole({ user: ['list', 'get', 'ban', 'set-role'], session: ['list', 'revoke'] }),
  user: ac.newRole({ user: [], session: [] }),
};

/** Rolle(n) aus Better Auth („admin“ oder „user“, ggf. kommagetrennt) → Admin? */
export function hasAdminRole(role: string | null | undefined): boolean {
  return !!role && role.split(',').some((r) => r.trim() === 'admin');
}

/** Felder, die die Personenverwaltung braucht (Datensparsamkeit: keine Telefonnummer, kein Profilbild). */
const ADMIN_USER_FIELDS = ['id', 'name', 'email', 'role', 'banned', 'banReason', 'banExpires', 'createdAt'] as const;
const ADMIN_USER_PATHS = new Set(['/admin/list-users', '/admin/get-user', '/admin/ban-user', '/admin/unban-user', '/admin/set-role']);

function pickAdminUserFields(u: unknown): Record<string, unknown> | null {
  if (!u || typeof u !== 'object') return null;
  const src = u as Record<string, unknown>;
  const out = Object.fromEntries(ADMIN_USER_FIELDS.filter((k) => k in src).map((k) => [k, src[k]]));
  // Platzhalter-Adressen von SMS-Konten enthalten die Telefonnummer → nicht ausliefern
  if (typeof out.email === 'string' && out.email.endsWith('.invalid')) out.email = null;
  return out;
}

/** Admin-Endpunkte, die die Plattform nicht anbietet (zusätzlich zu den fehlenden Rechten). */
const DISABLED_ADMIN_PATHS = [
  '/admin/impersonate-user',
  '/admin/stop-impersonating',
  '/admin/create-user',
  '/admin/update-user',
  '/admin/remove-user',
  '/admin/set-user-password',
];

async function anredeFor(email: string): Promise<'sie' | 'du'> {
  const rows = await db
    .select({ anrede: schema.profile.anrede })
    .from(schema.user)
    .innerJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
    .where(eq(schema.user.email, email))
    .limit(1);
  return rows[0]?.anrede === 'du' ? 'du' : 'sie';
}

/**
 * Anmeldung:
 *  - Magic Link per E-Mail (Resend), 20 Minuten gültig – einziger Weg, ein Konto anzulegen
 *  - SMS-Code (falls ein SMS-Anbieter eingerichtet ist)
 *  - E-Mail + Passwort nur für Konten, die bereits ein Passwort haben (z. B. Start-Konten aus
 *    ADMIN_EMAILS). Registrierung per Passwort ist aus – niemand muss ein Passwort haben.
 * Rollen über das Admin-Plugin („user“/„admin“); gesperrte Personen können sich nicht anmelden.
 * „Angemeldet bleiben auf dem eigenen Gerät“: Sitzung 90 Tage, verlängert sich bei Nutzung.
 * `bearer()` erlaubt der späteren Mobil-App Anfragen mit `Authorization: Bearer <token>`.
 */
export const auth = betterAuth({
  appName: config.APP_NAME,
  baseURL: config.APP_URL,
  basePath: '/api/auth',
  secret: config.BETTER_AUTH_SECRET,
  trustedOrigins: [config.APP_URL, ...config.TRUSTED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: 128,
  },
  disabledPaths: DISABLED_ADMIN_PATHS,
  session: {
    expiresIn: 90 * DAY,
    updateAge: DAY,
  },
  rateLimit: {
    enabled: !isTest,
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/magic-link': { window: 60 * 10, max: 5 },
      '/sign-in/email': { window: 60 * 10, max: 5 },
      '/phone-number/send-otp': { window: 60 * 10, max: 3 },
      '/phone-number/verify': { window: 60 * 10, max: 10 },
    },
  },
  advanced: {
    useSecureCookies: isProd,
    // Better Auth schaltet Origin-/CSRF-Prüfung unter NODE_ENV=test sonst ab. Ausdrücklich an lassen,
    // damit Tests und End-to-End-Tests dieselben Schutzregeln prüfen wie die Produktion.
    disableOriginCheck: false,
    database: { generateId: () => crypto.randomUUID() },
    // Die Client-IP setzt app.ts aus req.ip (trust proxy) – ein vom Browser mitgeschickter
    // X-Forwarded-For-Kopf kann die Ratenbegrenzung so nicht umgehen.
    ipAddress: { ipAddressHeaders: ['x-happywalkers-client-ip'] },
  },
  hooks: {
    // Die eigene Admin-Rolle kann man sich nicht selbst entziehen (sonst gäbe es womöglich niemanden mehr).
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/admin/set-role') return;
      const session = await getSessionFromCtx(ctx);
      const body = ctx.body as { userId?: unknown; role?: unknown } | undefined;
      const roles = Array.isArray(body?.role) ? body.role.join(',') : String(body?.role ?? '');
      if (session && String(body?.userId ?? '') === session.user.id && !hasAdminRole(roles)) {
        throw new APIError('BAD_REQUEST', { code: 'CANNOT_REMOVE_OWN_ADMIN_ROLE', message: 'cannot_remove_own_admin_role' });
      }
    }),
    // Personenverwaltung: nur die nötigen Felder ausliefern
    after: createAuthMiddleware(async (ctx) => {
      if (!ADMIN_USER_PATHS.has(ctx.path)) return;
      const returned = ctx.context.returned;
      if (!returned || returned instanceof Response || returned instanceof Error || typeof returned !== 'object') return;
      const body = returned as Record<string, unknown>;
      if (Array.isArray(body.users)) return ctx.json({ ...body, users: body.users.map(pickAdminUserFields) });
      if (body.user) return ctx.json({ ...body, user: pickAdminUserFields(body.user) });
      if (ctx.path === '/admin/get-user') return ctx.json(pickAdminUserFields(body));
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (u) => {
          await db.insert(schema.profile).values({ userId: u.id, displayName: '' }).onConflictDoNothing();
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 20,
      // In der Datenbank nur den Hash speichern: ein Datenbank-Auszug enthält keine gültigen Anmelde-Links.
      storeToken: 'hashed',
      sendMagicLink: async ({ email, url }) => {
        const du = (await anredeFor(email)) === 'du';
        const text = du
          ? `Hallo,\n\nklicke auf den Knopf, um dich bei ${config.APP_NAME} anzumelden. Der Link ist 20 Minuten gültig und funktioniert nur einmal.\n\nDu hast keine Anmeldung angefordert? Dann kannst du diese E-Mail einfach löschen.`
          : `Guten Tag,\n\nklicken Sie auf den Knopf, um sich bei ${config.APP_NAME} anzumelden. Der Link ist 20 Minuten gültig und funktioniert nur einmal.\n\nSie haben keine Anmeldung angefordert? Dann können Sie diese E-Mail einfach löschen.`;
        await sendMail({
          to: email,
          subject: `Ihr Anmelde-Link für ${config.APP_NAME}`,
          text: `${text}\n\nAnmelde-Link: ${url}`,
          html: textToHtml(text, { label: du ? 'Jetzt anmelden' : 'Jetzt anmelden', url }),
        });
      },
    }),
    phoneNumber({
      otpLength: 6,
      expiresIn: 60 * 10,
      allowedAttempts: 5,
      phoneNumberValidator: (n) => /^\+[1-9]\d{7,14}$/.test(n),
      sendOTP: async ({ phoneNumber: n, code }) => {
        await sendSmsCode(n, code);
      },
      signUpOnVerification: {
        // Platzhalter-Adresse; kann später in den Einstellungen durch eine echte ersetzt werden
        getTempEmail: (n) => `${n.replace(/\D/g, '')}@telefon.happywalkers.invalid`,
        getTempName: () => '',
      },
    }),
    admin({
      defaultRole: 'user',
      adminRoles: ['admin'],
      ac,
      roles: adminRoles,
      bannedUserMessage: 'banned',
    }),
    // Nur signierte Tokens annehmen: ein roher Sitzungs-Token aus einem Datenbank-Auszug reicht nicht.
    bearer({ requireSignature: true }),
  ],
});

export type Session = typeof auth.$Infer.Session;
