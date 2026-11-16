# Veröffentlichen auf Railway

## 1. Datenbank bei Neon anlegen
1. Auf https://neon.tech ein Projekt anlegen (Region **Frankfurt / eu-central-1** – Daten bleiben in der EU).
2. Unter „Connection Details“ die **Pooled connection** kopieren, z. B.
   `postgresql://user:pass@ep-xyz-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`

## 2. E-Mail bei Resend einrichten
1. Auf https://resend.com die eigene Domain hinzufügen und die DNS-Einträge (SPF, DKIM) setzen.
2. Einen API-Schlüssel erzeugen (Berechtigung „Sending access“).

## 3. Railway-Dienst anlegen
1. Neues Projekt → „Deploy from GitHub repo“ → dieses Repository.
2. Railway erkennt `railway.json`: Build `npm ci && npm run build`, Start `npm start`,
   Gesundheitsprüfung `/api/v1/health`.
3. **Volume** hinzufügen (für Fotos), Einhängepunkt z. B. `/data`.
4. Variablen setzen:

| Variable | Wert |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon-URL (pooled) |
| `APP_URL` | öffentliche Adresse, z. B. `https://gehmeinsam.up.railway.app` oder eigene Domain |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | Schlüssel von Resend |
| `EMAIL_FROM` | z. B. `Gehmeinsam <hallo@ihre-domain.de>` |
| `UPLOAD_DIR` | `/data/uploads` |
| `SMS_PROVIDER` | `none` (bis ein SMS-Anbieter angebunden ist) |
| `BILLING_PROVIDER` | `none` (bis ein Zahlungsanbieter angebunden ist; `dev` nur zum Testen!) |
| `TRUSTED_ORIGINS` | später z. B. die Herkunft der Mobil-App |

`PORT` setzt Railway selbst.

## 4. Start
Beim Start führt der Server die Datenbank-Migrationen automatisch aus (`server/drizzle/`).
Startdaten (allgemeine Challenges) einmalig anlegen:

```bash
railway run npm run db:seed
```

## 5. Prüfen
- `https://<APP_URL>/api/v1/health` → `{"ok":true}`
- Anmeldung mit eigener E-Mail-Adresse testen.

## Hinweise
- Allgemeine Monats-Challenges legt der Server selbst an (Hintergrundaufgabe alle 6 Stunden, idempotent);
  `db:seed` ist nur für den allerersten Start nötig.
- Für die spätere Mobil-App: Anmeldung über dieselben `/api/auth/*`-Endpunkte; mit dem
  Better-Auth-Bearer-Plugin liefert die Anmeldung ein Token im Header `set-auth-token`.
