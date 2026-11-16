# Gehmeinsam

Gemeinsam zügig gehen – eine Community-Plattform für Menschen ab 50.
Walks in der Nähe finden, Gruppen gründen, Walks eintragen, Abzeichen sammeln. Barrierefrei (WCAG 2.2 AA),
datensparsam (DSGVO), ohne Tracking-Cookies.

**Technik:** Node.js 22, Express 5, Better Auth (Magic Link, SMS-Code, Bearer für die spätere Mobil-App),
Drizzle ORM, PostgreSQL (Neon), Resend, React + Vite, Leaflet. Betrieb auf Railway.

## Dokumentation
| Datei | Inhalt |
|---|---|
| [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) | Aufbau, Entscheidungen, lokale Entwicklung |
| [`docs/API.md`](docs/API.md) | API-Vertrag `/api/v1` (auch für die Mobil-App) |
| [`docs/WER-SIEHT-WAS.md`](docs/WER-SIEHT-WAS.md) | Sichtbarkeitsregeln |
| [`docs/SICHERHEIT.md`](docs/SICHERHEIT.md) | Bedrohungsmodell, Befunde, Status |
| [`docs/DEPLOY-RAILWAY.md`](docs/DEPLOY-RAILWAY.md) | Veröffentlichen mit Railway, Neon, Resend |
| [`docs/PLAN.md`](docs/PLAN.md) | Team, Arbeitspakete, offene Punkte |

## Team (Claude-Agenten in `.claude/agents/`)
Lena Hoffmann (Projektleitung) · Jonas Weber (Entwicklung) · Aylin Demir (Sicherheit & Datenschutz) ·
Miriam Schulz (Design & Barrierefreiheit) · Thomas Becker (Tests)

## Schnellstart
```bash
cp .env.example .env
npm install
npm run db:migrate
SEED_DEMO=1 npm run db:seed
npm run dev
```
Oberfläche: http://localhost:5173 · API: http://localhost:3000. Ohne `RESEND_API_KEY` erscheinen
Anmelde-Links im Terminal des Servers.

## Tests
```bash
npm test                 # API-Tests (vitest, echte Postgres-Test-DB) + Oberflächen-Tests
npm run test:e2e         # Playwright: Abläufe, axe-Barrierefreiheit, 200 % Zoom, Tablet
```
