import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { addMonths } from '../src/lib/billing.js';
import { signUp } from './helpers.js';
import { hoursAgo } from './fixtures/paket-b.js';

const binary = (r: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  r.on('data', (c: Buffer) => chunks.push(c));
  r.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Premium', () => {
  it('sperrt Statistiken ohne Abo (402), Walks eintragen bleibt kostenlos', async () => {
    const { agent } = await signUp();
    await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(1), durationMinutes: 30, distanceKm: 2 }).expect(201);
    await agent.get('/api/v1/badges').expect(200);
    await agent.get('/api/v1/challenges').expect(200);
    for (const path of ['/stats', '/goals', '/year-review', '/share-card.png']) {
      const res = await agent.get(`/api/v1/premium${path}`);
      expect(res.status, path).toBe(402);
      expect(res.body.error.code).toBe('premium_required');
    }
    const st = await agent.get('/api/v1/premium/status').expect(200);
    expect(st.body).toMatchObject({
      premium: false,
      subscription: null,
      price: { priceCents: 399, currency: 'EUR', interval: 'month' },
    });
    expect(st.body.features).toContain('stats');
  });

  it('Abo (dev) ist sofort aktiv; Kündigung mit einem Klick bleibt bis Laufzeitende aktiv', async () => {
    const { agent, userId } = await signUp();
    const sub = await agent.post('/api/v1/premium/subscribe').expect(200);
    expect(sub.body.subscription).toMatchObject({ status: 'active', active: true, provider: 'dev', cancelAtPeriodEnd: false, priceCents: 399 });
    const end = new Date(sub.body.subscription.currentPeriodEnd).getTime();
    expect(end).toBeGreaterThan(Date.now() + 27 * 86400_000);
    const again = await agent.post('/api/v1/premium/subscribe').expect(409);
    expect(again.body.error.code).toBe('already_premium');
    await agent.get('/api/v1/premium/stats').expect(200);
    const me = await agent.get('/api/v1/me').expect(200);
    expect(me.body.me.premium).toBe(true);

    const c1 = await agent.post('/api/v1/premium/cancel').expect(200);
    expect(c1.body.subscription).toMatchObject({ cancelAtPeriodEnd: true, active: true });
    await agent.post('/api/v1/premium/cancel').expect(200); // Doppelklick schadet nicht
    expect((await agent.get('/api/v1/premium/status')).body.premium).toBe(true);
    await agent.get('/api/v1/premium/stats').expect(200);

    const r = await agent.post('/api/v1/premium/resume').expect(200);
    expect(r.body.subscription.cancelAtPeriodEnd).toBe(false);
    await agent.post('/api/v1/premium/cancel').expect(200);

    // Laufzeit vorbei → kein Premium mehr, keine Verlängerung
    await db.update(s.subscriptions).set({ currentPeriodEnd: new Date(Date.now() - 1000) }).where(eq(s.subscriptions.userId, userId));
    const st = await agent.get('/api/v1/premium/status').expect(200);
    expect(st.body.premium).toBe(false);
    expect(st.body.subscription.status).toBe('expired');
    await agent.get('/api/v1/premium/stats').expect(402);
    await agent.post('/api/v1/premium/cancel').expect(402);
    // erneut abonnieren geht
    await agent.post('/api/v1/premium/subscribe').expect(200);
    expect((await agent.get('/api/v1/premium/status')).body.premium).toBe(true);
  });

  it('dev-Abo verlängert sich automatisch, solange nicht gekündigt', async () => {
    const { agent, userId } = await signUp();
    await agent.post('/api/v1/premium/subscribe').expect(200);
    const past = new Date(Date.now() - 40 * 86400_000);
    await db.update(s.subscriptions).set({ currentPeriodEnd: past }).where(eq(s.subscriptions.userId, userId));
    const st = await agent.get('/api/v1/premium/status').expect(200);
    expect(st.body.premium).toBe(true);
    const end = new Date(st.body.subscription.currentPeriodEnd);
    expect(end.getTime()).toBe(addMonths(addMonths(past, 1), 1).getTime());
    expect(end.getTime()).toBeGreaterThan(Date.now());
  });

  it('Statistik, Ziele, Jahresrückblick und Fortschrittskarte', async () => {
    const { agent } = await signUp({ name: 'Ingrid' });
    await agent.post('/api/v1/premium/subscribe').expect(200);
    // kurz vor „jetzt“, damit beide Walks sicher in der laufenden Woche liegen
    await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(0.05), durationMinutes: 60, distanceKm: 5.5 }).expect(201);
    await agent.post('/api/v1/activities').send({ startedAt: hoursAgo(0.02), durationMinutes: 30, distanceKm: 2.5 }).expect(201);

    for (const [range, n] of [['week', 12], ['month', 12], ['year', 5]] as const) {
      const st = await agent.get(`/api/v1/premium/stats?range=${range}`).expect(200);
      expect(st.body.series).toHaveLength(n);
      expect(st.body.speedTrend).toHaveLength(n);
      expect(st.body.totals).toMatchObject({ walks: 2, km: 8, minutes: 90, avgSpeedKmh: 5.3 });
      expect(st.body.series[n - 1]).toMatchObject({ walks: 2, km: 8 });
    }
    await agent.get('/api/v1/premium/stats?range=decade').expect(400);

    await agent.put('/api/v1/premium/goals').send({ period: 'week', metric: 'km', target: 20 }).expect(200);
    const g = await agent.put('/api/v1/premium/goals').send({ period: 'week', metric: 'km', target: 25 }).expect(200);
    expect(g.body.goals).toHaveLength(1);
    expect(g.body.goals[0]).toMatchObject({ period: 'week', metric: 'km', target: 25, progress: 8 });
    await agent.put('/api/v1/premium/goals').send({ period: 'month', metric: 'walks', target: 1.5 }).expect(400);
    const g2 = await agent.put('/api/v1/premium/goals').send({ period: 'month', metric: 'walks', target: 12 }).expect(200);
    expect(g2.body.goals.find((x: { metric: string }) => x.metric === 'walks').progress).toBe(2);
    await agent.delete(`/api/v1/premium/goals/${g.body.goals[0].id}`).expect(200);
    expect((await agent.get('/api/v1/premium/goals').expect(200)).body.goals).toHaveLength(1);

    const yr = await agent.get('/api/v1/premium/year-review').expect(200);
    expect(yr.body).toMatchObject({ year: new Date().getFullYear(), walks: 2, km: 8, minutes: 90, groupWalks: 0, places: ['Kassel'] });
    expect(yr.body.longestWalk.distanceKm).toBe(5.5);
    expect(yr.body.bestMonth.km).toBe(8);
    expect(yr.body.badges.map((b: { key: string }) => b.key)).toContain('first_5k');

    const png = await agent.get('/api/v1/premium/share-card.png?range=year').buffer(true).parse((r, cb) => binary(r as unknown as NodeJS.ReadableStream, cb)).expect(200);
    expect(png.headers['content-type']).toBe('image/png');
    const meta = await sharp(png.body as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([1080, 1080]);
  });

  it('addMonths schneidet Monatsenden ab', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(new Date('2026-11-16T10:00:00Z'), 1).toISOString()).toBe('2026-12-16T10:00:00.000Z');
  });
});
