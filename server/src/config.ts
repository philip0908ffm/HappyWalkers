import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  /** Neon-Verbindungszeichenkette (in Produktion die „pooled“ URL mit sslmode=require) */
  DATABASE_URL: z.string().default('postgres://gehmeinsam:gehmeinsam@localhost:5432/gehmeinsam'),
  /** öffentliche Adresse der App, z. B. https://gehmeinsam.up.railway.app */
  APP_URL: z.string().url().default('http://localhost:5173'),
  /** zusätzliche erlaubte Herkünfte (kommagetrennt), z. B. für die Mobil-App */
  TRUSTED_ORIGINS: z.string().default(''),
  BETTER_AUTH_SECRET: z.string().min(16).default('dev-secret-bitte-in-produktion-aendern'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Gehmeinsam <hallo@gehmeinsam.de>'),
  /** SMS-Anbieter: 'console' (Entwicklung) oder 'none' (SMS-Anmeldung aus) */
  SMS_PROVIDER: z.enum(['console', 'none']).default('none'),
  UPLOAD_DIR: z.string().default('./uploads'),
  /** Kachel-Server der Karte */
  MAP_TILE_URL: z.string().default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  /** Premium-Zahlungsanbieter: 'dev' schaltet ohne Zahlung frei (nur Entwicklung) */
  BILLING_PROVIDER: z.enum(['dev', 'none']).default('dev'),
  /** Pfad zur gebauten Weboberfläche (Produktion) */
  WEB_DIST: z.string().default('../web/dist'),
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);

if (config.NODE_ENV === 'production' && config.BETTER_AUTH_SECRET.startsWith('dev-secret')) {
  throw new Error('BETTER_AUTH_SECRET muss in Produktion gesetzt sein.');
}

export const isProd = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';
