/**
 * Startdaten: allgemeine Challenges (idempotent).
 * Demo-Daten (Gruppen, Walks) nur mit SEED_DEMO=1 bzw. im Test.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, pool } from './index.js';
import { challenges } from './schema.js';

export async function seedBase() {
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  await db
    .insert(challenges)
    .values([
      {
        slug: `5km-eigene-strecke-${now.getUTCFullYear()}`,
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
    .onConflictDoNothing();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
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
