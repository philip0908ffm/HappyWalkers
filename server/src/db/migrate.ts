import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, pool } from './index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// funktioniert aus src/db (tsx) und aus dist (gebündelt)
const candidates = [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle')];

export async function runMigrations() {
  const fs = await import('node:fs');
  const folder = candidates.find((c) => fs.existsSync(path.join(c, 'meta', '_journal.json')));
  if (!folder) throw new Error('Migrationsordner nicht gefunden');
  await migrate(db, { migrationsFolder: folder });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => {
      console.log('Migrationen ausgeführt.');
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
