import { createApp } from './app.js';
import { config, isProd } from './config.js';
import { runMigrations } from './db/migrate.js';
import { startJobs } from './jobs.js';

async function main() {
  if (isProd || process.env.RUN_MIGRATIONS === '1') await runMigrations();
  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`Gehmeinsam läuft auf Port ${config.PORT}`);
  });
  startJobs();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
