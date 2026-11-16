import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
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
 * Anmeldung ohne Passwort:
 *  - Magic Link per E-Mail (Resend), 20 Minuten gültig
 *  - SMS-Code (falls ein SMS-Anbieter eingerichtet ist)
 * „Angemeldet bleiben auf dem eigenen Gerät“: Sitzung 90 Tage, verlängert sich bei Nutzung.
 * `bearer()` erlaubt der späteren Mobil-App Anfragen mit `Authorization: Bearer <token>`.
 */
export const auth = betterAuth({
  appName: 'Gehmeinsam',
  baseURL: config.APP_URL,
  basePath: '/api/auth',
  secret: config.BETTER_AUTH_SECRET,
  trustedOrigins: [config.APP_URL, ...config.TRUSTED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: { enabled: false },
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
    ipAddress: { ipAddressHeaders: ['x-gehmeinsam-client-ip'] },
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
          ? `Hallo,\n\nklicke auf den Knopf, um dich bei Gehmeinsam anzumelden. Der Link ist 20 Minuten gültig und funktioniert nur einmal.\n\nDu hast keine Anmeldung angefordert? Dann kannst du diese E-Mail einfach löschen.`
          : `Guten Tag,\n\nklicken Sie auf den Knopf, um sich bei Gehmeinsam anzumelden. Der Link ist 20 Minuten gültig und funktioniert nur einmal.\n\nSie haben keine Anmeldung angefordert? Dann können Sie diese E-Mail einfach löschen.`;
        await sendMail({
          to: email,
          subject: 'Ihr Anmelde-Link für Gehmeinsam',
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
        getTempEmail: (n) => `${n.replace(/\D/g, '')}@telefon.gehmeinsam.invalid`,
        getTempName: () => '',
      },
    }),
    // Nur signierte Tokens annehmen: ein roher Sitzungs-Token aus einem Datenbank-Auszug reicht nicht.
    bearer({ requireSignature: true }),
  ],
});

export type Session = typeof auth.$Infer.Session;
