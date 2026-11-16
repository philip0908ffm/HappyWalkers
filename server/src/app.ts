import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { auth } from './auth.js';
import { config, isProd, isTest } from './config.js';
import { sentMails } from './lib/email.js';
import { errorHandler, notFound } from './lib/http.js';
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
          'style-src': ["'self'", "'unsafe-inline'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );

  // Mobil-App / weitere Herkünfte: nur ausdrücklich erlaubte Origins
  const origins = [config.APP_URL, ...config.TRUSTED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)];
  app.use(cors({ origin: origins, credentials: true }));

  // Better Auth muss VOR express.json() eingebunden werden
  app.all('/api/auth/*splat', toNodeHandler(auth));

  app.use(express.json({ limit: '1mb' }));

  // NUR für End-to-End-Tests: zuletzt gesendete E-Mails/SMS abrufen. In Produktion nie aktiv.
  if (isTest && process.env.E2E_MAILBOX === '1' && !isProd) {
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

function tileHosts(): string[] {
  try {
    const u = new URL(config.MAP_TILE_URL.replace(/\{[a-z]\}/g, 'a'));
    return [`${u.protocol}//${u.host.replace(/^a\./, '*.')}`, `${u.protocol}//${u.host}`];
  } catch {
    return [];
  }
}
