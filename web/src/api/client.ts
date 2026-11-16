/**
 * Zugriff auf die JSON-API (/api/v1). Dieselbe API nutzt später die Mobil-App.
 * Fehler kommen als `{ error: { code } }` und werden über i18n (errors.<code>) in Sätze übersetzt.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public details?: { field: string; code: string; message: string }[],
  ) {
    super(code);
  }
}

const BASE = '/api/v1';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'server_error', data?.error?.details);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};

/** Für Links zu Dateien (ICS, PDF, Bilder) */
export const apiUrl = (path: string) => BASE + path;
