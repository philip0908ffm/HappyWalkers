import { eq } from 'drizzle-orm';
import { auth, hasAdminRole, MIN_PASSWORD_LENGTH } from '../auth.js';
import { config, isProd } from '../config.js';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';

export interface SeedAdminsResult {
  promoted: string[];
  created: string[];
  /** Adressen ohne Konto, für die kein (gültiges) Startpasswort vorlag */
  skipped: string[];
}

/** Anzeigename aus der E-Mail-Adresse: Teil vor dem @, erster Buchstabe groß. */
export function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  return (local.charAt(0).toUpperCase() + local.slice(1)).slice(0, 40);
}

/**
 * Start-Konten aus Umgebungsvariablen (beim Serverstart, nach den Migrationen; idempotent).
 * - ADMIN_EMAILS: diese Konten bekommen die Rolle „admin“ (vorhandene werden hochgestuft).
 * - ADMIN_INITIAL_PASSWORD: fehlende Konten werden mit diesem Passwort angelegt
 *   (Hashing und Konto über Better Auth). Bestehende Passwörter werden NIE überschrieben.
 * Das Passwort wird nie protokolliert.
 */
export async function seedAdmins(
  opts: { emails?: string[]; password?: string; production?: boolean; log?: (msg: string) => void } = {},
): Promise<SeedAdminsResult> {
  const emails = [...new Set((opts.emails ?? config.ADMIN_EMAILS).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const production = opts.production ?? isProd;
  const log = opts.log ?? ((msg: string) => console.warn(msg));
  const result: SeedAdminsResult = { promoted: [], created: [], skipped: [] };
  if (!emails.length) return result;

  let password = opts.password ?? config.ADMIN_INITIAL_PASSWORD;
  if (password !== undefined && password.length < MIN_PASSWORD_LENGTH) {
    if (production) {
      log(`ADMIN_INITIAL_PASSWORD ist kürzer als ${MIN_PASSWORD_LENGTH} Zeichen – es werden keine Start-Konten angelegt.`);
      password = undefined;
    } else {
      log(`Hinweis: ADMIN_INITIAL_PASSWORD ist kürzer als ${MIN_PASSWORD_LENGTH} Zeichen (in Produktion nicht erlaubt).`);
    }
  }

  const ctx = await auth.$context;
  for (const email of emails) {
    const found = await ctx.internalAdapter.findUserByEmail(email);
    if (found) {
      const role = (found.user as { role?: string | null }).role;
      if (!hasAdminRole(role)) {
        await db.update(s.user).set({ role: 'admin', updatedAt: new Date() }).where(eq(s.user.id, found.user.id));
        result.promoted.push(email);
      }
      continue;
    }
    if (!password) {
      result.skipped.push(email);
      continue;
    }
    const name = displayNameFromEmail(email);
    try {
      // Hash vorab berechnen (Better Auths eigenes Verfahren), damit kein Konto ohne Passwort entsteht
      const hash = await ctx.password.hash(password);
      const created = await ctx.internalAdapter.createUser({ email, name, emailVerified: true, role: 'admin' }, { method: 'admin' });
      await ctx.internalAdapter.linkAccount({ userId: created.id, providerId: 'credential', accountId: created.id, password: hash });
      await db
        .insert(s.profile)
        .values({ userId: created.id, displayName: name, onboardedAt: new Date() })
        .onConflictDoUpdate({ target: s.profile.userId, set: { displayName: name, onboardedAt: new Date() } });
      result.created.push(email);
    } catch (err) {
      // z. B. ein zweiter Server-Start legt dasselbe Konto gleichzeitig an (eindeutige E-Mail)
      log(`Start-Konto ${email} konnte nicht angelegt werden: ${(err as Error)?.message ?? 'unbekannter Fehler'}`);
      result.skipped.push(email);
    }
  }
  if (result.promoted.length || result.created.length) {
    console.log(`Admin-Konten: ${result.created.length} angelegt, ${result.promoted.length} hochgestuft.`);
  }
  if (result.skipped.length) {
    log(`Admin-Konten ohne Konto und ohne gültiges Startpasswort übersprungen: ${result.skipped.length}.`);
  }
  return result;
}
