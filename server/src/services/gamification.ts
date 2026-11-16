/**
 * Spielelemente: Punkte, Abzeichen, Fortschritt in Challenges.
 * Zuständig: Jonas (Paket B). Wird von activities und walks (Bestätigung) aufgerufen.
 *
 * Alles ist idempotent: Punkte über `points_ledger` (eindeutig je userId+reason+ref),
 * Abzeichen über den Primärschlüssel (userId, badgeKey), Abschluss einer Challenge über
 * `completedAt IS NULL` im UPDATE.
 */
import { BADGES, POINTS, REGION_BADGE_PREFIX, pointsForActivity } from '@gehmeinsam/shared';
import { and, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { activities, challengeParticipants, challenges, pointsLedger, userBadges } from '../db/schema.js';
import { notify } from './notify.js';

export interface AwardResult {
  pointsAwarded: number;
  /** Schlüssel der neuen Abzeichen (z. B. `first_5k`, `region:Landkreis Göttingen`) */
  newBadges: string[];
  /** IDs der dabei abgeschlossenen Challenges */
  completedChallenges: string[];
}

/** Challenges, die nach Ende noch nachgetragene Walks berücksichtigen (Nachtrag am Folgetag). */
const CHALLENGE_GRACE_MS = 3 * 24 * 3600 * 1000;

/* ------------------------------------------------------------------ */
/* Zeit in Europe/Berlin                                               */
/* ------------------------------------------------------------------ */

const berlinFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Kalenderdatum in Berlin + fortlaufende Tagesnummer (Tage seit 1970-01-01). */
export function berlinDate(d: Date) {
  const parts = Object.fromEntries(berlinFmt.formatToParts(d).map((p) => [p.type, p.value]));
  const y = Number(parts.year);
  const m = Number(parts.month);
  const day = Number(parts.day);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, day) / 86400000);
  /** 0 = Montag … 6 = Sonntag */
  const weekday = (dayNumber + 3) % 7;
  return { y, m, d: day, dayNumber, weekday };
}

/** Wochennummer (fortlaufend, Woche beginnt Montag) für Serien wie week_streak_4. */
export const berlinWeekNumber = (d: Date) => Math.floor((berlinDate(d).dayNumber + 3) / 7);

/** UTC-Zeitpunkt von Mitternacht (Berlin) an einem Kalendertag. */
export function berlinMidnight(y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d);
  const p = berlinDate(new Date(guess));
  const parts = Object.fromEntries(berlinFmt.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, Number(parts.hour), Number(parts.minute), Number(parts.second));
  const offset = asUtc - guess; // +1 h oder +2 h
  return new Date(guess - offset);
}

/* ------------------------------------------------------------------ */
/* Statistik einer Person                                              */
/* ------------------------------------------------------------------ */

export interface UserStats {
  walksCount: number;
  totalKm: number;
  groupWalksCount: number;
  longestKm: number;
  /** verschiedene Orte (Stadt + Landkreis) */
  places: number;
  /** Landkreise mit mindestens einem Walk */
  districts: string[];
  /** längste Serie aufeinanderfolgender Kalenderwochen mit mind. einem Walk */
  bestWeekStreak: number;
  completedChallenges: number;
}

export async function userStats(userId: string): Promise<UserStats> {
  const rows = await db
    .select({
      startedAt: activities.startedAt,
      distanceKm: activities.distanceKm,
      source: activities.source,
      city: activities.city,
      district: activities.district,
    })
    .from(activities)
    .where(eq(activities.userId, userId));
  const places = new Set<string>();
  const districts = new Set<string>();
  const weeks = new Set<number>();
  let totalKm = 0;
  let longestKm = 0;
  let groupWalksCount = 0;
  for (const r of rows) {
    totalKm += r.distanceKm;
    longestKm = Math.max(longestKm, r.distanceKm);
    if (r.source === 'group') groupWalksCount++;
    if (r.city) places.add(`${r.city}|${r.district ?? ''}`);
    if (r.district) districts.add(r.district);
    weeks.add(berlinWeekNumber(r.startedAt));
  }
  const sorted = [...weeks].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const [done] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(challengeParticipants)
    .where(and(eq(challengeParticipants.userId, userId), sql`${challengeParticipants.completedAt} is not null`));
  return {
    walksCount: rows.length,
    totalKm: Math.round(totalKm * 100) / 100,
    groupWalksCount,
    longestKm,
    places: places.size,
    districts: [...districts].sort(),
    bestWeekStreak: best,
    completedChallenges: done?.n ?? 0,
  };
}

/**
 * Fortschritt je Abzeichen: { current, target } oder null (Abzeichen ohne Zählwert).
 * Gleichzeitig Grundlage der Vergabe: erreicht = current >= target.
 */
export function badgeProgress(key: string, s: UserStats): { current: number; target: number } | null {
  const km = (n: number) => Math.round(n * 10) / 10;
  switch (key) {
    case 'first_walk':
      return { current: Math.min(s.walksCount, 1), target: 1 };
    case 'first_5k':
      return { current: km(Math.min(s.longestKm, 5)), target: 5 };
    case 'first_10k':
      return { current: km(Math.min(s.longestKm, 10)), target: 10 };
    case 'total_50k':
      return { current: km(Math.min(s.totalKm, 50)), target: 50 };
    case 'total_100k':
      return { current: km(Math.min(s.totalKm, 100)), target: 100 };
    case 'total_500k':
      return { current: km(Math.min(s.totalKm, 500)), target: 500 };
    case 'walks_10':
      return { current: Math.min(s.walksCount, 10), target: 10 };
    case 'walks_50':
      return { current: Math.min(s.walksCount, 50), target: 50 };
    case 'walks_100':
      return { current: Math.min(s.walksCount, 100), target: 100 };
    case 'first_group_walk':
      return { current: Math.min(s.groupWalksCount, 1), target: 1 };
    case 'group_walks_10':
      return { current: Math.min(s.groupWalksCount, 10), target: 10 };
    case 'group_walks_50':
      return { current: Math.min(s.groupWalksCount, 50), target: 50 };
    case 'week_streak_4':
      return { current: Math.min(s.bestWeekStreak, 4), target: 4 };
    case 'challenge_done':
      return { current: Math.min(s.completedChallenges, 1), target: 1 };
    case 'places_3':
      return { current: Math.min(s.places, 3), target: 3 };
    case 'places_10':
      return { current: Math.min(s.places, 10), target: 10 };
    default:
      return null; // group_founder, inviter: vergibt Paket A
  }
}

/** Abzeichen, die sich aus den Walks ergeben (ohne challenge_done – das vergibt der Abschluss). */
const ACTIVITY_BADGES = BADGES.map((b) => b.key).filter((k) => !['group_founder', 'inviter', 'challenge_done'].includes(k));

/* ------------------------------------------------------------------ */
/* Punkte und Abzeichen                                                */
/* ------------------------------------------------------------------ */

/** Punkte gutschreiben (idempotent). Gibt die tatsächlich neu vergebenen Punkte zurück. */
async function addPoints(userId: string, reason: string, ref: string, amount: number): Promise<number> {
  const rows = await db
    .insert(pointsLedger)
    .values({ userId, reason, ref, amount })
    .onConflictDoNothing()
    .returning({ amount: pointsLedger.amount });
  return rows[0]?.amount ?? 0;
}

/** Vergibt ein Abzeichen inkl. Punkte und Benachrichtigung. Gibt vergebene Punkte zurück, -1 = schon vorhanden. */
async function grantBadge(userId: string, badgeKey: string, label?: string): Promise<number> {
  const rows = await db
    .insert(userBadges)
    .values({ userId, badgeKey, label: label ?? null })
    .onConflictDoNothing()
    .returning({ key: userBadges.badgeKey });
  if (!rows.length) return -1;
  const pts = await addPoints(userId, 'badge', badgeKey, POINTS.badge);
  await notify(userId, 'badge', { key: badgeKey, label: label ?? null });
  return pts;
}

/** Einzelnes Abzeichen vergeben (idempotent). Gibt true zurück, wenn es neu ist. */
export async function awardBadge(userId: string, badgeKey: string, label?: string): Promise<boolean> {
  return (await grantBadge(userId, badgeKey, label)) >= 0;
}

/* ------------------------------------------------------------------ */
/* Challenges                                                          */
/* ------------------------------------------------------------------ */

type ChallengeRow = typeof challenges.$inferSelect;

/** Fortschritt aus den Walks im Zeitraum der Challenge. */
export async function computeChallengeProgress(ch: ChallengeRow, userId: string): Promise<number> {
  const [r] = await db
    .select({
      n: sql<number>`count(*)::int`,
      sum: sql<number>`coalesce(sum(${activities.distanceKm}), 0)::float8`,
      max: sql<number>`coalesce(max(${activities.distanceKm}), 0)::float8`,
    })
    .from(activities)
    .where(and(eq(activities.userId, userId), gte(activities.startedAt, ch.startsAt), lt(activities.startedAt, ch.endsAt)));
  const v = ch.type === 'walk_count' ? r.n : ch.type === 'single_distance' ? r.max : r.sum;
  return Math.round(Number(v) * 100) / 100;
}

/**
 * Fortschritt einer Teilnahme neu berechnen und ggf. abschließen
 * (Punkte, Abzeichen `challenge_done`, Benachrichtigung `challenge_done`).
 */
export async function refreshParticipation(
  ch: ChallengeRow,
  userId: string,
): Promise<{ completed: boolean; points: number; newBadges: string[] }> {
  const progress = await computeChallengeProgress(ch, userId);
  await db
    .update(challengeParticipants)
    .set({ progress })
    .where(and(eq(challengeParticipants.challengeId, ch.id), eq(challengeParticipants.userId, userId)));
  const out = { completed: false, points: 0, newBadges: [] as string[] };
  if (progress < ch.target) return out;
  const done = await db
    .update(challengeParticipants)
    .set({ completedAt: new Date() })
    .where(
      and(
        eq(challengeParticipants.challengeId, ch.id),
        eq(challengeParticipants.userId, userId),
        isNull(challengeParticipants.completedAt),
      ),
    )
    .returning({ id: challengeParticipants.challengeId });
  if (!done.length) return out;
  out.completed = true;
  out.points += await addPoints(userId, 'challenge', ch.id, ch.points);
  await notify(userId, 'challenge_done', { challengeId: ch.id, title: ch.title });
  const badgePts = await grantBadge(userId, 'challenge_done');
  if (badgePts >= 0) {
    out.points += badgePts;
    out.newBadges.push('challenge_done');
  }
  return out;
}

/** Beigetretene, noch laufende (bzw. gerade beendete) Challenges einer Person. */
async function joinedOpenChallenges(userId: string): Promise<ChallengeRow[]> {
  const rows = await db
    .select({ c: challenges })
    .from(challengeParticipants)
    .innerJoin(challenges, eq(challenges.id, challengeParticipants.challengeId))
    .where(
      and(eq(challengeParticipants.userId, userId), gt(challenges.endsAt, new Date(Date.now() - CHALLENGE_GRACE_MS))),
    );
  return rows.map((r) => r.c);
}

/* ------------------------------------------------------------------ */
/* Einstiegspunkte                                                     */
/* ------------------------------------------------------------------ */

/**
 * Nach jedem neu erfassten Walk (manuell, GPX oder bestätigter Gruppen-Walk) aufrufen.
 * Muss idempotent sein (doppelter Aufruf vergibt nichts doppelt).
 */
export async function onActivityRecorded(userId: string, activityId: string): Promise<AwardResult> {
  const result: AwardResult = { pointsAwarded: 0, newBadges: [], completedChallenges: [] };
  const [act] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
    .limit(1);
  if (!act) return result;

  // 1. Punkte für den Walk (Gruppen-Walk mit Bonus)
  result.pointsAwarded += await addPoints(userId, 'activity', act.id, pointsForActivity(act.distanceKm, act.source === 'group'));

  // 2. Challenges (vor den Abzeichen, damit challenge_done mitgezählt wird)
  for (const ch of await joinedOpenChallenges(userId)) {
    const r = await refreshParticipation(ch, userId);
    result.pointsAwarded += r.points;
    result.newBadges.push(...r.newBadges);
    if (r.completed) result.completedChallenges.push(ch.id);
  }

  // 3. Abzeichen aus allen Walks
  const stats = await userStats(userId);
  for (const key of ACTIVITY_BADGES) {
    const p = badgeProgress(key, stats);
    if (p && p.current >= p.target) {
      const pts = await grantBadge(userId, key);
      if (pts >= 0) {
        result.pointsAwarded += pts;
        result.newBadges.push(key);
      }
    }
  }
  for (const district of stats.districts) {
    const key = `${REGION_BADGE_PREFIX}${district}`;
    const pts = await grantBadge(userId, key, district);
    if (pts >= 0) {
      result.pointsAwarded += pts;
      result.newBadges.push(key);
    }
  }
  return result;
}

/** Nach dem Löschen (oder Ändern) eines Walks: Challenge-Fortschritt neu berechnen. Punkte bleiben. */
export async function onActivityDeleted(userId: string): Promise<void> {
  for (const ch of await joinedOpenChallenges(userId)) {
    const progress = await computeChallengeProgress(ch, userId);
    await db
      .update(challengeParticipants)
      .set({ progress })
      .where(and(eq(challengeParticipants.challengeId, ch.id), eq(challengeParticipants.userId, userId)));
  }
}

/** Punktestand einer Person. */
export async function totalPoints(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${pointsLedger.amount}), 0)::int` })
    .from(pointsLedger)
    .where(eq(pointsLedger.userId, userId));
  return r?.n ?? 0;
}
