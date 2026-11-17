# Veröffentlichen auf Railway

## 1. Datenbank bei Neon anlegen
1. Auf https://neon.tech ein Projekt anlegen (Region **Frankfurt / eu-central-1** – Daten bleiben in der EU).
2. Unter „Connection Details“ die **Pooled connection** kopieren, z. B.
   `postgresql://user:pass@ep-xyz-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`

## 2. E-Mail bei Resend einrichten
1. Auf https://resend.com die eigene Domain hinzufügen und die DNS-Einträge (SPF, DKIM) setzen.
2. Einen API-Schlüssel erzeugen (Berechtigung „Sending access“).

## 3. Railway-Dienst anlegen
1. Neues Projekt → „Deploy from GitHub repo“ → dieses Repository, Branch `main`.
2. **Nur EIN Dienst.** Railway erkennt die Unterordner `web` und `server` evtl. als zwei Projekte
   und legt zwei Dienste an. Den Dienst für `web` löschen; beim verbleibenden Dienst unter
   *Settings → Source* das **Root Directory leer** lassen (Repository-Wurzel), nicht `server`.
   Der Server liefert API und Weboberfläche gemeinsam aus.
3. Railway liest `railway.json`: Build `npm install --include=dev --no-audit --no-fund && npm run build`, Start `npm start`,
   Gesundheitsprüfung `/api/v1/health`. (`npm install --include=dev` statt `npm ci`: Railpack hat die Pakete schon installiert und bindet einen
   Zwischenspeicher unter `web/node_modules/.vite` ein, den `npm ci` nicht löschen kann (Fehler `EBUSY`).
   `--include=dev` ist nötig, weil `NODE_ENV=production`
   sonst die Bauwerkzeuge TypeScript/Vite/tsup weglässt.) Eigene Build-/Start-Befehle in den
   Railway-Einstellungen leer lassen bzw. entfernen.
4. **Volume** hinzufügen (für Fotos), Einhängepunkt z. B. `/data`.
5. Variablen setzen:

| Variable | Wert |
|---|---|
| `NODE_ENV` | `production` |
| `APP_NAME` | optional, Projektname (Standard: `HappyWalkers`) – gilt für Oberfläche, E-Mails, Urkunden; nach Änderung neu deployen |
| `DATABASE_URL` | Neon-URL (pooled) |
| `APP_URL` | nur bei eigener Domain nötig, z. B. `https://happywalkers.de` – sonst wird die Railway-Domain automatisch verwendet (unter *Settings → Networking* „Generate Domain“ klicken) |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | Schlüssel von Resend |
| `EMAIL_FROM` | **Pflicht**, z. B. `HappyWalkers <hallo@ihre-domain.de>` – Domain muss bei Resend bestätigt sein |
| `UPLOAD_DIR` | `/data/uploads` |
| `SMS_PROVIDER` | `none` (bis ein SMS-Anbieter angebunden ist) |
| `BILLING_PROVIDER` | `none` (bis ein Zahlungsanbieter angebunden ist; `dev` nur zum Testen!) |
| `TRUSTED_ORIGINS` | später z. B. die Herkunft der Mobil-App |

`PORT` setzt Railway selbst.

## Wenn das Deployment fehlschlägt
Im Railway-Protokoll (*Deployments → View Logs → Deploy Logs*) steht dann eine Zeile
„HappyWalkers kann in Produktion nicht starten …“ mit den fehlenden Variablen. Häufige Ursachen:
- `BETTER_AUTH_SECRET` fehlt oder ist kürzer als 32 Zeichen
- `RESEND_API_KEY` oder `EMAIL_FROM` fehlt
- Build schlägt fehl: eigener Build-Befehl ohne `--include=dev` in den Railway-Einstellungen, oder Root Directory steht auf `web`/`server`
- keine öffentliche Domain erzeugt und keine `APP_URL` gesetzt
- `BILLING_PROVIDER=dev` aus `.env.example` übernommen (in Produktion nicht erlaubt – Variable weglassen)
- `SMS_PROVIDER=console` übernommen (in Produktion nicht erlaubt – Variable weglassen)
- `DATABASE_URL` ohne `?sslmode=require`

## 4. Start
Beim Start führt der Server die Datenbank-Migrationen automatisch aus (`server/drizzle/`) und legt
die allgemeinen Challenges selbst an (auch jeden neuen Monat). Ein eigener Seed-Schritt ist nicht nötig.

## 5. Prüfen
- `https://<APP_URL>/api/v1/health` → `{"ok":true}`
- Anmeldung mit eigener E-Mail-Adresse testen.

## Hinweise
- Für die spätere Mobil-App: Anmeldung über dieselben `/api/auth/*`-Endpunkte; mit dem
  Better-Auth-Bearer-Plugin liefert die Anmeldung ein Token im Header `set-auth-token`.
