import { createApp } from './app.js';
import { config, isProd } from './config.js';
import { runMigrations } from './db/migrate.js';
import { seedBase } from './db/seed.js';
import { registerJob, startJobs } from './jobs.js';
import { seedAdmins } from './services/seed-admins.js';

async function main() {
  if (isProd || process.env.RUN_MIGRATIONS === '1') await runMigrations();
  // Start-Konten mit Admin-Rolle aus ADMIN_EMAILS (idempotent). Ein Fehler hier verhindert den Start nicht.
  await seedAdmins().catch((err) => console.error('Admin-Konten konnten nicht eingerichtet werden:', (err as Error)?.message));
  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`${config.APP_NAME} läuft auf Port ${config.PORT}`);
  });
  // allgemeine Challenges (z. B. für den neuen Monat) automatisch anlegen – idempotent
  registerJob({ name: 'challenges', everyMs: 6 * 60 * 60 * 1000, run: seedBase });
  startJobs();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
