/**
 * Startdaten: allgemeine Challenges (idempotent).
 * Demo-Daten (Gruppen, Walks) nur mit SEED_DEMO=1 bzw. im Test.
 */
import { sql } from 'drizzle-orm';
import path from 'node:path';
import { berlinParts, berlinToUtc } from '../services/series.js';
import { db, pool } from './index.js';
import { challenges } from './schema.js';

/**
 * Zeiträume der allgemeinen Challenges: Monats-/Jahresgrenzen um Mitternacht **Berliner Zeit**
 * (nicht UTC – sonst begänne der Monat erst um 1 bzw. 2 Uhr nachts). `endsAt` ist exklusiv
 * (= Mitternacht des Folgetags); die Oberfläche zeigt den Tag davor als letzten Tag.
 * Monat 1–12; Überlauf (13 → Januar des Folgejahres) ist erlaubt.
 */
export function challengePeriods(now = new Date()) {
  const { year, month } = berlinParts(now);
  const midnight = (y: number, m: number) => berlinToUtc(y, m, 1, '00:00');
  return {
    year,
    monthKey: `${year}-${String(month).padStart(2, '0')}`,
    yearStart: midnight(year, 1),
    yearEnd: midnight(year + 1, 1),
    monthStart: midnight(year, month),
    monthEnd: month === 12 ? midnight(year + 1, 1) : midnight(year, month + 1),
  };
}

export async function seedBase() {
  const { year, monthKey, yearStart, yearEnd, monthStart, monthEnd } = challengePeriods();
  await db
    .insert(challenges)
    .values([
      {
        slug: `5km-eigene-strecke-${year}`,
        title: '5 km auf Ihrer eigenen Strecke',
        summary: 'Gehen Sie einmal 5 Kilometer am Stück – wo und wann Sie möchten.',
        type: 'single_distance',
        target: 5,
        scope: 'everyone',
        startsAt: yearStart,
        endsAt: yearEnd,
        points: 50,
      },
      {
        slug: `10-walks-${monthKey}`,
        title: '10 Walks in diesem Monat',
        summary: 'Tragen Sie in diesem Monat 10 Walks ein – egal wie lang.',
        type: 'walk_count',
        target: 10,
        scope: 'everyone',
        startsAt: monthStart,
        endsAt: monthEnd,
        points: 80,
      },
      {
        slug: `50km-${monthKey}`,
        title: '50 Kilometer im Monat',
        summary: 'Sammeln Sie in diesem Monat zusammen 50 Kilometer.',
        type: 'total_distance',
        target: 50,
        scope: 'everyone',
        startsAt: monthStart,
        endsAt: monthEnd,
        points: 100,
      },
    ])
    // gleiche slugs → idempotent; früher (UTC) angelegte Zeiträume werden auf Berliner Zeit korrigiert
    .onConflictDoUpdate({
      target: challenges.slug,
      set: { startsAt: sql`excluded.starts_at`, endsAt: sql`excluded.ends_at` },
    });
}

// Nur als eigenes Skript ausführen (nicht, wenn die Datei in den Server gebündelt ist)
if (process.argv[1] && path.basename(process.argv[1]).startsWith('seed')) {
  seedBase()
    .then(async () => {
      if (process.env.SEED_DEMO === '1') {
        const mod = await import('./seed-demo.js');
        await mod.seedDemo();
      }
      console.log('Startdaten angelegt.');
      await pool.end();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
