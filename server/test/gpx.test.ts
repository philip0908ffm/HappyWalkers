import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseGpx, simplifyRoute } from '../src/lib/gpx.js';
import { ApiError } from '../src/lib/http.js';

const fixture = (name: string) =>
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name));

function expectInvalid(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(400);
    expect((e as ApiError).code).toBe('invalid_gpx');
    return;
  }
  throw new Error('kein Fehler geworfen');
}

describe('GPX-Parser', () => {
  it('liest Trackpunkte über mehrere Segmente, Start, Dauer und Länge', () => {
    const p = parseGpx(fixture('walk.gpx'));
    expect(p.route).toHaveLength(5);
    expect(p.route[0]).toEqual([9.92, 51.52]);
    expect(p.startedAt).toBe('2026-11-10T09:00:00.000Z');
    expect(p.durationMinutes).toBe(32);
    expect(p.distanceKm).toBeGreaterThan(2.5);
    expect(p.distanceKm).toBeLessThan(3.0);
  });

  it('liest Routenpunkte ohne Zeitstempel (Start/Dauer bleiben leer)', () => {
    const p = parseGpx(fixture('route-ohne-zeit.gpx'));
    expect(p.route).toHaveLength(3);
    expect(p.startedAt).toBeNull();
    expect(p.durationMinutes).toBeNull();
  });

  it('lehnt kaputtes XML, Nicht-GPX und leere Dateien ab', () => {
    expectInvalid(() => parseGpx(fixture('kaputt.gpx')));
    expectInvalid(() => parseGpx(fixture('kein-gpx.xml')));
    expectInvalid(() => parseGpx(''));
    expectInvalid(() => parseGpx('<gpx version="1.1"><trk><trkseg><trkpt lat="51" lon="9"/></trkseg></trk></gpx>'));
    expectInvalid(() => parseGpx(Buffer.from([0xff, 0x00, 0x13, 0x37])));
  });

  it('lehnt DTD/Entitäten ab (XXE und „Billion Laughs“)', () => {
    expectInvalid(() => parseGpx(fixture('xxe.gpx')));
    expectInvalid(() => parseGpx(fixture('billion-laughs.gpx')));
  });

  it('ignoriert ungültige Koordinaten', () => {
    const p = parseGpx(
      '<gpx><trk><trkseg><trkpt lat="91" lon="9"/><trkpt lat="abc" lon="9"/><trkpt lat="51" lon="9"/><trkpt lat="51.01" lon="9"/></trkseg></trk></gpx>',
    );
    expect(p.route).toHaveLength(2);
  });

  it('vereinfacht große Routen auf höchstens 2000 Punkte', () => {
    const pts: string[] = [];
    for (let i = 0; i < 6000; i++) {
      const lat = 51.3 + i * 0.0001;
      const lon = 9.4 + Math.sin(i / 50) * 0.01;
      pts.push(`<trkpt lat="${lat}" lon="${lon}"><time>${new Date(Date.UTC(2026, 10, 1, 8) + i * 1000).toISOString()}</time></trkpt>`);
    }
    const p = parseGpx(`<?xml version="1.0"?><gpx><trk><trkseg>${pts.join('')}</trkseg></trk></gpx>`);
    expect(p.route.length).toBeLessThanOrEqual(2000);
    expect(p.route.length).toBeGreaterThan(10);
    expect(p.durationMinutes).toBe(100);
    const line: [number, number][] = Array.from({ length: 5000 }, (_, i) => [9 + i * 0.00001, 51]);
    const simple = simplifyRoute(line);
    expect(simple.length).toBeLessThanOrEqual(2000);
    expect(simple[0]).toEqual(line[0]);
    expect(simple[simple.length - 1]).toEqual(line[line.length - 1]);
  });
});
