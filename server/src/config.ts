import { DEFAULT_APP_NAME } from '@happywalkers/shared';
import { z } from 'zod';

const schema = z.object({
  /** Projektname (überall in Texten, E-Mails, Urkunden) */
  APP_NAME: z.string().trim().min(1).max(60).default(DEFAULT_APP_NAME),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  /** Neon-Verbindungszeichenkette (in Produktion die „pooled“ URL mit sslmode=require) */
  DATABASE_URL: z.string().default('postgres://happywalkers:happywalkers@localhost:5432/happywalkers'),
  /** öffentliche Adresse der App, z. B. https://happywalkers.up.railway.app */
  APP_URL: z.string().url().default('http://localhost:5173'),
  /** zusätzliche erlaubte Herkünfte (kommagetrennt), z. B. für die Mobil-App */
  TRUSTED_ORIGINS: z.string().default(''),
  BETTER_AUTH_SECRET: z.string().min(16).default('dev-secret-bitte-in-produktion-aendern'),
  RESEND_API_KEY: z.string().optional(),
  /** Absender, Domain muss bei Resend bestätigt sein (in Produktion Pflicht) */
  EMAIL_FROM: z.string().optional(),
  /** SMS-Anbieter: 'console' (Entwicklung) oder 'none' (SMS-Anmeldung aus) */
  SMS_PROVIDER: z.enum(['console', 'none']).default('none'),
  // leer gelassen = Standardordner (auf Railway ohne Volume nur vorübergehend!)
  UPLOAD_DIR: z.string().default('./uploads').transform((v) => v.trim() || './uploads'),
  /** Kachel-Server der Karte */
  MAP_TILE_URL: z.string().default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  /** Premium-Zahlungsanbieter: 'dev' schaltet ohne Zahlung frei (nur Entwicklung) */
  BILLING_PROVIDER: z.enum(['dev', 'none']).default('dev'),
  /**
   * Start-Konten mit Admin-Rolle (kommagetrennte E-Mail-Adressen). Beim Serverstart bekommen
   * diese Konten die Rolle „admin“; vorhandene Konten werden hochgestuft.
   */
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) => [...new Set(v.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))])
    .pipe(z.array(z.string().email('ADMIN_EMAILS enthält eine ungültige E-Mail-Adresse'))),
  /**
   * Optionales Startpasswort für Konten aus ADMIN_EMAILS, die es noch nicht gibt.
   * Bestehende Passwörter werden nie überschrieben. Nach der ersten Anmeldung wieder entfernen.
   */
  ADMIN_INITIAL_PASSWORD: z
    .string()
    .optional()
    .transform((v) => (v && v.length ? v : undefined)),
  /** Pfad zur gebauten Weboberfläche (Produktion) */
  WEB_DIST: z.string().default('../web/dist'),
});

export type Config = z.infer<typeof schema>;

// Railway: ohne eigene APP_URL die öffentliche Railway-Domain verwenden
if (!process.env.APP_URL && process.env.RAILWAY_PUBLIC_DOMAIN) {
  process.env.APP_URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
}

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Verständliche Meldung im Railway-Protokoll statt eines langen Stacktraces
  const lines = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`);
  console.error(`${process.env.APP_NAME || DEFAULT_APP_NAME} kann nicht starten – ungültige Umgebungsvariablen:\n${lines.join('\n')}`);
  process.exit(1);
}
export const config: Config = parsed.data;

export const isProd = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

/**
 * Sicherheitsprüfung beim Start (Aylin Demir, docs/SICHERHEIT.md).
 * Gibt Fehlermeldungen zurück, die einen Start in Produktion verhindern.
 */
export function productionConfigErrors(c: Config): string[] {
  if (c.NODE_ENV !== 'production') return [];
  const errors: string[] = [];
  if (c.BETTER_AUTH_SECRET.startsWith('dev-secret') || c.BETTER_AUTH_SECRET.length < 32) {
    errors.push('BETTER_AUTH_SECRET muss in Produktion gesetzt sein (mindestens 32 zufällige Zeichen).');
  }
  // Ohne Resend landen Anmelde-Links nur im Server-Protokoll – wer das Protokoll lesen kann, könnte sich anmelden.
  if (!c.RESEND_API_KEY) errors.push('RESEND_API_KEY muss in Produktion gesetzt sein (sonst stehen Anmelde-Links im Protokoll).');
  // 'console' schreibt SMS-Codes ins Protokoll – nur für die Entwicklung.
  if (c.SMS_PROVIDER === 'console') errors.push("SMS_PROVIDER 'console' ist in Produktion nicht erlaubt (Codes im Protokoll).");
  if (!c.APP_URL.startsWith('https://')) errors.push('APP_URL muss in Produktion mit https:// beginnen.');
  // Ohne eigenen Absender lehnt Resend den Versand ab → niemand bekäme einen Anmelde-Link.
  if (!c.EMAIL_FROM?.trim()) errors.push(`EMAIL_FROM muss in Produktion gesetzt sein, z. B. "${c.APP_NAME} <hallo@ihre-domain.de>" (Domain bei Resend bestätigt).`);
  return errors;
}

const startErrors = productionConfigErrors(config);
if (startErrors.length) {
  console.error(
    `${config.APP_NAME} kann in Produktion nicht starten. Bitte diese Variablen in Railway setzen (siehe docs/DEPLOY-RAILWAY.md):\n- ${startErrors.join('\n- ')}`,
  );
  process.exit(1);
}

// Entscheidung Lena (S-11): in Produktion niemals Premium ohne Zahlung.
// Ohne ausdrückliche Angabe gilt dort 'none'; 'dev' verhindert den Start.
if (isProd) {
  if (process.env.BILLING_PROVIDER === undefined) config.BILLING_PROVIDER = 'none';
  if (config.BILLING_PROVIDER === 'dev') {
    throw new Error("BILLING_PROVIDER 'dev' ist in Produktion nicht erlaubt (Premium ohne Zahlung). Bitte 'none' setzen oder einen Zahlungsanbieter anbinden.");
  }
}
