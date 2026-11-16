import type { NextFunction, Request, Response } from 'express';
import { z, ZodError, type ZodType } from 'zod';

/**
 * Fachlicher Fehler mit stabilem Code (für Oberfläche und Mobil-App).
 * Die Oberfläche übersetzt `code` in einen verständlichen Satz (i18n: errors.<code>).
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code = 'invalid_input', details?: unknown) => new ApiError(400, code, undefined, details);
export const unauthorized = () => new ApiError(401, 'not_signed_in');
export const forbidden = (code = 'forbidden') => new ApiError(403, code);
export const notFound = (code = 'not_found') => new ApiError(404, code);
export const conflict = (code = 'conflict') => new ApiError(409, code);
export const paymentRequired = () => new ApiError(402, 'premium_required');

/** Validiert Body/Query/Params mit zod und gibt die geprüften Daten zurück. */
export function parse<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(
      400,
      'invalid_input',
      undefined,
      result.error.issues.map((i) => ({ field: i.path.join('.'), code: i.code, message: i.message })),
    );
  }
  return result.data;
}

/** Fehlerbehandlung: einheitliches JSON `{ error: { code, details? } }`, keine internen Details. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'invalid_input' } });
    return;
  }
  const anyErr = err as { type?: string; status?: number; code?: string };
  if (anyErr?.type === 'entity.too.large' || anyErr?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { code: 'file_too_large' } });
    return;
  }
  if (anyErr?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_input' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'server_error' } });
}

/** Gemeinsame zod-Bausteine */
export const zId = z.string().min(1).max(64);
export const zPostalCode = z.string().regex(/^\d{5}$/, 'postal_code');
export const zText = (max = 2000) => z.string().trim().max(max);
