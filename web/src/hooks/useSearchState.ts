import type { Tempo } from '@happywalkers/shared';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SearchLocation } from '../api/types-walks';

/** Suche liest und schreibt die Adresszeile (?plz=…&umkreis=…&tempo=…&ansicht=…) – „Zurück“ funktioniert. */
export function useSearchState() {
  const [params, setParams] = useSearchParams();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const plz = params.get('plz');
  const radius = Number(params.get('umkreis')) || 15;
  const tempo = (params.get('tempo') ?? '') as Tempo | '';
  const view = params.get('ansicht') === 'karte' ? 'karte' : 'liste';
  const loc: SearchLocation = coords
    ? { type: 'coords', ...coords }
    : plz
      ? { type: 'postal', postalCode: plz }
      : { type: 'profile' };
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const setLocation = (l: SearchLocation) => {
    if (l.type === 'coords') {
      setCoords({ lat: l.lat, lon: l.lon });
      set({ plz: null });
    } else if (l.type === 'postal') {
      setCoords(null);
      set({ plz: l.postalCode });
    }
  };
  return { loc, plz, radius, tempo, view, set, setLocation, usingCoords: coords != null };
}

