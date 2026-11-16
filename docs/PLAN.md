# Arbeitsplan (Lena Hoffmann)

## Team

| Name | Rolle | Agent-Datei |
|---|---|---|
| Lena Hoffmann | Projektleitung, Planung, API-Vertrag, Abnahme | `.claude/agents/lena-projektleitung.md` |
| Jonas Weber | Entwicklung Backend + Oberfläche | `.claude/agents/jonas-entwicklung.md` |
| Aylin Demir | Sicherheit & Datenschutz | `.claude/agents/aylin-sicherheit.md` |
| Miriam Schulz | Gestaltung, Bedienbarkeit, Barrierefreiheit | `.claude/agents/miriam-design.md` |
| Thomas Becker | Tests & Qualität | `.claude/agents/thomas-test.md` |

## Phase 0 – Grundgerüst (erledigt)
- [x] Monorepo, Express, Better Auth (Magic Link, SMS-Code, Bearer), Drizzle-Schema, Resend
- [x] Zugriffsregeln `lib/access.ts`, Speicher (EXIF-Entfernung), ICS, PLZ-Daten
- [x] Oberfläche: Gestaltungsgrundlagen, Navigation (5 Punkte), Schriftgröße, Sie/Du, i18n,
      Anmeldung, Willkommen, Einstellungen (Export, Löschen)
- [x] Tests: API (vitest), End-to-End mit axe (Playwright)

## Phase 1 – Funktionen (parallel, feste Dateizuständigkeit)

| Paket | Wer | Dateien |
|---|---|---|
| A Backend: Gruppen, Walks, Einladungen, ländliche Regionen | Jonas (A) | `server/src/modules/{groups,walks,invites,rural}.ts`, `server/src/services/{interest,series}.ts`, `server/src/db/seed-demo.ts`, `server/test/{groups,walks,invites,rural}.test.ts` |
| B Backend: Eintragen, Punkte, Abzeichen, Challenges, Premium | Jonas (B) | `server/src/modules/{activities,badges,challenges,premium}.ts`, `server/src/services/gamification.ts`, `server/src/lib/gpx.ts`, `server/test/{activities,badges,challenges,premium}.test.ts` |
| C Backend: Soziales, Fotos, Benachrichtigungen | Jonas (C) | `server/src/modules/{social,photos,notifications}.ts`, `server/test/{social,photos}.test.ts` |
| D Oberfläche: Start, Walks, Gruppen, Einladung, Karte | Miriam | `web/src/pages/{Home.tsx,walks/*,groups/*}`, `web/src/components/*` (neue Bausteine), `web/src/styles/*`, i18n `home, walks, groups` |
| E Oberfläche: Eintragen, Abzeichen, Profil, Personen, ländlich, Premium | Jonas (E) | `web/src/pages/{activities,badges,profile,rural,premium}/*` (außer `profile/Settings.tsx`), i18n `activities, badges, people, rural, premiumPage, notifications` |
| F Datenschutz-Inhalte | Aylin | `web/src/pages/info/*`, i18n `info`, `docs/WER-SIEHT-WAS.md`, `docs/SICHERHEIT.md` |

Regeln für alle:
- `docs/API.md` ist verbindlich. Abweichungen dort eintragen.
- Schemaänderungen nur in `server/src/db/schema.ts` an eigenen Tabellen, **keine** Migrationen
  erzeugen (das macht Lena gesammelt). Tests nutzen `drizzle-kit push` auf eigener Test-DB.
- Gemeinsame Dateien (`app.ts`, `schema.ts` fremder Tabellen, `common.json`, `components.css`)
  nur nach Absprache.

## Phase 2 – Prüfen
- Thomas: API-Tests über alle Pakete, End-to-End-Abläufe der Leit-Persona, axe auf allen Seiten,
  200 % Zoom, Tablet.
- Aylin: Sicherheitsprüfung (Zugriff, Uploads, Anmeldung, Header), Befunde beheben.
- Miriam: Barrierefreiheitsprüfung aller Seiten.

## Phase 3 – Abschluss
- Migration erzeugen, Railway-Anleitung, README, Abnahme durch Lena.
