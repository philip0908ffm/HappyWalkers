import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ortsbestimmung über Postleitzahl (GeoNames, CC BY 4.0) – ohne externe Dienste,
 * damit keine Suchanfragen an Dritte gehen (Datenschutz).
 */
type Row = [place: string, district: string, state: string, lat: number, lon: number];

export interface Place {
  postalCode: string;
  city: string;
  district: string;
  state: string;
  lat: number;
  lon: number;
}

let byPlz: Record<string, Row[]> | null = null;

function load(): Record<string, Row[]> {
  if (byPlz) return byPlz;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../data/plz-de.json'),
    path.resolve(here, '../data/plz-de.json'),
    path.resolve(process.cwd(), 'data/plz-de.json'),
    path.resolve(process.cwd(), 'server/data/plz-de.json'),
  ];
  const file = candidates.find((c) => fs.existsSync(c));
  if (!file) throw new Error('PLZ-Daten nicht gefunden (server/data/plz-de.json)');
  byPlz = JSON.parse(fs.readFileSync(file, 'utf8'));
  return byPlz!;
}

/** Mittelpunkt einer PLZ (Durchschnitt aller Orte), Hauptort = erster Eintrag. */
export function lookupPostalCode(postalCode: string): Place | null {
  const rows = load()[postalCode];
  if (!rows?.length) return null;
  const lat = rows.reduce((s, r) => s + r[3], 0) / rows.length;
  const lon = rows.reduce((s, r) => s + r[4], 0) / rows.length;
  const [city, district, state] = rows[0];
  return { postalCode, city, district, state, lat: round(lat), lon: round(lon) };
}

/** Suche nach Ortsnamen oder PLZ-Anfang. Liefert höchstens `limit` Treffer. */
export function searchPlaces(query: string, limit = 8): Place[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const data = load();
  const out: Place[] = [];
  const seen = new Set<string>();
  if (/^\d+$/.test(q)) {
    for (const plz of Object.keys(data)) {
      if (plz.startsWith(q)) {
        const p = lookupPostalCode(plz);
        if (p) out.push(p);
        if (out.length >= limit) break;
      }
    }
    return out;
  }
  const starts: Place[] = [];
  const contains: Place[] = [];
  for (const [plz, rows] of Object.entries(data)) {
    for (const r of rows) {
      const name = r[0].toLowerCase();
      const key = `${r[0]}|${r[1]}`;
      if (seen.has(key)) continue;
      if (name.startsWith(q) || name.includes(q)) {
        seen.add(key);
        const p = { postalCode: plz, city: r[0], district: r[1], state: r[2], lat: r[3], lon: r[4] };
        (name.startsWith(q) ? starts : contains).push(p);
      }
    }
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Nächster Ort (PLZ) zu einer Koordinate – z. B. für GPX-Routen ohne Ortsangabe. */
export function nearestPlace(lat: number, lon: number): Place | null {
  let best: Place | null = null;
  let bestD = Infinity;
  for (const [plz, rows] of Object.entries(load())) {
    for (const r of rows) {
      const d = (r[3] - lat) ** 2 + ((r[4] - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { postalCode: plz, city: r[0], district: r[1], state: r[2], lat: r[3], lon: r[4] };
      }
    }
  }
  return best;
}

/** Entfernung in km (Haversine). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Rechteck um einen Punkt für schnelle Vorauswahl in SQL. */
export function boundingBox(lat: number, lon: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}

/** Länge einer Route [[lon, lat], ...] in km. */
export function routeLengthKm(coords: [number, number][]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    sum += distanceKm(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  return sum;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/** Radius der Privatzone um Start und Ziel einer Route (Meter). */
export const PRIVACY_ZONE_M = 300;

/**
 * Privatzone (Entscheidung Lena, S2-13): Für andere Personen werden Anfang und Ende einer Route
 * gekürzt, damit Start/Ziel (oft die eigene Wohnung) nicht erkennbar sind.
 * Bleibt danach zu wenig übrig, wird keine Route gezeigt.
 */
export function maskRouteForOthers(route: [number, number][] | null | undefined): [number, number][] | null {
  if (!route || route.length < 2) return null;
  const km = PRIVACY_ZONE_M / 1000;
  const [sLon, sLat] = route[0];
  const [eLon, eLat] = route[route.length - 1];
  const outside = route.filter(
    ([lon, lat]) => distanceKm(lat, lon, sLat, sLon) > km && distanceKm(lat, lon, eLat, eLon) > km,
  );
  return outside.length >= 2 ? outside : null;
}
