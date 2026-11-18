#!/usr/bin/env bash
# Startet den API-Server für die End-to-End-Tests mit frischer Datenbank.
set -euo pipefail
cd "$(dirname "$0")/../server"
export NODE_ENV=test DATABASE_URL="${DATABASE_URL:-postgres://happywalkers:happywalkers@localhost:5432/happywalkers_e2e}"
export PORT=3100 APP_URL=http://localhost:5174 SMS_PROVIDER=console BILLING_PROVIDER=dev UPLOAD_DIR=/tmp/happywalkers-e2e-uploads
export E2E_MAILBOX=1 SEED_DEMO=1
# Start-Konto mit Admin-Rolle (nur Testwerte, siehe e2e/verwaltung.spec.ts)
export ADMIN_EMAILS="${E2E_ADMIN_EMAIL:-verwaltung@example.org}" ADMIN_INITIAL_PASSWORD="${E2E_ADMIN_PASSWORD:-E2e-Verwaltung-2026}"
node -e "
const pg=require('pg');const c=new pg.Client({connectionString:process.env.DATABASE_URL});
c.connect().then(()=>c.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;')).then(()=>c.end());
"
npx tsx src/db/migrate.ts
npx tsx src/db/seed.ts
exec npx tsx src/index.ts
