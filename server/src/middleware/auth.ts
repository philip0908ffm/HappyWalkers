import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';
import { auth } from '../auth.js';
import { unauthorized } from '../lib/http.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
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
    if (s?.user) req.user = { id: s.user.id, email: s.user.email, name: s.user.name };
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

/** Typsicherer Zugriff auf den angemeldeten Benutzer in Routen hinter requireUser. */
export function me(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
