import { PREMIUM } from '@gehmeinsam/shared';
import { Router } from 'express';
import { config } from '../config.js';
import { smsEnabled } from '../lib/sms.js';

/** Öffentliche Einstellungen für Oberfläche und Mobil-App. */
export const router = Router();

router.get('/', (_req, res) => {
  res.json({
    smsLogin: smsEnabled(),
    mapTileUrl: config.MAP_TILE_URL,
    mapAttribution: '© OpenStreetMap-Mitwirkende',
    premium: { priceCents: PREMIUM.priceCents, currency: PREMIUM.currency, interval: PREMIUM.interval },
    billingProvider: config.BILLING_PROVIDER,
    locales: ['de'],
  });
});
