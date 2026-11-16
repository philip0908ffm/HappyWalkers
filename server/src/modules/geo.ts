import { Router } from 'express';
import { z } from 'zod';
import { lookupPostalCode, searchPlaces } from '../lib/geo.js';
import { notFound, parse } from '../lib/http.js';

export const router = Router();

/** GET /geo/postal/:code → Ort zu einer PLZ */
router.get('/postal/:code', (req, res) => {
  const { code } = parse(z.object({ code: z.string().regex(/^\d{5}$/) }), req.params);
  const place = lookupPostalCode(code);
  if (!place) throw notFound('postal_code_unknown');
  res.json({ place });
});

/** GET /geo/search?q=Kassel → Orte (Name oder PLZ-Anfang) */
router.get('/search', (req, res) => {
  const { q } = parse(z.object({ q: z.string().min(2).max(60) }), req.query);
  res.json({ places: searchPlaces(q) });
});
