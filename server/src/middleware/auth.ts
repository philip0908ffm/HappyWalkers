import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';
import { auth } from '../auth.js';
import { hasAdminRole } from '../auth.js';
import { forbidden, unauthorized } from '../lib/http.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Liest die Sitzung (Cookie oder Bearer-Token) und hängt `req.user` an – ohne Pflicht. */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const s = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    // Gesperrte Personen gelten als abgemeldet (Sperren löscht die Sitzungen ohnehin; doppelt hält besser).
    const banned = !!s?.user.banned && (!s.user.banExpires || new Date(s.user.banExpires).getTime() > Date.now());
    if (s?.user && !banned) req.user = { id: s.user.id, email: s.user.email, name: s.user.name, isAdmin: hasAdminRole(s.user.role) };
    next();
  } catch (err) {
    next(err);
  }
}

/** Erzwingt Anmeldung. */
export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

/** Erzwingt Anmeldung mit Admin-Rolle (Rolle aus der Sitzung). Nicht angemeldet → 401, sonst 403. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!req.user.isAdmin) return next(forbidden('not_admin'));
  next();
}

/** Typsicherer Zugriff auf den angemeldeten Benutzer in Routen hinter requireUser. */
export function me(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
