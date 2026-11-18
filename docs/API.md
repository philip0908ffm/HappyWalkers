# API-Vertrag „HappyWalkers“ (v1)

Verbindlich für Backend (Jonas) und Oberfläche (Miriam, Jonas). Dieselbe API nutzt später die
iOS/Android-App. Verantwortlich: Lena Hoffmann. Änderungen nur zusammen mit dieser Datei.

## Grundregeln

- Basis: `/api/v1`, JSON. Anmeldung über `/api/auth/*` (Better Auth).
- Anmeldung im Browser per Cookie; Mobil-App per `Authorization: Bearer <token>` (Better-Auth-Plugin `bearer`).
- Fehler: HTTP-Status + `{ "error": { "code": "snake_case", "details"?: [...] } }`.
  Die Oberfläche übersetzt `code` über i18n (`errors.<code>`). Codes siehe unten je Bereich.
  `invalid_input` hat `details: [{ field, code, message }]`.
- Zeiten: ISO 8601 in UTC (`2026-11-17T09:00:00.000Z`). Anzeige in `Europe/Berlin`.
- Entfernungen in km (Zahl), Dauer in Minuten (ganze Zahl).
- Schreibende Aktionen sind **idempotent**, wo ein Doppelklick passieren kann (Zusagen, Beitreten,
  Herz, Folgen, Challenge beitreten, Walk bestätigen). Zweiter Aufruf → gleiches Ergebnis, kein Fehler.
- Listen mit Seiten: `?limit=20&cursor=<opak>` → `{ items..., nextCursor: string | null }`.
- **Niemals** an andere Personen ausliefern: E-Mail, Telefonnummer, Geburtsjahr, Geschlecht,
  genaue Koordinaten des Wohnorts. Personen erscheinen als `PersonRef`.
- Bilder werden nie über öffentliche Ordner ausgeliefert, sondern über Routen mit Zugriffsprüfung.

### Gemeinsame Typen

```ts
PersonRef = { id: string; displayName: string; avatarUrl: string | null }
Place     = { postalCode, city, district, state, lat, lon }
Tempo     = 'gemuetlich' | 'zuegig' | 'flott'
Visibility = 'private' | 'group' | 'followers' | 'public'
AwardResult = { pointsAwarded: number; newBadges: string[]; completedChallenges: string[] }
```

Ortsangabe in Suchen: entweder `postalCode=34117` oder `lat=..&lon=..` (Browser-Standort, freiwillig);
ohne beides wird die PLZ aus dem Profil genutzt. `radiusKm` ∈ {5, 15, 30, 50}, Standard 15.

---

## Allgemein (fertig)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/health` | `{ ok: true }` |
| GET | `/config` | `{ smsLogin, mapTileUrl, mapAttribution, premium:{priceCents,currency,interval}, billingProvider, locales }` |
| GET | `/geo/postal/:plz` | `{ place: Place }` · 404 `postal_code_unknown` |
| GET | `/geo/search?q=` | `{ places: Place[] }` (Ortsname oder PLZ-Anfang) |

## Anmeldung (Better Auth, `/api/auth/*`) – `server/src/auth.ts`

| Methode | Pfad | Beschreibung |
|---|---|---|
| POST | `/api/auth/sign-in/magic-link` | `{ email, callbackURL, newUserCallbackURL?, errorCallbackURL? }` – einziger Weg, ein Konto per E-Mail anzulegen (5 / 10 min je IP) |
| POST | `/api/auth/sign-in/email` | `{ email, password }` – nur für Konten mit Passwort (z. B. Start-Konten aus `ADMIN_EMAILS`). Falsches Passwort **und** unbekannte Adresse → 401 `INVALID_EMAIL_OR_PASSWORD` (gleiche Antwort); gesperrt → 403 `BANNED_USER`. 5 Versuche / 10 min je IP |
| POST | `/api/auth/sign-up/email` | abgeschaltet (`disableSignUp`) → 400; Registrierung nur per Magic Link / SMS-Code |
| POST | `/api/auth/phone-number/send-otp` · `/verify` | SMS-Code (nur mit SMS-Anbieter) |

Passwörter: mindestens 12, höchstens 128 Zeichen; Hashing durch Better Auth.

## Ich / Konto (fertig) – `server/src/modules/me.ts`

| GET | `/me` | `{ me: Me }` (siehe `web/src/api/types.ts`); `me.isAdmin: boolean` = Rolle `admin` (Verwaltung) |
|---|---|---|
| PATCH | `/me/profile` | `{ displayName?, bio?, postalCode?, birthYear?, gender?, completeOnboarding? }` → `{ me }` |
| PATCH | `/me/settings` | `{ anrede?, locale?, fontScale?, profileVisibility?, leaderboardMode?, emailNotifications? }` → `{ me }` |
| GET | `/me/export` | JSON-Datei mit allen eigenen Daten (Download) |
| DELETE | `/me` | Body `{ confirm: "LÖSCHEN" }` → `{ ok: true }` |
| GET | `/me/groups` | `{ groups: [{ id, name, city, role, status }] }` |

---

## Paket A – Gruppen, Walks, Einladungen, ländliche Regionen

### Typen

```ts
GroupSummary = {
  id, name, city, district, distanceKm: number | null,
  memberCount: number, joinPolicy: 'open'|'request'|'invite', womenOnly: boolean,
  defaultTempo: Tempo, photoUrl: string | null,
  nextWalk: { id, title, startsAt } | null,
  myMembership: { role, status } | null
}
GroupDetail = GroupSummary & {
  description, rules,            // Regeln werden „angeheftet“ oben angezeigt
  leads: (PersonRef & { role: 'founder'|'moderator' })[],
  upcomingWalks: WalkSummary[],  // nächste 8
  series: SeriesSummary[],       // wiederkehrende Termine
  inviteCode: string | null,     // nur für aktive Mitglieder
  canManage: boolean,            // Gruppenleitung
  isFounder: boolean
}
SeriesSummary = { id, title, weekday: 0-6, timeOfDay: 'HH:MM', durationMinutes, tempo, distanceKm, active }
WalkSummary = {
  id, kind: 'group'|'partner'|'distance', title, startsAt, durationMinutes,
  distanceKm: number | null, tempo, city, district,
  lat, lon,                      // UNGEFÄHRER Ort (Gruppen-/PLZ-Mittelpunkt), nie der Treffpunkt
  distanceFromCenterKm: number | null,
  group: { id, name, womenOnly, joinPolicy } | null,
  participantCount, maxParticipants: number | null,
  status: 'planned'|'cancelled', confirmed: boolean,
  myRsvp: 'yes' | null,
  canSeeMeetingPoint: boolean,
  seriesId: string | null
}
WalkDetail = WalkSummary & {
  description,
  meetingPoint: { name, address, description, lat, lon } | null,   // null = nicht berechtigt
  participants: PersonRef[] | null,  // nur für Mitglieder/Teilnehmende, sonst null
  createdBy: PersonRef | null,
  canManage: boolean, canConfirm: boolean   // canConfirm: Leitung und Walk hat begonnen
}
```

### Gruppen – `server/src/modules/groups.ts`

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/groups?postalCode&lat&lon&radiusKm&q` | `{ groups: GroupSummary[], center: Place\|null, nearest: (GroupSummary & {distanceKm})[] }` – `nearest`: bis zu 3 nächste Gruppen AUSSERHALB des Radius (bis 100 km), wenn im Radius < 3 Treffer. Gruppen „nur auf Einladung“ erscheinen nicht in Suchen (nur für Mitglieder unter `/me/groups`). |
| GET | `/groups/templates` | `{ templates: [{ key, name, description, rules, defaultTempo, joinPolicy, series: { weekday, timeOfDay, durationMinutes, tempo } }] }` – Vorlagen für die Gruppengründung |
| POST | `/groups` | `{ name, description, rules, joinPolicy, womenOnly, postalCode, defaultTempo }` → `{ group: GroupDetail }`. Gründerin = `founder`. Vergibt Abzeichen `group_founder`. Löst Interessen-Benachrichtigung aus. `women_only` → Gründerin muss Frau sein. |
| GET | `/groups/:id` | `{ group: GroupDetail }` – Einladungsgruppen: nur für Mitglieder/Eingeladene (sonst 404) |
| PATCH | `/groups/:id` | Leitung; gleiche Felder wie POST (teilweise) → `{ group }` |
| DELETE | `/groups/:id` | nur Gründerin → `{ ok }` |
| POST | `/groups/:id/photo` | Leitung, multipart Feld `photo` → `{ photoUrl }` |
| GET | `/groups/:id/photo` | Bild (JPEG) |
| POST | `/groups/:id/join` | `{ message? }` → `{ membership: { role, status } }`. open → `active`; request → `pending` (Leitung wird benachrichtigt); invite → 403 `invite_only` (nur wer die Gruppe sehen darf, z. B. per E-Mail eingeladen; alle anderen 404 `group_not_found`); gesperrt → 403 `banned`; nur Frauen → 403 `women_only`. Idempotent. |
| POST | `/groups/:id/leave` | → `{ ok }` (Gründerin: 409 `founder_cannot_leave`, erst Leitung übergeben) |
| GET | `/groups/:id/members` | aktive Mitglieder: `{ members: (PersonRef & { role, status, joinedAt, requestMessage? })[] }`. Leitung sieht zusätzlich `pending` und `banned`. Nicht-Mitglieder: 403. |
| PATCH | `/groups/:id/members/:userId` | Leitung: `{ action: 'approve'\|'decline'\|'remove'\|'ban'\|'unban'\|'make_moderator'\|'remove_moderator'\|'make_founder' }`. Moderatorinnen ernennen/abberufen und Gründung übergeben nur Gründerin. `approve` in einer „nur Frauen“-Gruppe → 403 `women_only`, wenn die Person nicht „Frau“ angegeben hat. **Entfernen/Sperren erzeugt keine Benachrichtigung.** → `{ member }` |
| POST | `/groups/join-by-code` | `{ code }` → `{ groupId, membership }`. Code = Einladung: open/invite → active, request → pending. Ratenbegrenzung je IP (gemeinsam mit `/invites/:code`): 30 / 15 min → 429 `rate_limited`. |
| GET | `/groups/:id/invite` | aktive Mitglieder: `{ url, code, whatsappUrl, mailtoUrl }` (`url` = `${APP_URL}/einladung/<code>`) |
| POST | `/groups/:id/invite/email` | aktive Mitglieder: `{ emails: string[] (max 10), message? }` → `{ sent: number }` – E-Mail mit persönlichem Link `/einladung/<token>` (14 Tage gültig). Höchstens 30 Einladungs-Mails je Person in 24 Stunden, sonst 429 `rate_limited`. |
| GET | `/groups/:id/poster` | Mitglieder: `{ group: { name, city, description }, code, url, qrSvg, series: SeriesSummary[], nextWalks: WalkSummary[] }` für den druckbaren Aushang |

### Einladungen – `server/src/modules/invites.ts`

| GET | `/invites/:codeOrToken` | öffentlich: `{ valid: boolean, group: { id, name, city, description, memberCount, womenOnly, photoUrl } \| null }`. Ratenbegrenzung je IP 30 / 15 min (auch `accept`) → 429 `rate_limited` |
|---|---|---|
| POST | `/invites/:codeOrToken/accept` | angemeldet → `{ groupId, membership }` (Einladung umgeht „auf Anfrage“/„nur Einladung“, nicht aber Sperre und „nur Frauen“). Vergibt dem Einladenden Abzeichen `inviter`. Idempotent. |

Ablauf Einladungslink: `/einladung/:code` → nicht angemeldet → Anmeldung mit `weiter=/einladung/:code`
→ nach Registrierung/Profil zurück → „Gruppe beitreten“ → direkt in der Gruppe.

### Walks – `server/src/modules/walks.ts`

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/walks?postalCode&lat&lon&radiusKm&from&to&tempo&groupId&kind` | `{ walks: WalkSummary[], center: Place\|null, nearest: (WalkSummary)[] }` – Standard `from`=jetzt, `to`=+30 Tage, sortiert nach Zeit. Walks von Einladungsgruppen nur für Mitglieder. `kind=distance` liefert „Gemeinsam auf Distanz“-Termine (ohne Ortsfilter). `groupId` ohne Ortsfilter (für Gruppenkalender, auch vergangene mit `from`). `nearest` wie bei Gruppen. |
| GET | `/walks?mine=1` | **Eigene nächste Walks** (Startseite „Meine nächsten Walks“), nur angemeldet (sonst 401): alle Arten (`group`, `partner`, `distance`), **ohne Ortsfilter**, denen ich zugesagt habe (`walk_rsvps.status = 'yes'`) oder die ich erstellt habe; sortiert nach Zeit, höchstens 200. Standard `from` = jetzt − 3 Stunden (laufende Walks bleiben sichtbar), kein Standard-`to`; `kind`/`tempo`/`from`/`to` filtern zusätzlich. Gruppen-Walks nur bei aktiver Mitgliedschaft; Walks blockierter Personen entfallen. Abgesagte Walks sind enthalten (`status: 'cancelled'`), die Startseite blendet sie aus. → `{ walks: WalkSummary[], center: null, nearest: [] }` |
| GET | `/walks/:id` | `{ walk: WalkDetail }` |
| POST | `/walks` | Gruppen-Walk (Leitung) oder „Gemeinsam auf Distanz“ (jede Person): `{ kind: 'group'\|'distance', groupId?, title, description?, startsAt, durationMinutes, distanceKm?, tempo, meetingPointName?, meetingAddress?, meetingDescription?, meetingLat?, meetingLon?, maxParticipants?, recurring?: { weekday, timeOfDay } }` → `{ walk: WalkDetail, seriesId? }`. **Bei Gruppen-Walks (`kind: 'group'`) sind `groupId`, `meetingPointName` und `meetingAddress` Pflicht** (leer/fehlend → 400 `invalid_input`, `details[0].field` = `meetingPointName` bzw. `meetingAddress`); bei „Gemeinsam auf Distanz“ gibt es keinen Treffpunkt. Mit `recurring` (Schalter „Wiederkehrender Termin“) wird eine Serie angelegt und die nächsten 8 Wochen erzeugt; ein Hintergrund-Job erzeugt laufend nach. Löst Interessen-Benachrichtigung aus. |
| PATCH | `/walks/:id` | Leitung/Erstellerin, Felder wie POST → `{ walk }` (Gruppen-Walk: nur die aktuelle Gruppenleitung – eine gesperrte/entfernte Erstellerin nicht mehr; gilt auch für DELETE, Bestätigen, Treffpunkt und Teilnehmerliste) |
| DELETE | `/walks/:id` | absagen (status `cancelled`), Zusagende werden benachrichtigt (in-App + E-Mail) → `{ ok }` |
| PATCH | `/walks/series/:id` | Leitung, Felder der Serie; ändert künftige Termine ohne Zusagen |
| DELETE | `/walks/series/:id` | Serie beenden, künftige Termine absagen |
| PUT | `/walks/:id/rsvp` | `{ status: 'yes'\|'no' }` → `{ myRsvp, participantCount }`. Gruppen-Walk: nur aktive Mitglieder (sonst 403 `not_group_member`); voll → 409 `walk_full`; abgesagt → 409 `walk_cancelled`; vergangen → 409 `walk_in_past`. Idempotent. |
| GET | `/walks/:id/ics` | Kalenderdatei `text/calendar` (Treffpunkt nur, wenn berechtigt; sonst Ort) |
| POST | `/walks/:id/confirm` | Leitung, nach Beginn: `{ distanceKm, durationMinutes, attendeeIds?: string[] }` (Standard: alle Zusagen) → `{ confirmedCount }`. Legt für jede Person einen Eintrag (`activities`, `source: 'group'`, `walkId`) an und ruft `onActivityRecorded` auf. Idempotent (eindeutig je Person+Walk). Benachrichtigung `walk_confirmed`. |

### Ländliche Regionen – `server/src/modules/rural.ts`

| GET | `/rural/overview?postalCode&radiusKm` | `{ center: Place, groupsInRadius: number, walksInRadius: number, nearestGroups: (GroupSummary&{distanceKm})[], nearestTown: { city, distanceKm } \| null, partnersNearby: number, distanceWalks: WalkSummary[], interest: Interest \| null, radiusOptions: [15,30,50] }` – `nearestTown`: nächster Ort mit mindestens einer Gruppe |
|---|---|---|
| GET | `/rural/interest` | `{ interest: { postalCode, city, radiusKm, createdAt } \| null }` |
| PUT | `/rural/interest` | `{ postalCode, radiusKm }` → `{ interest }` – E-Mail, sobald in diesem Umkreis eine Gruppe / ein Walk / ein Gehpartner-Gesuch eingetragen wird (höchstens 1 Mail pro Tag) |
| DELETE | `/rural/interest` | `{ ok }` |
| GET | `/rural/partners?radiusKm` | `{ offers: [{ id, person: PersonRef, city, distanceKm (auf ganze km gerundet), tempo, availability, note, isMine }] }` |
| GET | `/rural/partner-offer` | `{ offer \| null }` eigenes Gesuch |
| PUT | `/rural/partner-offer` | `{ postalCode, tempo, availability, note, active }` → `{ offer }` |
| DELETE | `/rural/partner-offer` | `{ ok }` |
| POST | `/rural/partners/:offerId/request` | `{ message }` → `{ request }` – Anfrage an die Person (in-App + E-Mail, ohne Kontaktdaten preiszugeben). Idempotent je Paar. Höchstens 10 neue Anfragen je Person in 24 Stunden, sonst 429 `rate_limited`. |
| GET | `/rural/partner-requests` | `{ incoming: Req[], outgoing: Req[] }`, `Req = { id, from: PersonRef, to: PersonRef, message, status, walkId, createdAt }` |
| POST | `/rural/partner-requests/:id/accept` | Empfängerin: `{ startsAt, meetingPointName, meetingAddress, meetingDescription?, durationMinutes?, tempo? }` → `{ walkId }` – legt 1:1-Walk (`kind: 'partner'`) mit beiden Zusagen an |
| POST | `/rural/partner-requests/:id/decline` | `{ ok }` (Absenderin wird NICHT aktiv benachrichtigt, sieht nur Status) |

Fehlercodes Paket A: `group_not_found`, `walk_not_found`, `not_group_member`, `not_group_lead`, `not_founder`,
`women_only`, `banned`, `invite_only`, `invite_invalid`, `walk_full`, `walk_cancelled`, `walk_in_past`,
`walk_not_started`, `founder_cannot_leave`, `offer_not_found`, `rate_limited` (429).

#### Umsetzungshinweise Paket A (Stand Umsetzung, Jonas)

- **Anmeldung:** ohne Anmeldung nutzbar sind nur `GET /groups`, `/groups/templates`, `/groups/:id`,
  `/groups/:id/photo`, `GET /walks`, `/walks/:id`, `/walks/:id/ics` und `GET /invites/:codeOrToken`
  (Treffpunkte, Teilnehmerlisten, Einladungscode bleiben dabei verborgen). Alles andere → 401.
- **Einladungscode:** 6 Zeichen nach `WALK-` (z. B. `WALK-4K7P9X`, ohne 0/O/1/I) – 4 Zeichen wären
  für „nur auf Einladung“-Gruppen zu leicht zu erraten. Eingabe ist unempfindlich gegen Groß-/Kleinschreibung,
  Leerzeichen und fehlenden Bindestrich.
- **Ortsangaben:** unbekannte PLZ in Suchen → 400 `postal_code_unknown`; `radiusKm` außerhalb {5,15,30,50} → 400 `invalid_input`.
- **`GET /walks` ohne `kind`:** nur Gruppen-Walks (mit Ortsfilter). `kind=distance` ohne Ortsfilter,
  `kind=partner` liefert nur die eigenen 1:1-Walks.
- **`POST /walks`:** `startsAt` entfällt bei `recurring` (die Serie beginnt ab jetzt; Antwort = erster Termin).
  `recurring` nur bei `kind: 'group'`. Gruppen-Walk: `meetingPointName` und `meetingAddress` Pflicht.
  `startsAt` in der Vergangenheit → 409 `walk_in_past`. „Gemeinsam auf Distanz“: die Erstellerin ist automatisch zugesagt;
  mit `groupId` (nur aktive Mitglieder) erscheint der Termin im Gruppenkalender.
- **`PATCH /walks/series/:id`** → `{ series: SeriesSummary }` (zusätzliches Feld `maxParticipants`).
  Bei geändertem Wochentag/Uhrzeit werden künftige Termine ohne Zusagen neu erzeugt, Termine mit Zusagen bleiben.
  **`DELETE /walks/series/:id`**: künftige Termine mit Zusagen werden abgesagt (mit Nachricht), ohne Zusagen entfallen sie.
  Unbekannte Serie → 404 `walk_not_found`.
- **`PUT /walks/:id/rsvp`:** `walk_cancelled`/`walk_in_past` gelten auch bei bestehender Zusage; nur `walk_full`
  wird bei bestehender Zusage übersprungen (idempotent).
- **`POST /walks/:id/confirm`:** auch für 1:1-Walks (Erstellerin); bei „Gemeinsam auf Distanz“ → 403 `not_group_lead`.
  `attendeeIds` werden auf aktive Mitglieder (bzw. Zusagende) beschränkt. `confirmedCount` = alle Einträge zu diesem Walk.
- **`PATCH /groups/:id/members/:userId`:** nach `remove`, `decline`, `unban` ist `member` = `null`.
  Unbekannte Person → 404 `user_not_found`; Aktion auf sich selbst → 400 `invalid_input`.
  Moderatorinnen dürfen keine andere Leitung entfernen/sperren (403 `not_founder`). `ban` geht auch ohne Mitgliedschaft.
  Austreten (`leave`) hebt eine Sperre nicht auf.
- **`GroupDetail.upcomingWalks`** enthält auch abgesagte Termine (`status: 'cancelled'`), damit Mitglieder Ausfälle sehen.
- **`GET /groups/:id/photo`** ist öffentlich wie Name und Ort der Gruppe (die Einladungsseite zeigt es ohne Anmeldung).
- **`/invites/:token`:** persönlicher E-Mail-Link ist nach Annahme für andere ungültig (`valid: false` / 404 `invite_invalid`).
  Annahme per Code über `/invites/:code/accept` umgeht „auf Anfrage“ (Einladung), `POST /groups/join-by-code` dagegen nicht.
- **Ländliche Regionen:** Standard-Umkreis 30 km. `GET /rural/partners` nimmt optional `postalCode`
  (sonst Ort des eigenen Gesuchs bzw. Profil-PLZ); das eigene Gesuch ist immer enthalten (`isMine`).
  Annahme/Ablehnung einer fremden Anfrage oder einer Anfrage einer blockierten Person → 404 `not_found`; Annahme einer abgelehnten Anfrage → 409 `conflict`.
  Benachrichtigung `partner_accepted` enthält `{ walkId, actorId, displayName, startsAt }`.
  Interessen-Nachrichten: in der App immer, per E-Mail nur mit `emailNotifications`; höchstens eine pro Tag.
  Gruppen „nur auf Einladung“ lösen keine Interessen-Nachricht aus.

---

## Paket B – Walks eintragen, Punkte, Abzeichen, Challenges, Premium

### Typen

```ts
Activity = { id, startedAt, durationMinutes, distanceKm, route: [lon,lat][] | null, source: 'manual'|'gpx'|'group',
             walkId, title, note, city, district, visibility, createdAt, speedKmh: number }
BadgeEarned = { key, label: string | null, kind, tier, awardedAt, shareUrl: string | null }
Challenge = { id, slug, title, summary, type, target, unit: 'km'|'walks', scope, group: {id,name}|null, city,
              startsAt, endsAt, points, participantCount, joined: boolean, progress: number, completedAt: string|null }
```
`endsAt` ist **exklusiv**. Allgemeine Challenges (`db/seed.ts`) laufen von Mitternacht **Berliner Zeit** am Monats-/Jahresanfang
bis Mitternacht Berliner Zeit am Folgemonat/-jahr (z. B. November 2026: `startsAt` 2026-10-31T23:00Z, `endsAt` 2026-11-30T23:00Z);
die Oberfläche zeigt `endsAt − 1 ms` als letzten Tag („bis 30. November 2026“). Slugs bleiben `…-JJJJ` bzw. `…-JJJJ-MM`;
der Seed korrigiert bei vorhandenem Slug nur `startsAt`/`endsAt`.

### Eingetragene Walks – `server/src/modules/activities.ts`

| GET | `/activities?limit&cursor&from&to` | eigene: `{ activities: Activity[], nextCursor }` |
|---|---|---|
| POST | `/activities` | `{ startedAt, durationMinutes, distanceKm, route?, title?, note?, visibility? (Standard `group`), share?: boolean, groupId?, source?: 'manual'\|'gpx' }` → **201** `{ activity, award: AwardResult, post: { id } \| null }`. `award.completedChallenges` enthält die **IDs** der abgeschlossenen Challenges. Plausibilitätsfehler: 400 `implausible_activity` mit `details: [{ field, code: 'out_of_range'\|'in_future'\|'too_old'\|'too_fast' }]` (Typfehler weiterhin `invalid_input`). `share` mit `groupId` ohne aktive Mitgliedschaft → 403 `not_group_member`. Plausibilität: 0 < km ≤ 100, 1 ≤ min ≤ 1440, Datum nicht in der Zukunft, Tempo ≤ 15 km/h. `route` wird vereinfacht (max. 2000 Punkte). Ort (Stadt/Landkreis) aus Routenstart, sonst aus Profil-PLZ. `share: true` legt einen Beitrag (Feed) an. |
| POST | `/activities/gpx` | multipart Feld `file` (≤ 5 MB) → `{ preview: { startedAt, durationMinutes, distanceKm, route } }` – nur auslesen, Speichern danach per `POST /activities` (mit `source: 'gpx'`). `startedAt`/`durationMinutes` sind `null`, wenn die Datei keine Zeitstempel enthält. Fehler `invalid_gpx` (kaputtes XML, keine Punkte, DTD/Entitäten werden abgelehnt), zu groß → 413 `file_too_large`. |
| GET | `/activities/:id` | eigene oder sichtbar nach `visibility` → `{ activity, author: PersonRef }`. `group` heißt bei Walks: sichtbar für aktive Mitglieder **gemeinsamer** Gruppen; Blockieren gilt immer; sonst 404 `activity_not_found`. |
| PATCH | `/activities/:id` | eigene: `{ title?, note?, visibility?, distanceKm?, durationMinutes?, startedAt? }` → `{ activity }`. Bei `source: 'group'` sind km/Dauer/Startzeit fest → 400 `invalid_input` (`details[0].code = 'group_walk_locked'`). Neue `visibility` gilt auch für den zugehörigen Beitrag. |
| DELETE | `/activities/:id` | eigene → `{ ok }` (Punkte bleiben, Challenge-Fortschritt wird neu berechnet) |

### Punkte & Abzeichen – `server/src/services/gamification.ts`, `server/src/modules/badges.ts`

| GET | `/badges` | `{ points, walksCount, totalKm, groupWalksCount, earned: BadgeEarned[], available: [{ key, kind, tier, earned: boolean, progress: { current, target } \| null }] }` |
|---|---|---|
| GET | `/badges/:key/certificate.pdf` | eigene Urkunde als PDF (A4, druckbar, Name, Abzeichen, Datum) |
| POST | `/badges/:key/share` | → `{ shareUrl }` (öffentlicher Link `/abzeichen/geteilt/<token>`) – nur auf ausdrücklichen Wunsch |
| DELETE | `/badges/:key/share` | Teilen beenden |
| GET | `/badges/shared/:token` | öffentlich: `{ displayName, badge: { key, label, kind, tier, awardedAt } }` |
| GET | `/badges/shared/:token/image.png` | öffentlich: Bild des Wappens zum Teilen (1200×630) |

Regeln (in `gamification.ts`, idempotent über `points_ledger`):
Punkte nach `shared/src/points.ts`; Abzeichen nach `shared/src/badges.ts`; regionale Wappen
`region:<Landkreis>` für jeden Landkreis mit mindestens einem Walk; `places_3`/`places_10` für Anzahl Orte;
`week_streak_4`: 4 Kalenderwochen (Mo–So, Europe/Berlin) in Folge mind. 1 Walk. Neues Abzeichen → Punkte
(`POINTS.badge`) + Benachrichtigung `badge` `{ key, label }`. Abgeschlossene Challenge → Punkte der Challenge,
Abzeichen `challenge_done`, Benachrichtigung `challenge_done` `{ challengeId, title }`. Beigetretene Challenges
berücksichtigen nachgetragene Walks noch 3 Tage nach Ende. Abzeichen-Namen haben **eine Quelle**:
`BADGE_NAMES` in `shared/src/badge-names.ts` (je Sprache, derzeit `de`; z. B. „Erster 5-km-Walk“, „Erster Gruppen-Walk“,
„10 Gruppen-Walks“, „Wappen {{label}}“ → „Wappen Landkreis Göttingen“). Urkunde/Teil-Bild nutzen `badgeNameFor`,
die Oberfläche bekommt dieselben Texte als i18n `badges:names` (eingespielt in `web/src/i18n/index.ts`).

### Challenges – `server/src/modules/challenges.ts`

| GET | `/challenges` | `{ active: Challenge[], past: Challenge[] }` – allgemeine, Stadt- (eigene Profil-Stadt) und Gruppen-Challenges (eigene Gruppen) |
|---|---|---|
| GET | `/challenges/:id` | `{ challenge, leaderboard: [{ rank, name, progress, isMe }] }` – Name = Anzeigename bzw. **„Teilnehmende Person“** (neutral) bei `leaderboardMode: hidden` oder Blockierung; die eigene Zeile zeigt immer den eigenen Namen. Gleicher Fortschritt → gleicher Rang. Top 20 + eigene Zeile. Keine Personen-IDs. Gruppen-Challenge und keine aktive Mitgliedschaft (mehr) → nur die eigene Zeile. |
| POST | `/challenges/:id/join` | idempotent → `{ challenge }` (Fortschritt wird aus vorhandenen Walks im Zeitraum berechnet, kann direkt abschließen). Beendet → 409 `challenge_ended`. |
| DELETE | `/challenges/:id/join` | `{ ok }` |
| POST | `/challenges` | Gruppenleitung: `{ groupId, title, summary, type, target, startsAt, endsAt }` → **201** `{ challenge }` (Ziel-Obergrenzen: single_distance 100 km, walk_count 500, total_distance 5000 km; höchstens 1 Jahr). `GET /challenges` → `past`: die letzten 20 beendeten (sichtbare oder beigetretene). |

### Premium – `server/src/modules/premium.ts`

| GET | `/premium/status` | `{ premium: boolean, subscription, price: { priceCents, currency, interval }, features: ['stats','goals','year_review','share_card'] }`, `subscription = { status: 'active'\|'expired', active, provider, priceCents, currency, interval, currentPeriodEnd, cancelAtPeriodEnd } \| null`. Beim Lesen wird ein abgelaufenes, nicht gekündigtes `dev`-Abo um je einen Monat verlängert; gekündigt + abgelaufen → `expired`. |
|---|---|---|
| POST | `/premium/subscribe` | startet Monatsabo (kein Probeabo). Anbieter `dev`: sofort aktiv, Laufzeit 1 Monat, verlängert sich monatlich bis zur Kündigung → `{ subscription }` |
| POST | `/premium/cancel` | ein Klick: `cancelAtPeriodEnd = true`, aktiv bis Laufzeitende → `{ subscription }` (idempotent; ohne aktives Abo 402 `premium_required`) |
| POST | `/premium/resume` | Kündigung zurücknehmen → `{ subscription }` (ohne aktives Abo 402) |
| GET | `/premium/stats?range=week\|month\|year` | 402 ohne Premium. `{ range, totals: { walks, km, minutes, avgSpeedKmh }, series: [{ label, start, walks, km, avgSpeedKmh }], speedTrend: [{ label, avgSpeedKmh }] }`. `week` = letzte 12 Kalenderwochen (label `2026-W47`), `month` = letzte 12 Monate (`2026-11`), `year` = letzte 5 Jahre (`2026`); ältester zuerst, letzter = laufender Abschnitt (Europe/Berlin). `avgSpeedKmh` ist `null` ohne Walks. Standard `month`. |
| GET | `/premium/goals` | `{ goals: [{ id, period: 'week'\|'month', metric: 'km'\|'walks', target, progress, periodStart, periodEnd }] }` (Fortschritt im laufenden Abschnitt) |
| PUT | `/premium/goals` | `{ period, metric, target }` (Upsert) → `{ goals }`; DELETE `/premium/goals/:id` → `{ ok }` |
| GET | `/premium/year-review?year` | `{ year, walks, km, minutes, groupWalks, badges: BadgeEarned[], bestMonth: { month: 'YYYY-MM', km, walks } \| null, longestWalk: { id, distanceKm, durationMinutes, startedAt } \| null, places: string[] }` |
| GET | `/premium/share-card.png?range=month\|year` | Bild „Mein Fortschritt“ (1080×1080) zum Teilen |

Premium-Routen `stats`, `goals`, `year-review`, `share-card.png` liegen hinter der Middleware `requirePremium`
(exportiert aus `modules/premium.ts`). Walks eintragen, Gruppen, Abzeichen und Challenges sind immer kostenlos.

Fehlercodes Paket B: `invalid_gpx`, `activity_not_found`, `implausible_activity`, `challenge_not_found`,
`challenge_ended`, `premium_required`, `badge_not_found`, `already_premium`, `billing_unavailable`
(503, `BILLING_PROVIDER=none`).

---

## Paket C – Soziales, Fotos, Benachrichtigungen

### Typen

```ts
Post = {
  id, author: PersonRef, group: { id, name } | null,
  walk: { id, title, startsAt, kind: 'group'|'partner'|'distance' } | null,   // kind 'distance' → Hinweis „Sichtbar für alle, die bei diesem Termin mitmachen“
  activity: { id, distanceKm, durationMinutes, startedAt, route: [lon,lat][] | null } | null,
  text, visibility, photos: Photo[], likeCount, likedByMe, commentCount, createdAt,
  canDelete: boolean   // Autorin oder Gruppenleitung
}
Photo = { id, url, width, height, altText, visibility }
Comment = { id, author: PersonRef, text, createdAt, canDelete }
PublicProfile = { id, displayName, avatarUrl, city: string | null, bio: string | null,
  canSeeDetails: boolean, followStatus: 'none'|'pending'|'accepted', followsMe: boolean,
  isBlocked: boolean, stats: { walks, km } | null, badges: BadgeEarned[] | null,
  sharedGroups: { id, name }[] }
```

### Feed & Beiträge – `server/src/modules/social.ts`

| GET | `/feed?groupId&walkId&userId&limit&cursor` | sichtbare Beiträge, neueste zuerst → `{ posts: Post[], nextCursor }` (`limit` 1–50, Standard 20). Ohne Filter: eigene Gruppen + bestätigte Kontakte (Sichtbarkeit `followers`/`public`) + eigene. `groupId`: nur aktive Mitglieder (sonst 403 `not_group_member`). `walkId`: Feed eines Walks (wer den Walk nicht sehen darf → 404 `walk_not_found`). **Beiträge zu „Gemeinsam auf Distanz“-Terminen** sehen – unabhängig von `visibility` – nur die Autorin, die Erstellerin des Termins und Personen mit Zusage (`walk_rsvps.status = 'yes'`); das gilt für alle Feeds, einzelne Beiträge, Kommentare, Herzen und Fotos dazu (sonst leer bzw. 404). Ohne Filter erscheinen sie für Teilnehmende auch im Standard-Feed. `userId`: sichtbare Beiträge dieser Person (blockiert → 404 `user_not_found`). |
|---|---|---|
| POST | `/posts` | `{ text, visibility?, groupId?, walkId?, activityId?, photoIds? }` → 201 `{ post }`. `visibility` Standard `group`. Gruppe: nur aktive Mitglieder (403 `not_group_member`). `activityId`: nur eigene (sonst 404 `activity_not_found`). `photoIds`: zuvor per `POST /photos` hochgeladene eigene Fotos ohne Beitrag anhängen (max. 10). Text darf leer sein, wenn Aktivität oder Fotos dabei sind. Gruppen-Walk (`walkId`) setzt `groupId` automatisch. „Gemeinsam auf Distanz“ (`walkId`): nur Erstellerin und Zusagende dürfen schreiben (sonst 403 `not_walk_participant`), ohne `groupId` (sonst 400); die Oberfläche sendet einheitlich `visibility: 'group'`. **Foto anhängen (Oberfläche):** erst `POST /photos` (multipart `photo`, `altText` – Pflicht in der Oberfläche –, `visibility` wie der Beitrag, `groupId?`) → `photo.id`, dann `POST /posts` mit `photoIds: [id]`. |
| DELETE | `/posts/:id` | Autorin oder Gruppenleitung → `{ ok }` |
| PUT / DELETE | `/posts/:id/like` | Herz setzen/entfernen, idempotent → `{ likeCount, likedByMe }` |
| GET | `/posts/:id/comments` | `{ comments: Comment[] }` |
| POST | `/posts/:id/comments` | `{ text }` (getrimmt, 1–1000 Zeichen, reiner Text) → 201 `{ comment }` (benachrichtigt Autorin) |
| DELETE | `/comments/:id` | Autorin oder Gruppenleitung; **keine Benachrichtigung**, Kommentar verschwindet einfach → `{ ok }` |

### Personen, Folgen, Blockieren, Melden

| GET | `/users/:id` | `{ profile: PublicProfile }` – Details (Ort, Abzeichen, Statistik) nur nach Profil-Sichtbarkeit (`private`: nur Name, Profilbild falls erlaubt, gemeinsame Gruppen; `followers`: Details für bestätigte Kontakte; `public`: für alle Angemeldeten); von der Person blockiert → 404 `user_not_found`. Wer selbst blockiert hat, bekommt nur `{ displayName, isBlocked: true }` (zum Aufheben). **Nie** Alter/Geburtsjahr/Geschlecht/Kontaktdaten. |
|---|---|---|
| POST | `/users/:id/follow` | Folge-Anfrage → `{ followStatus }` (neu immer `'pending'`, Bestätigung nötig; bei bestehendem Folgen der aktuelle Status); idempotent. Sich selbst → 400 `cannot_follow_self`; selbst blockiert → 409 `blocked`; von der Person blockiert → 404 `user_not_found`. |
| DELETE | `/users/:id/follow` | entfolgen / Anfrage zurückziehen |
| GET | `/follows` | `{ following: PersonRef[], followers: PersonRef[], requests: PersonRef[], sentRequests: PersonRef[] }` (`requests` = eingehende, `sentRequests` = eigene offene Anfragen) |
| POST | `/follows/requests/:userId/accept` · `/decline` | `{ ok }` (idempotent; accept ohne Anfrage → 404 `user_not_found`; Ablehnen benachrichtigt nicht) |
| DELETE | `/follows/followers/:userId` | jemanden als Kontakt entfernen |
| POST / DELETE | `/users/:id/block` | blockieren / aufheben → `{ ok }`. Blockieren entfernt Folgen in beide Richtungen; Inhalte sind gegenseitig unsichtbar. |
| GET | `/blocks` | `{ blocked: PersonRef[] }` |
| POST | `/reports` | `{ targetType: 'user'\|'post'\|'comment'\|'group'\|'photo'\|'walk', targetId, reason (1–1000) }` → `{ ok }`; idempotent je Person+Ziel; unbekanntes Ziel → 404 `<typ>_not_found` |

### Fotos – `server/src/modules/photos.ts`

| POST | `/photos` | multipart: `photo` (≤ 10 MB, JPG/PNG/WebP/HEIC), `altText` (≤ 300), `visibility` (Standard `group`), `postId?` (eigener Beitrag; übernimmt dessen Gruppe), `groupId?` (nur aktive Mitglieder) → 201 `{ photo }`. EXIF/GPS wird entfernt (Neu-Kodierung). Fehler: falscher Typ/kein Bild → 400 `invalid_image`, zu groß → 413 `file_too_large`. |
|---|---|---|
| GET | `/photos/:id` | Bild (`image/jpeg`, `Cache-Control: private, max-age=3600`, `nosniff`), nur mit Sichtrecht (`canSeePhoto`: eigene Sichtbarkeit des Fotos; Fotos zu Distanz-Beiträgen nur für Teilnehmende des Termins), sonst 404 `photo_not_found` |
| PATCH | `/photos/:id` | `{ altText?, visibility? }` (Eigentümerin) |
| DELETE | `/photos/:id` | Eigentümerin oder Gruppenleitung |
| POST | `/photos/avatar` | multipart `photo` → `{ avatarUrl }` (`/api/v1/photos/avatar/<userId>?v=<version>`); DELETE `/photos/avatar` |
| GET | `/photos/avatar/:userId` | Profilbild: sichtbar für sich selbst, gemeinsame Gruppe, bestätigte Kontakte oder öffentliches Profil; sonst 404 |

### Benachrichtigungen – `server/src/modules/notifications.ts`

| GET | `/notifications` | `{ notifications: [{ id, type, data, actor: PersonRef \| null, readAt, createdAt }], unread: number }` (letzte 50). `actor` aus `data.actorId`; Hinweise blockierter Personen werden ausgeblendet. |
|---|---|---|
| GET | `/notifications/unread-count` | `{ unread }` |
| POST | `/notifications/read-all` | `{ ok }` |
| POST | `/notifications/:id/read` | eine als gelesen markieren → `{ ok }` |

Fehlercodes Paket C: `post_not_found`, `comment_not_found`, `photo_not_found`, `user_not_found`, `cannot_follow_self`, `blocked`,
`invalid_image`, `file_too_large` (sowie aus Paket A/B: `not_group_member`, `group_not_found`, `walk_not_found`, `activity_not_found`).

Benachrichtigungstypen aus Paket C (`data`): `like` `{ postId, actorId }`, `comment` `{ postId, commentId, actorId }`,
`follow_request` `{ actorId }`, `follow_accepted` `{ actorId }`. Ein Herz erzeugt je Person und Beitrag höchstens einen Hinweis;
gelöschte Kommentare und zurückgezogene Folge-Anfragen entfernen ihren Hinweis wieder.

Hilfsfunktionen für andere Module: `server/src/lib/people.ts` – `personRefs(ids, viewerId?)` (gesammelt, ohne N+1),
`personRef`, `canSeeAvatar`, `sharesActiveGroup`, `blockedIds`, `loadViewerContext` + `canSeeWith` (Listen-Variante von `canSeeContent`).

---

## Verwaltung (Rolle `admin`) – `server/src/modules/admin.ts`

Rolle über das Better-Auth-Plugin `admin` (Rollen `user`/`admin`, Spalte `user.role`). `requireAdmin` liest die Rolle
aus der Sitzung: nicht angemeldet → 401 `not_signed_in`, keine Admin-Rolle → 403 `not_admin`.
Oberfläche: `/verwaltung` (Admins; alle anderen sehen die 404-Seite), Link im Profil nur für Admins.

### Typen

```ts
AdminReport = {
  id, status: 'open'|'closed', reason, createdAt,
  reporter: PersonRef | null,                       // gelöschtes Konto → null
  target: {
    type: 'user'|'post'|'comment'|'group'|'photo'|'walk', id,
    exists: boolean,                                // false, wenn inzwischen gelöscht
    excerpt: string | null,                         // Text/Titel/Bildbeschreibung, höchstens 200 Zeichen
    author: PersonRef | null,                       // Autorin/Eigentümerin/Erstellerin; bei 'user' die Person selbst
    removable: boolean                              // post|comment|photo und noch vorhanden
  }
}
```

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/admin/reports?status=open\|closed&limit&cursor` | `{ reports: AdminReport[], nextCursor }`, neueste zuerst (`status` Standard `open`, `limit` 1–100, Standard 50). **Keine E-Mail-Adressen**, Personen nur als `PersonRef`. |
| POST | `/admin/reports/:id/close` | Meldung schließen, idempotent → `{ ok: true }` · 404 `report_not_found` |
| POST | `/admin/reports/:id/remove-content` | gemeldeten Beitrag (inkl. Fotos/Dateien, Kommentare, Herzen), Kommentar (wie Löschen durch Autorin, Hinweis verschwindet) oder Foto (inkl. Datei) löschen, dann alle offenen Meldungen zu diesem Inhalt (bei Beiträgen auch zu dessen Fotos/Kommentaren) schließen → `{ ok: true, removed: boolean }` (`removed: false`, wenn schon gelöscht – idempotent). Andere Zieltypen → 400 `content_not_removable`; 404 `report_not_found` |

Personen über die Endpunkte des Better-Auth-Admin-Plugins (Oberfläche: `authClient.admin.*`, `adminClient()`):

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/auth/admin/list-users?searchValue&searchField=name\|email&searchOperator=contains&limit&offset&sortBy&sortDirection` | `{ users: AdminUser[], total, limit, offset }` |
| GET | `/api/auth/admin/get-user?id=` | `AdminUser` |
| POST | `/api/auth/admin/ban-user` | `{ userId, banReason?, banExpiresIn? }` → `{ user }`; beendet sofort alle Sitzungen der Person; sich selbst → 400 `YOU_CANNOT_BAN_YOURSELF` |
| POST | `/api/auth/admin/unban-user` | `{ userId }` → `{ user }` |
| POST | `/api/auth/admin/set-role` | `{ userId, role: 'user'\|'admin' }` → `{ user }`; eigene Admin-Rolle entziehen → 400 `CANNOT_REMOVE_OWN_ADMIN_ROLE`; unbekannte Rolle → 400 |
| POST | `/api/auth/admin/list-user-sessions` · `revoke-user-session(s)` | Sitzungen einer Person ansehen/beenden |

`AdminUser = { id, name, email: string | null, role, banned, banReason, banExpires, createdAt }` – gekürzt per
`hooks.after` in `auth.ts` (keine Telefonnummer, SMS-Platzhalter-Adressen → `null`). **Abgeschaltet** (404):
`impersonate-user`, `stop-impersonating`, `create-user`, `update-user`, `remove-user`, `set-user-password`.

Gesperrte Personen (`user.banned`) können sich nicht anmelden (Plugin, 403 `BANNED_USER`); `loadSession` behandelt
eine trotzdem vorhandene Sitzung als abgemeldet.

Start-Konten: `ADMIN_EMAILS` / `ADMIN_INITIAL_PASSWORD` (`server/src/services/seed-admins.ts`, beim Start, idempotent) –
siehe `docs/DEPLOY-RAILWAY.md`.

Fehlercodes Verwaltung: `not_admin`, `report_not_found`, `content_not_removable` (Better Auth: `YOU_CANNOT_BAN_YOURSELF`,
`CANNOT_REMOVE_OWN_ADMIN_ROLE`, `USER_NOT_FOUND`).
