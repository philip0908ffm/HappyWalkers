# Gehmeinsam

Gemeinsam zügig gehen – eine Community-Plattform für Menschen ab 50.
Walks in der Nähe finden, Gruppen gründen, Walks eintragen, Abzeichen sammeln.

- Technik: Node.js 22, Express 5, Better Auth, Drizzle ORM, PostgreSQL (Neon), Resend, React + Vite
- Dokumentation: [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md), [`docs/API.md`](docs/API.md),
  [`docs/PLAN.md`](docs/PLAN.md)

## Schnellstart

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Die Oberfläche läuft dann auf http://localhost:5173, die API auf http://localhost:3000.
