# Architektur „HappyWalkers“

Verantwortlich: Lena Hoffmann (Projektleitung)

## Überblick

```
Browser (React-SPA)  ──┐
                       ├──>  Node.js-Server (Express 5)  ──>  PostgreSQL (Neon)
iOS/Android (später) ──┘        │  /api/auth/*  Better Auth (Magic Link, SMS-Code, Bearer)
                                │  /api/v1/*    fachliche JSON-API
                                │  /*           gebaute Weboberfläche (web/dist)
                                ├──> Resend (E-Mails)
                                └──> Datei-Speicher (Railway-Volume, UPLOAD_DIR)
```

- **Ein Dienst auf Railway** liefert API und Weboberfläche aus (gleiche Herkunft → einfache,
  sichere Cookies ohne CORS). Die Mobil-App nutzt dieselbe API mit Bearer-Token.
- **Neon** wird über den Standardtreiber `pg` mit der „pooled“ Verbindung angesprochen.
- **Keine Drittanbieter im Browser** außer den Kartenkacheln (OpenStreetMap, austauschbar über
  `MAP_TILE_URL`). Schrift (Atkinson Hyperlegible) wird selbst ausgeliefert. Keine Tracking-Cookies
  → kein Cookie-Banner nötig (nur technisch notwendiges Sitzungs-Cookie).
- **PLZ-Suche ohne externe Dienste**: GeoNames-Daten liegen in `server/data/plz-de.json`.

## Verzeichnisse

| Pfad | Inhalt |
|---|---|
| `shared/src` | gemeinsame Konstanten (Tempo, Abzeichen, Punkte, Grenzwerte) für Server, Web, später Mobil |
| `server/src/app.ts` | Express-App, Sicherheits-Header, Modul-Einbindung |
| `server/src/auth.ts` | Better Auth (Magic Link 20 min, SMS-Code, Sitzung 90 Tage) |
| `server/src/db/schema.ts` | Datenbankschema (Drizzle). Migrationen in `server/drizzle/` |
| `server/src/lib/access.ts` | **zentrale Zugriffsregeln** (Treffpunkt, Sichtbarkeit, Blockieren) |
| `server/src/modules/*.ts` | ein Router je Bereich (siehe `docs/API.md`) |
| `server/src/services/*.ts` | Logik, die mehrere Module brauchen (Punkte/Abzeichen, Benachrichtigungen, Speicher) |
| `server/test/` | API-Tests (vitest + supertest, echte Postgres-Test-DB) |
| `web/src/pages/<bereich>/` | Seiten je Bereich |
| `web/src/components/` | wiederverwendbare, barrierefreie Bausteine |
| `web/src/i18n/locales/<sprache>/<bereich>.json` | Texte; `du/` enthält nur abweichende „Du“-Texte |
| `e2e/` | Playwright-Tests inkl. axe-Barrierefreiheitsprüfung |

## Projektname
Der Name steht an genau einer Stelle: `shared/src/brand.ts` (`DEFAULT_APP_NAME`) und ist mit der
Umgebungsvariable `APP_NAME` überschreibbar. Server: `config.APP_NAME`; Oberfläche: `APP_NAME` aus
`web/src/lib/brand.ts` (beim Bauen eingesetzt) und `{{appName}}` in allen i18n-Texten; Browser-Titel über
`%APP_NAME%` in `web/index.html`. **Den Namen nie fest in Texte schreiben.**

## Entscheidungen

1. **Express 5 + Drizzle statt Framework** – wenig Magie, gut testbar, läuft überall.
2. **REST/JSON mit stabilen Fehlercodes** – Oberfläche und Mobil-App übersetzen selbst.
3. **Anrede als Pseudo-Sprache „du“** mit Rückfall auf „de“ – nur abweichende Texte pflegen;
   neue Sprachen (tr, ru) als weitere Ordner.
4. **Idempotente Aktionen** (Primärschlüssel auf Zusagen, Herzen, Mitgliedschaften, Punktebuch)
   → doppeltes Klicken richtet keinen Schaden an.
5. **Fotos werden neu kodiert** (sharp) → EXIF/GPS-Daten entfernt; Auslieferung nur mit Zugriffsprüfung.
6. **Treffpunkt getrennt vom ungefähren Ort**: Suchen/Karten zeigen nur den Gruppen-/PLZ-Mittelpunkt;
   der genaue Treffpunkt nur für bestätigte Mitglieder.
7. **Premium-Abrechnung** hinter einer Anbieter-Schnittstelle (`BILLING_PROVIDER`). Für den Start
   „dev“; ein echter Anbieter (z. B. Stripe, Mollie) wird dort angebunden. Kein Probeabo.
8. **SMS** hinter `server/src/lib/sms.ts`; ohne Anbieter wird die SMS-Anmeldung ausgeblendet.

## Lokale Entwicklung

```bash
cp .env.example .env          # Werte anpassen
npm install
npm run db:migrate && npm run db:seed
npm run dev                   # Server :3000, Oberfläche :5173
```

Ohne `RESEND_API_KEY` erscheinen Anmelde-Links im Terminal des Servers.
