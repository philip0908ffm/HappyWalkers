import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { isTest } from '../config.js';
import { tooManyRequests } from './http.js';

/**
 * Strengere Ratenbegrenzung für erratbare Einladungscodes (`WALK-XXXXXX`, 32^6 Möglichkeiten):
 * `GET /invites/:code`, `POST /invites/:code/accept`, `POST /groups/join-by-code`.
 * Gemeinsamer Zähler je IP (zusätzlich zur allgemeinen Grenze 300/min auf /api/v1).
 * Im Testmodus aus (wie die übrigen Ratenbegrenzungen in app.ts).
 */
export const CODE_LOOKUP_LIMIT = { windowMs: 15 * 60_000, limit: 30 };

export function createCodeLookupLimiter(opts = CODE_LOOKUP_LIMIT) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req: Request, _res: Response, next: NextFunction) => next(tooManyRequests()),
  });
}

const passThrough = (_req: Request, _res: Response, next: NextFunction) => next();

export const codeLookupLimiter = isTest ? passThrough : createCodeLookupLimiter();
