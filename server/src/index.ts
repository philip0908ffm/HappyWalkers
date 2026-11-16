import { createApp } from './app.js';
import { config, isProd } from './config.js';
import { runMigrations } from './db/migrate.js';
import { seedBase } from './db/seed.js';
import { registerJob, startJobs } from './jobs.js';

async function main() {
  if (isProd || process.env.RUN_MIGRATIONS === '1') await runMigrations();
  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`Gehmeinsam läuft auf Port ${config.PORT}`);
  });
  // allgemeine Challenges (z. B. für den neuen Monat) automatisch anlegen – idempotent
  registerJob({ name: 'challenges', everyMs: 6 * 60 * 60 * 1000, run: seedBase });
  startJobs();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
