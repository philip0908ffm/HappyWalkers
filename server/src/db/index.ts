import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config, isProd } from '../config.js';
import * as schema from './schema.js';

/**
 * Verbindung zu PostgreSQL. In Produktion: Neon (pooled connection string, SSL).
 * Neon ist voll Postgres-kompatibel, daher genügt der Standardtreiber `pg`.
 */
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: isProd ? 10 : 5,
  ssl: /sslmode=require|neon\.tech/.test(config.DATABASE_URL) ? { rejectUnauthorized: true } : undefined,
});

export const db = drizzle(pool, { schema, casing: 'snake_case' });
export type DB = typeof db;
export { schema };
