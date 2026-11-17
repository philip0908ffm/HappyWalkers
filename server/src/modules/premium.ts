import { config } from '../config.js';
import { PREMIUM } from '@happywalkers/shared';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { activities, goals, profile, subscriptions, userBadges } from '../db/schema.js';
import { billingProvider } from '../lib/billing.js';
import { conflict, paymentRequired, parse, unauthorized, zId } from '../lib/http.js';
import { me, requireUser } from '../middleware/auth.js';
import { berlinDate, berlinMidnight } from '../services/gamification.js';
import { escapeXml, svgToPng, toBadgeEarned } from './badges.js';

/**
 * Modul „premium“ (Paket B, siehe docs/API.md).
 * Kostenpflichtig sind NUR Fortschritt/Statistiken (Statistik, Ziele, Jahresrückblick, Fortschrittskarte).
 * Walks eintragen, Gruppen, Abzeichen und Challenges bleiben immer kostenlos.
 */
export const router = Router();
router.use(requireUser);

export const PREMIUM_FEATURES = ['stats', 'goals', 'year_review', 'share_card'] as const;

type SubRow = typeof subscriptions.$inferSelect;

/**
 * Abo lesen und dabei den Stand nachziehen:
 *  - Anbieter `dev`: abgelaufene, nicht gekündigte Laufzeit verlängert sich um je einen Monat.
 *  - Gekündigt und Laufzeit vorbei → Status `expired`.
 */
export async function getSubscription(userId: string): Promise<SubRow | null> {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!sub) return null;
  const now = new Date();
  if (sub.currentPeriodEnd > now || sub.status === 'expired') return sub;
  const renewedUntil = await billingProvider(sub.provider).renew(sub, now);
  const [updated] = await db
    .update(subscriptions)
    .set(renewedUntil ? { currentPeriodEnd: renewedUntil, status: 'active' } : { status: 'expired' })
    .where(eq(subscriptions.userId, userId))
    .returning();
  return updated;
}

export const isActiveSubscription = (sub: SubRow | null): sub is SubRow =>
  !!sub && sub.status !== 'expired' && sub.currentPeriodEnd > new Date();

export async function isPremium(userId: string): Promise<boolean> {
  return isActiveSubscription(await getSubscription(userId));
}

/** Wiederverwendbare Middleware: 402 `premium_required` ohne aktives Abo. */
export async function requirePremium(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) throw unauthorized();
    if (!(await isPremium(req.user.id))) throw paymentRequired();
    next();
  } catch (err) {
    next(err);
  }
}

function toSubscription(sub: SubRow | null) {
  if (!sub) return null;
  return {
    status: sub.status,
    active: isActiveSubscription(sub),
    provider: sub.provider,
    priceCents: sub.priceCents,
    currency: PREMIUM.currency,
    interval: PREMIUM.interval,
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

const price = { priceCents: PREMIUM.priceCents, currency: PREMIUM.currency, interval: PREMIUM.interval };

/* ------------------------------------------------------------------ */
/* Abo                                                                 */
/* ------------------------------------------------------------------ */

router.get('/status', async (req, res) => {
  const sub = await getSubscription(me(req).id);
  res.json({ premium: isActiveSubscription(sub), subscription: toSubscription(sub), price, features: PREMIUM_FEATURES });
});

router.post('/subscribe', async (req, res) => {
  const userId = me(req).id;
  const current = await getSubscription(userId);
  if (isActiveSubscription(current)) throw conflict('already_premium');
  const provider = billingProvider();
  const started = await provider.start(userId);
  const values = {
    status: 'active',
    provider: provider.name,
    providerRef: started.providerRef,
    priceCents: started.priceCents,
    currentPeriodEnd: started.currentPeriodEnd,
    cancelAtPeriodEnd: false,
  };
  const [sub] = await db
    .insert(subscriptions)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: subscriptions.userId, set: values })
    .returning();
  res.json({ subscription: toSubscription(sub) });
});

/** Kündigen mit einem Klick: bleibt bis zum Laufzeitende aktiv. Idempotent. */
router.post('/cancel', async (req, res) => {
  const userId = me(req).id;
  const sub = await getSubscription(userId);
  if (!isActiveSubscription(sub)) throw paymentRequired();
  if (!sub.cancelAtPeriodEnd) {
    await billingProvider(sub.provider).cancel(sub);
    const [updated] = await db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: true })
      .where(eq(subscriptions.userId, userId))
      .returning();
    res.json({ subscription: toSubscription(updated) });
    return;
  }
  res.json({ subscription: toSubscription(sub) });
});

/** Kündigung zurücknehmen (solange die Laufzeit noch läuft). Idempotent. */
router.post('/resume', async (req, res) => {
  const userId = me(req).id;
  const sub = await getSubscription(userId);
  if (!isActiveSubscription(sub)) throw paymentRequired();
  if (sub.cancelAtPeriodEnd) {
    await billingProvider(sub.provider).resume(sub);
    const [updated] = await db
      .update(subscriptions)
      .set({ cancelAtPeriodEnd: false })
      .where(eq(subscriptions.userId, userId))
      .returning();
    res.json({ subscription: toSubscription(updated) });
    return;
  }
  res.json({ subscription: toSubscription(sub) });
});

/* ------------------------------------------------------------------ */
/* Zeiträume (Europe/Berlin)                                           */
/* ------------------------------------------------------------------ */

interface Bucket {
  label: string;
  start: Date;
  end: Date;
}

const ymdOfDay = (dayNumber: number) => {
  const d = new Date(dayNumber * 86400000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
};

function isoWeekLabel(dayNumber: number): string {
  const thursday = dayNumber - ((dayNumber + 3) % 7) + 3;
  const t = new Date(thursday * 86400000);
  const yearStart = Math.floor(Date.UTC(t.getUTCFullYear(), 0, 1) / 86400000);
  const week = 1 + Math.floor((thursday - yearStart) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Wochen-, Monats- bzw. Jahres-Abschnitte, ältester zuerst; der letzte ist der laufende. */
export function buckets(range: 'week' | 'month' | 'year', count: number, now = new Date()): Bucket[] {
  const today = berlinDate(now);
  const starts: { label: string; start: Date }[] = [];
  if (range === 'week') {
    const monday = today.dayNumber - today.weekday;
    for (let i = count - 1; i >= -1; i--) {
      const dn = monday - 7 * i;
      const p = ymdOfDay(dn);
      starts.push({ label: isoWeekLabel(dn), start: berlinMidnight(p.y, p.m, p.d) });
    }
  } else if (range === 'month') {
    for (let i = count - 1; i >= -1; i--) {
      const idx = today.y * 12 + (today.m - 1) - i;
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      starts.push({ label: `${y}-${pad(m)}`, start: berlinMidnight(y, m, 1) });
    }
  } else {
    for (let i = count - 1; i >= -1; i--) starts.push({ label: String(today.y - i), start: berlinMidnight(today.y - i, 1, 1) });
  }
  const out: Bucket[] = [];
  for (let i = 0; i < starts.length - 1; i++) out.push({ label: starts[i].label, start: starts[i].start, end: starts[i + 1].start });
  return out;
}

type ActRow = typeof activities.$inferSelect;

async function activitiesBetween(userId: string, start: Date, end: Date): Promise<ActRow[]> {
  return db
    .select()
    .from(activities)
    .where(and(eq(activities.userId, userId), gte(activities.startedAt, start), lt(activities.startedAt, end)))
    .orderBy(asc(activities.startedAt));
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function summarize(rows: ActRow[]) {
  const km = rows.reduce((s, a) => s + a.distanceKm, 0);
  const minutes = rows.reduce((s, a) => s + a.durationMinutes, 0);
  return { walks: rows.length, km: r2(km), minutes, avgSpeedKmh: minutes > 0 ? r1(km / (minutes / 60)) : null };
}

/* ------------------------------------------------------------------ */
/* Statistik                                                           */
/* ------------------------------------------------------------------ */

const BUCKET_COUNT = { week: 12, month: 12, year: 5 } as const;

router.get('/stats', requirePremium, async (req, res) => {
  const { range } = parse(z.object({ range: z.enum(['week', 'month', 'year']).default('month') }), req.query);
  const userId = me(req).id;
  const bs = buckets(range, BUCKET_COUNT[range]);
  const rows = await activitiesBetween(userId, bs[0].start, bs[bs.length - 1].end);
  const series = bs.map((b) => {
    const s = summarize(rows.filter((a) => a.startedAt >= b.start && a.startedAt < b.end));
    return { label: b.label, start: b.start.toISOString(), walks: s.walks, km: s.km, avgSpeedKmh: s.avgSpeedKmh };
  });
  res.json({
    range,
    totals: summarize(rows),
    series,
    speedTrend: series.map((s) => ({ label: s.label, avgSpeedKmh: s.avgSpeedKmh })),
  });
});

/* ------------------------------------------------------------------ */
/* Ziele                                                               */
/* ------------------------------------------------------------------ */

async function goalsWithProgress(userId: string) {
  const rows = await db.select().from(goals).where(eq(goals.userId, userId)).orderBy(asc(goals.createdAt));
  if (!rows.length) return [];
  const week = buckets('week', 1)[0];
  const month = buckets('month', 1)[0];
  const acts = await activitiesBetween(
    userId,
    week.start < month.start ? week.start : month.start,
    week.end > month.end ? week.end : month.end,
  );
  return rows.map((g) => {
    const b = g.period === 'week' ? week : month;
    const s = summarize(acts.filter((a) => a.startedAt >= b.start && a.startedAt < b.end));
    return {
      id: g.id,
      period: g.period,
      metric: g.metric,
      target: g.target,
      progress: g.metric === 'km' ? s.km : s.walks,
      periodStart: b.start.toISOString(),
      periodEnd: b.end.toISOString(),
    };
  });
}

router.get('/goals', requirePremium, async (req, res) => {
  res.json({ goals: await goalsWithProgress(me(req).id) });
});

const goalSchema = z
  .object({
    period: z.enum(['week', 'month']),
    metric: z.enum(['km', 'walks']),
    target: z.number().positive(),
  })
  .superRefine((v, ctx) => {
    const max = v.metric === 'km' ? (v.period === 'week' ? 500 : 2000) : v.period === 'week' ? 50 : 200;
    if (v.target > max) ctx.addIssue({ code: 'custom', path: ['target'], message: 'too_large' });
    if (v.metric === 'walks' && !Number.isInteger(v.target)) ctx.addIssue({ code: 'custom', path: ['target'], message: 'integer' });
  });

router.put('/goals', requirePremium, async (req, res) => {
  const body = parse(goalSchema, req.body);
  const userId = me(req).id;
  await db
    .insert(goals)
    .values({ userId, ...body })
    .onConflictDoUpdate({ target: [goals.userId, goals.period, goals.metric], set: { target: body.target } });
  res.json({ goals: await goalsWithProgress(userId) });
});

router.delete('/goals/:id', requirePremium, async (req, res) => {
  const userId = me(req).id;
  await db.delete(goals).where(and(eq(goals.id, parse(zId, req.params.id)), eq(goals.userId, userId)));
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Jahresrückblick                                                     */
/* ------------------------------------------------------------------ */

async function yearReview(userId: string, year: number) {
  const start = berlinMidnight(year, 1, 1);
  const end = berlinMidnight(year + 1, 1, 1);
  const rows = await activitiesBetween(userId, start, end);
  const s = summarize(rows);
  const byMonth = new Map<string, { km: number; walks: number }>();
  for (const a of rows) {
    const d = berlinDate(a.startedAt);
    const key = `${d.y}-${pad(d.m)}`;
    const m = byMonth.get(key) ?? { km: 0, walks: 0 };
    m.km += a.distanceKm;
    m.walks++;
    byMonth.set(key, m);
  }
  let bestMonth: { month: string; km: number; walks: number } | null = null;
  for (const [month, v] of byMonth) if (!bestMonth || v.km > bestMonth.km) bestMonth = { month, km: r2(v.km), walks: v.walks };
  const longest = rows.reduce<ActRow | null>((best, a) => (!best || a.distanceKm > best.distanceKm ? a : best), null);
  const badgeRows = await db
    .select()
    .from(userBadges)
    .where(and(eq(userBadges.userId, userId), gte(userBadges.awardedAt, start), lt(userBadges.awardedAt, end)))
    .orderBy(asc(userBadges.awardedAt));
  return {
    year,
    walks: s.walks,
    km: s.km,
    minutes: s.minutes,
    groupWalks: rows.filter((a) => a.source === 'group').length,
    badges: badgeRows.map(toBadgeEarned),
    bestMonth,
    longestWalk: longest
      ? {
          id: longest.id,
          distanceKm: longest.distanceKm,
          durationMinutes: longest.durationMinutes,
          startedAt: longest.startedAt.toISOString(),
        }
      : null,
    places: [...new Set(rows.map((a) => a.city).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'de')),
  };
}

router.get('/year-review', requirePremium, async (req, res) => {
  const thisYear = berlinDate(new Date()).y;
  const { year } = parse(z.object({ year: z.coerce.number().int().min(2000).max(thisYear).default(thisYear) }), req.query);
  res.json(await yearReview(me(req).id, year));
});

/* ------------------------------------------------------------------ */
/* Fortschrittskarte (PNG 1080×1080)                                   */
/* ------------------------------------------------------------------ */

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const FONT = "'DejaVu Sans', 'Atkinson Hyperlegible', Arial, sans-serif";
const fmtNum = (n: number, digits = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: digits });

router.get('/share-card.png', requirePremium, async (req, res) => {
  const { range } = parse(z.object({ range: z.enum(['month', 'year']).default('month') }), req.query);
  const userId = me(req).id;
  const b = buckets(range, 1)[0];
  const s = summarize(await activitiesBetween(userId, b.start, b.end));
  const today = berlinDate(new Date());
  const period = range === 'month' ? `${MONTHS_DE[today.m - 1]} ${today.y}` : `Jahr ${today.y}`;
  const [p] = await db.select({ n: profile.displayName }).from(profile).where(eq(profile.userId, userId)).limit(1);
  const name = (p?.n ?? '').slice(0, 30);
  const hours = Math.floor(s.minutes / 60);
  const mins = s.minutes % 60;
  const stat = (y: number, value: string, label: string) =>
    `<text x="540" y="${y}" font-family="${FONT}" font-size="120" font-weight="700" fill="#1F2A27" text-anchor="middle">${escapeXml(value)}</text>
  <text x="540" y="${y + 70}" font-family="${FONT}" font-size="44" fill="#4A5552" text-anchor="middle">${escapeXml(label)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" fill="#FFF8EE"/>
  <rect x="24" y="24" width="1032" height="1032" fill="none" stroke="#2F5D50" stroke-width="8" rx="32"/>
  <text x="540" y="130" font-family="${FONT}" font-size="44" font-weight="700" fill="#2F5D50" text-anchor="middle">${escapeXml(config.APP_NAME)}</text>
  <text x="540" y="215" font-family="${FONT}" font-size="64" font-weight="700" fill="#1F2A27" text-anchor="middle">Mein Fortschritt</text>
  <text x="540" y="280" font-family="${FONT}" font-size="44" fill="#4A5552" text-anchor="middle">${escapeXml(period)}</text>
  ${stat(450, `${fmtNum(s.km)} km`, 'gegangen')}
  ${stat(660, String(s.walks), s.walks === 1 ? 'Walk' : 'Walks')}
  ${stat(870, hours > 0 ? (mins > 0 ? `${hours} h ${mins} min` : `${hours} h`) : `${mins} min`, 'unterwegs')}
  <text x="540" y="1010" font-family="${FONT}" font-size="40" fill="#2F5D50" text-anchor="middle">${escapeXml(name)}</text>
</svg>`;
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(await svgToPng(svg));
});
