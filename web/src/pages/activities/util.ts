import { TEMPO_KMH } from '@happywalkers/shared';

/** „5,2“ oder „5.2“ (auch „5,2 km“) → 5.2; leer/ungültig → NaN */
export function parseKm(s: string): number {
  const clean = s.trim().replace(/\s|km/gi, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(clean)) return NaN;
  return parseFloat(clean);
}

/** Tempo in Alltagssprache aus km/h */
export function tempoWord(kmh: number): 'gemuetlich' | 'zuegig' | 'flott' {
  if (kmh >= TEMPO_KMH.flott[0]) return 'flott';
  if (kmh >= TEMPO_KMH.zuegig[0]) return 'zuegig';
  return 'gemuetlich';
}
