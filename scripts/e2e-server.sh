#!/usr/bin/env bash
# Startet den API-Server für die End-to-End-Tests mit frischer Datenbank.
set -euo pipefail
cd "$(dirname "$0")/../server"
export NODE_ENV=test DATABASE_URL="${DATABASE_URL:-postgres://gehmeinsam:gehmeinsam@localhost:5432/gehmeinsam_e2e}"
export PORT=3100 APP_URL=http://localhost:5174 SMS_PROVIDER=console BILLING_PROVIDER=dev UPLOAD_DIR=/tmp/gehmeinsam-e2e-uploads
export E2E_MAILBOX=1 SEED_DEMO=1
node -e "
const pg=require('pg');const c=new pg.Client({connectionString:process.env.DATABASE_URL});
c.connect().then(()=>c.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;')).then(()=>c.end());
"
npx tsx src/db/migrate.ts
npx tsx src/db/seed.ts
exec npx tsx src/index.ts
