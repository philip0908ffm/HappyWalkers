import { execSync } from 'node:child_process';

/**
 * Test-Datenbank frisch aufsetzen. Das Schema wird direkt aus src/db/schema.ts übernommen
 * (drizzle-kit push), damit Schemaänderungen sofort testbar sind.
 * Eigene Datenbank pro Person/Agent über TEST_DATABASE_URL.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://gehmeinsam:gehmeinsam@localhost:5432/gehmeinsam_test';
  const pg = await import('pg');
  const client = new pg.default.Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await client.end();
  execSync('npx drizzle-kit push --force', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' },
  });
  execSync('npx tsx src/db/seed.ts', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' } });
}
