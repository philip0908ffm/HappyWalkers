import { describe, expect, it } from 'vitest';
import { safeNext } from './Login';

/** Sicherheitsprüfung (Aylin): Rücksprungziel nach der Anmeldung darf nie auf fremde Seiten führen. */
describe('safeNext – keine offenen Weiterleitungen', () => {
  it('erlaubt interne Pfade mit Suche und Anker', () => {
    expect(safeNext('/gruppen/abc?tab=walks#oben')).toBe('/gruppen/abc?tab=walks#oben');
    expect(safeNext('/einladung/WALK-4K7P')).toBe('/einladung/WALK-4K7P');
  });

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'javascript:alert(1)',
    ' /x',
  ])('lehnt %j ab', (value) => {
    expect(safeNext(value)).toBe('/');
  });

  it('normalisiert Punkt-Segmente innerhalb der eigenen Seite', () => {
    expect(safeNext('/a/../walks')).toBe('/walks');
  });
});
