import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { auth } from './auth.js';
import { config, isProd, isTest, type Config } from './config.js';
import { sentMails } from './lib/email.js';
import { errorHandler, forbidden, notFound } from './lib/http.js';
import { sentSms } from './lib/sms.js';
import { loadSession } from './middleware/auth.js';
import { router as activitiesRouter } from './modules/activities.js';
import { router as badgesRouter } from './modules/badges.js';
import { router as challengesRouter } from './modules/challenges.js';
import { router as configRouter } from './modules/config.js';
import { router as geoRouter } from './modules/geo.js';
import { router as groupsRouter } from './modules/groups.js';
import { router as invitesRouter } from './modules/invites.js';
import { router as meRouter } from './modules/me.js';
import { router as notificationsRouter } from './modules/notifications.js';
import { router as photosRouter } from './modules/photos.js';
import { router as premiumRouter } from './modules/premium.js';
import { router as ruralRouter } from './modules/rural.js';
import { router as socialRouter } from './modules/social.js';
import { router as walksRouter } from './modules/walks.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Railway sitzt vor der App
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', ...tileHosts()],
          'connect-src': ["'self'"],
          'script-src': ["'self'"],
          // React setzt style-Attribute, Leaflet positioniert Kacheln per Inline-Style
          'style-src': ["'self'", "'unsafe-inline'"],
          // Schrift wird selbst ausgeliefert (@fontsource) – keine fremden Schrift-Server
          'font-src': ["'self'", 'data:'],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );

  // Browser-Funktionen, die die App nicht braucht, abschalten. Standort nur auf eigener Seite (freiwillig).
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=(), interest-cohort=(), geolocation=(self)');
    next();
  });

  // Mobil-App / weitere Herkünfte: nur ausdrücklich erlaubte Origins
  const origins = allowedOrigins();
  app.use(cors({ origin: origins, credentials: true }));

  // Persönliche Antworten nie in fremden Zwischenspeichern ablegen (Module dürfen das überschreiben, z. B. für Bilder).
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });

  // Client-IP für die Ratenbegrenzung von Better Auth: aus Express (trust proxy) übernehmen,
  // damit niemand über einen selbst gesetzten X-Forwarded-For-Kopf die Begrenzung umgeht.
  app.use('/api/auth', (req, _res, next) => {
    delete req.headers[CLIENT_IP_HEADER];
    if (req.ip) req.headers[CLIENT_IP_HEADER] = req.ip;
    next();
  });

  // Better Auth muss VOR express.json() eingebunden werden
  app.all('/api/auth/*splat', toNodeHandler(auth));

  app.use(express.json({ limit: '1mb' }));

  // NUR für End-to-End-Tests: zuletzt gesendete E-Mails/SMS abrufen. In Produktion nie aktiv.
  if (testMailboxAllowed(config, process.env)) {
    app.get('/api/test/mailbox', (req, res) => {
      const to = String(req.query.to ?? '');
      res.json({
        mails: sentMails.filter((m) => m.to === to),
        sms: sentSms.filter((s) => s.phoneNumber === to),
      });
    });
  }

  if (!isTest) {
    app.use(
      '/api/v1',
      rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
    );
  }

  // Schutz vor Cross-Site-Anfragen (CSRF) für die fachliche API: schreibende Anfragen
  // aus dem Browser nur von erlaubten Herkünften. Die Mobil-App sendet keinen Origin-Kopf.
  app.use('/api/v1', sameOriginWrites(origins));

  const api = express.Router();
  api.use(loadSession);
  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  api.use('/config', configRouter);
  api.use('/geo', geoRouter);
  api.use('/me', meRouter);
  api.use('/groups', groupsRouter);
  api.use('/invites', invitesRouter);
  api.use('/walks', walksRouter);
  api.use('/activities', activitiesRouter);
  api.use('/photos', photosRouter);
  api.use('/challenges', challengesRouter);
  api.use('/badges', badgesRouter);
  api.use('/rural', ruralRouter);
  api.use('/premium', premiumRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/', socialRouter); // /feed, /posts, /users, /follows, /blocks, /reports
  api.use((_req, _res, next) => next(notFound()));
  app.use('/api/v1', api);

  // Gebaute Weboberfläche ausliefern (Produktion)
  const webDist = path.resolve(process.cwd(), config.WEB_DIST);
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

/** Kopf, über den die vertrauenswürdige Client-IP an Better Auth übergeben wird (siehe auth.ts). */
export const CLIENT_IP_HEADER = 'x-happywalkers-client-ip';

function allowedOrigins(): string[] {
  const list = [config.APP_URL, ...config.TRUSTED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)];
  return list.map((o) => {
    try {
      return new URL(o).origin;
    } catch {
      return o;
    }
  });
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Schreibende Anfragen mit fremdem Origin (oder Sec-Fetch-Site: cross-site) ablehnen. */
export function sameOriginWrites(origins: string[]) {
  const allowed = new Set(origins);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin !== undefined && !allowed.has(origin)) return next(forbidden());
    if (origin === undefined && req.get('sec-fetch-site') === 'cross-site') return next(forbidden());
    next();
  };
}

/**
 * Test-Postfach nur, wenn ALLE Bedingungen erfüllt sind: NODE_ENV=test, E2E_MAILBOX=1
 * und die App läuft auf localhost. Eine falsch gesetzte Variable allein öffnet es nie.
 */
export function testMailboxAllowed(c: Pick<Config, 'NODE_ENV' | 'APP_URL'>, env: Record<string, string | undefined>): boolean {
  if (c.NODE_ENV !== 'test' || env.E2E_MAILBOX !== '1') return false;
  try {
    const host = new URL(c.APP_URL).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

function tileHosts(): string[] {
  try {
    const u = new URL(config.MAP_TILE_URL.replace(/\{[a-z]\}/g, 'a'));
    return [`${u.protocol}//${u.host.replace(/^a\./, '*.')}`, `${u.protocol}//${u.host}`];
  } catch {
    return [];
  }
}
