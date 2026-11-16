import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { ApiError } from './http.js';
import { routeLengthKm } from './geo.js';

/**
 * GPX-Import (Paket B). Liest Track- bzw. Routenpunkte aus einer GPX-Datei und liefert eine
 * Vorschau: Start, Dauer (aus Zeitstempeln), Länge und vereinfachte Route [[lon, lat], ...].
 *
 * Sicherheit: Dokumenttyp-Deklarationen (DTD) und Entitäten werden abgelehnt bzw. nicht
 * aufgelöst – das verhindert XXE und „Billion Laughs“. Externe Inhalte werden nie geladen.
 */
export const MAX_ROUTE_POINTS = 2000;

export interface GpxPreview {
  startedAt: string | null;
  durationMinutes: number | null;
  distanceKm: number;
  route: [number, number][];
}

const invalid = (reason: string) => new ApiError(400, 'invalid_gpx', undefined, [{ field: 'file', code: reason }]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  processEntities: false,
  htmlEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  isArray: (name) => ['trk', 'trkseg', 'trkpt', 'rte', 'rtept'].includes(name),
});

type RawPoint = { '@_lat'?: string; '@_lon'?: string; time?: unknown };

export function parseGpx(input: Buffer | string): GpxPreview {
  let xml = typeof input === 'string' ? input : input.toString('utf8');
  if (xml.charCodeAt(0) === 0xfeff) xml = xml.slice(1);
  if (!xml.trim()) throw invalid('empty');
  // DTD/Entitäten grundsätzlich ablehnen (XXE, Entity-Expansion)
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw invalid('doctype_not_allowed');
  if (XMLValidator.validate(xml) !== true) throw invalid('malformed_xml');

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw invalid('malformed_xml');
  }
  const gpx = doc?.gpx as Record<string, unknown> | undefined;
  if (!gpx || typeof gpx !== 'object') throw invalid('not_gpx');

  const raw: RawPoint[] = [];
  for (const trk of asArray(gpx.trk)) {
    for (const seg of asArray((trk as Record<string, unknown>)?.trkseg)) {
      raw.push(...(asArray((seg as Record<string, unknown>)?.trkpt) as RawPoint[]));
    }
  }
  if (raw.length === 0) {
    for (const rte of asArray(gpx.rte)) raw.push(...(asArray((rte as Record<string, unknown>)?.rtept) as RawPoint[]));
  }

  const coords: [number, number][] = [];
  const times: number[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const lat = Number(p['@_lat']);
    const lon = Number(p['@_lon']);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    coords.push([round5(lon), round5(lat)]);
    const t = typeof p.time === 'string' ? Date.parse(p.time) : NaN;
    if (Number.isFinite(t)) times.push(t);
  }
  if (coords.length < 2) throw invalid('no_points');

  const distanceKm = Math.round(routeLengthKm(coords) * 100) / 100;
  let startedAt: string | null = null;
  let durationMinutes: number | null = null;
  if (times.length >= 2) {
    const first = Math.min(...times);
    const last = Math.max(...times);
    startedAt = new Date(first).toISOString();
    durationMinutes = Math.max(1, Math.round((last - first) / 60000));
  } else if (times.length === 1) {
    startedAt = new Date(times[0]).toISOString();
  }

  return { startedAt, durationMinutes, distanceKm, route: simplifyRoute(coords) };
}

function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * Vereinfacht eine Route auf höchstens `maxPoints` Punkte (Douglas-Peucker mit wachsender
 * Toleranz, zur Sicherheit danach gleichmäßiges Ausdünnen). Erster und letzter Punkt bleiben.
 */
export function simplifyRoute(coords: [number, number][], maxPoints = MAX_ROUTE_POINTS): [number, number][] {
  if (coords.length <= maxPoints) return coords;
  let eps = 0.00001; // ca. 1 m
  let out = coords;
  for (let i = 0; i < 20 && out.length > maxPoints; i++) {
    out = douglasPeucker(coords, eps);
    eps *= 2;
  }
  if (out.length > maxPoints) {
    const step = (out.length - 1) / (maxPoints - 1);
    const sampled: [number, number][] = [];
    for (let i = 0; i < maxPoints; i++) sampled.push(out[Math.round(i * step)]);
    out = sampled;
  }
  return out;
}

/** Iterativer Douglas-Peucker (kein Rekursions-Überlauf bei großen Dateien). */
function douglasPeucker(pts: [number, number][], eps: number): [number, number][] {
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpDistance(pts[i], pts[a], pts[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > eps) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

function perpDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
