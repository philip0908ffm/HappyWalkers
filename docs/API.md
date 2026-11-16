# API-Vertrag „Gehmeinsam“ (v1)

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

## Ich / Konto (fertig) – `server/src/modules/me.ts`

| GET | `/me` | `{ me: Me }` (siehe `web/src/api/types.ts`) |
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
| POST | `/groups/:id/join` | `{ message? }` → `{ membership: { role, status } }`. open → `active`; request → `pending` (Leitung wird benachrichtigt); invite → 403 `invite_only`; gesperrt → 403 `banned`; nur Frauen → 403 `women_only`. Idempotent. |
| POST | `/groups/:id/leave` | → `{ ok }` (Gründerin: 409 `founder_cannot_leave`, erst Leitung übergeben) |
| GET | `/groups/:id/members` | aktive Mitglieder: `{ members: (PersonRef & { role, status, joinedAt, requestMessage? })[] }`. Leitung sieht zusätzlich `pending` und `banned`. Nicht-Mitglieder: 403. |
| PATCH | `/groups/:id/members/:userId` | Leitung: `{ action: 'approve'\|'decline'\|'remove'\|'ban'\|'unban'\|'make_moderator'\|'remove_moderator'\|'make_founder' }`. Moderatorinnen ernennen/abberufen und Gründung übergeben nur Gründerin. **Entfernen/Sperren erzeugt keine Benachrichtigung.** → `{ member }` |
| POST | `/groups/join-by-code` | `{ code }` → `{ groupId, membership }`. Code = Einladung: open/invite → active, request → pending. |
| GET | `/groups/:id/invite` | aktive Mitglieder: `{ url, code, whatsappUrl, mailtoUrl }` (`url` = `${APP_URL}/einladung/<code>`) |
| POST | `/groups/:id/invite/email` | aktive Mitglieder: `{ emails: string[] (max 10), message? }` → `{ sent: number }` – E-Mail mit persönlichem Link `/einladung/<token>` (14 Tage gültig) |
| GET | `/groups/:id/poster` | Mitglieder: `{ group: { name, city, description }, code, url, qrSvg, series: SeriesSummary[], nextWalks: WalkSummary[] }` für den druckbaren Aushang |

### Einladungen – `server/src/modules/invites.ts`

| GET | `/invites/:codeOrToken` | öffentlich: `{ valid: boolean, group: { id, name, city, description, memberCount, womenOnly, photoUrl } \| null }` |
|---|---|---|
| POST | `/invites/:codeOrToken/accept` | angemeldet → `{ groupId, membership }` (Einladung umgeht „auf Anfrage“/„nur Einladung“, nicht aber Sperre und „nur Frauen“). Vergibt dem Einladenden Abzeichen `inviter`. Idempotent. |

Ablauf Einladungslink: `/einladung/:code` → nicht angemeldet → Anmeldung mit `weiter=/einladung/:code`
→ nach Registrierung/Profil zurück → „Gruppe beitreten“ → direkt in der Gruppe.

### Walks – `server/src/modules/walks.ts`

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/walks?postalCode&lat&lon&radiusKm&from&to&tempo&groupId&kind` | `{ walks: WalkSummary[], center: Place\|null, nearest: (WalkSummary)[] }` – Standard `from`=jetzt, `to`=+30 Tage, sortiert nach Zeit. Walks von Einladungsgruppen nur für Mitglieder. `kind=distance` liefert „Gemeinsam auf Distanz“-Termine (ohne Ortsfilter). `groupId` ohne Ortsfilter (für Gruppenkalender, auch vergangene mit `from`). `nearest` wie bei Gruppen. |
| GET | `/walks/:id` | `{ walk: WalkDetail }` |
| POST | `/walks` | Gruppen-Walk (Leitung) oder „Gemeinsam auf Distanz“ (jede Person): `{ kind: 'group'\|'distance', groupId?, title, description?, startsAt, durationMinutes, distanceKm?, tempo, meetingPointName?, meetingAddress?, meetingDescription?, meetingLat?, meetingLon?, maxParticipants?, recurring?: { weekday, timeOfDay } }` → `{ walk: WalkDetail, seriesId? }`. Mit `recurring` (Schalter „Wiederkehrender Termin“) wird eine Serie angelegt und die nächsten 8 Wochen erzeugt; ein Hintergrund-Job erzeugt laufend nach. Löst Interessen-Benachrichtigung aus. |
| PATCH | `/walks/:id` | Leitung/Erstellerin, Felder wie POST → `{ walk }` |
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
| POST | `/rural/partners/:offerId/request` | `{ message }` → `{ request }` – Anfrage an die Person (in-App + E-Mail, ohne Kontaktdaten preiszugeben). Idempotent je Paar. |
| GET | `/rural/partner-requests` | `{ incoming: Req[], outgoing: Req[] }`, `Req = { id, from: PersonRef, to: PersonRef, message, status, walkId, createdAt }` |
| POST | `/rural/partner-requests/:id/accept` | Empfängerin: `{ startsAt, meetingPointName, meetingAddress, meetingDescription?, durationMinutes?, tempo? }` → `{ walkId }` – legt 1:1-Walk (`kind: 'partner'`) mit beiden Zusagen an |
| POST | `/rural/partner-requests/:id/decline` | `{ ok }` (Absenderin wird NICHT aktiv benachrichtigt, sieht nur Status) |

Fehlercodes Paket A: `group_not_found`, `walk_not_found`, `not_group_member`, `not_group_lead`, `not_founder`,
`women_only`, `banned`, `invite_only`, `invite_invalid`, `walk_full`, `walk_cancelled`, `walk_in_past`,
`walk_not_started`, `founder_cannot_leave`, `offer_not_found`.

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

### Eingetragene Walks – `server/src/modules/activities.ts`

| GET | `/activities?limit&cursor&from&to` | eigene: `{ activities: Activity[], nextCursor }` |
|---|---|---|
| POST | `/activities` | `{ startedAt, durationMinutes, distanceKm, route?, title?, note?, visibility?, share?: boolean, groupId? }` → `{ activity, award: AwardResult, post: { id } \| null }`. Plausibilität: 0 < km ≤ 100, 1 ≤ min ≤ 1440, Datum nicht in der Zukunft, Tempo ≤ 15 km/h. `route` wird vereinfacht (max. 2000 Punkte). Ort (Stadt/Landkreis) aus Routenstart, sonst aus Profil-PLZ. `share: true` legt einen Beitrag (Feed) an. |
| POST | `/activities/gpx` | multipart Feld `file` (≤ 5 MB) → `{ preview: { startedAt, durationMinutes, distanceKm, route } }` – nur auslesen, Speichern danach per `POST /activities`. Fehler `invalid_gpx`. |
| GET | `/activities/:id` | eigene oder sichtbar nach `visibility` → `{ activity, author: PersonRef }` |
| PATCH | `/activities/:id` | eigene: `{ title?, note?, visibility?, distanceKm?, durationMinutes?, startedAt? }` (nicht bei `source: 'group'` für km/Dauer) |
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
`week_streak_4`: 4 Wochen in Folge mind. 1 Walk. Neues Abzeichen → Benachrichtigung `badge`.

### Challenges – `server/src/modules/challenges.ts`

| GET | `/challenges` | `{ active: Challenge[], past: Challenge[] }` – allgemeine, Stadt- (eigene Profil-Stadt) und Gruppen-Challenges (eigene Gruppen) |
|---|---|---|
| GET | `/challenges/:id` | `{ challenge, leaderboard: [{ rank, name, progress, isMe }] }` – Name = Anzeigename bzw. „Teilnehmerin“ bei `leaderboardMode: hidden`; Top 20 + eigene Zeile |
| POST | `/challenges/:id/join` | idempotent → `{ challenge }` (Fortschritt wird aus vorhandenen Walks im Zeitraum berechnet) |
| DELETE | `/challenges/:id/join` | `{ ok }` |
| POST | `/challenges` | Gruppenleitung: `{ groupId, title, summary, type, target, startsAt, endsAt }` → `{ challenge }` |

### Premium – `server/src/modules/premium.ts`

| GET | `/premium/status` | `{ premium: boolean, subscription, price: { priceCents, currency, interval }, features: string[] }` |
|---|---|---|
| POST | `/premium/subscribe` | startet Monatsabo (kein Probeabo). Anbieter `dev`: sofort aktiv, Laufzeit 1 Monat, verlängert sich monatlich bis zur Kündigung → `{ subscription }` |
| POST | `/premium/cancel` | ein Klick: `cancelAtPeriodEnd = true`, aktiv bis Laufzeitende → `{ subscription }` |
| POST | `/premium/resume` | Kündigung zurücknehmen |
| GET | `/premium/stats?range=week\|month\|year` | 402 ohne Premium. `{ totals: { walks, km, minutes, avgSpeedKmh }, series: [{ label, start, walks, km, avgSpeedKmh }], speedTrend: [{ label, avgSpeedKmh }] }` |
| GET | `/premium/goals` | `{ goals: [{ id, period: 'week'\|'month', metric: 'km'\|'walks', target, progress }] }` |
| PUT | `/premium/goals` | `{ period, metric, target }` (Upsert) → `{ goals }`; DELETE `/premium/goals/:id` |
| GET | `/premium/year-review?year` | `{ year, walks, km, minutes, groupWalks, badges: BadgeEarned[], bestMonth, longestWalk, places: string[] }` |
| GET | `/premium/share-card.png?range=month\|year` | Bild „Mein Fortschritt“ (1080×1080) zum Teilen |

Fehlercodes Paket B: `invalid_gpx`, `activity_not_found`, `implausible_activity`, `challenge_not_found`,
`challenge_ended`, `premium_required`, `badge_not_found`, `already_premium`.

---

## Paket C – Soziales, Fotos, Benachrichtigungen

### Typen

```ts
Post = {
  id, author: PersonRef, group: { id, name } | null, walk: { id, title, startsAt } | null,
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

| GET | `/feed?groupId&walkId&userId&cursor` | sichtbare Beiträge, neueste zuerst → `{ posts: Post[], nextCursor }`. Ohne Filter: eigene Gruppen + bestätigte Kontakte + eigene. `walkId`: Feed eines „Gemeinsam auf Distanz“-Termins. |
|---|---|---|
| POST | `/posts` | `{ text, visibility, groupId?, walkId?, activityId? }` → `{ post }` (Gruppe: nur aktive Mitglieder) |
| DELETE | `/posts/:id` | Autorin oder Gruppenleitung → `{ ok }` |
| PUT / DELETE | `/posts/:id/like` | Herz setzen/entfernen, idempotent → `{ likeCount, likedByMe }` |
| GET | `/posts/:id/comments` | `{ comments: Comment[] }` |
| POST | `/posts/:id/comments` | `{ text }` → `{ comment }` (benachrichtigt Autorin) |
| DELETE | `/comments/:id` | Autorin oder Gruppenleitung; **keine Benachrichtigung**, Kommentar verschwindet einfach → `{ ok }` |

### Personen, Folgen, Blockieren, Melden

| GET | `/users/:id` | `{ profile: PublicProfile }` – Details (Ort, Abzeichen, Statistik) nur nach Profil-Sichtbarkeit; blockiert → 404. **Nie** Alter/Geburtsjahr/Geschlecht/Kontaktdaten. |
|---|---|---|
| POST | `/users/:id/follow` | Folge-Anfrage → `{ followStatus: 'pending' }` (immer Bestätigung nötig); idempotent |
| DELETE | `/users/:id/follow` | entfolgen / Anfrage zurückziehen |
| GET | `/follows` | `{ following: PersonRef[], followers: PersonRef[], requests: PersonRef[] }` |
| POST | `/follows/requests/:userId/accept` · `/decline` | `{ ok }` |
| DELETE | `/follows/followers/:userId` | jemanden als Kontakt entfernen |
| POST / DELETE | `/users/:id/block` | blockieren / aufheben → `{ ok }`. Blockieren entfernt Folgen in beide Richtungen; Inhalte sind gegenseitig unsichtbar. |
| GET | `/blocks` | `{ blocked: PersonRef[] }` |
| POST | `/reports` | `{ targetType: 'user'\|'post'\|'comment'\|'group'\|'photo'\|'walk', targetId, reason }` → `{ ok }` |

### Fotos – `server/src/modules/photos.ts`

| POST | `/photos` | multipart: `photo` (≤ 10 MB, JPG/PNG/WebP/HEIC), `altText`, `visibility` (Standard `group`), `postId?`, `groupId?` → `{ photo }`. EXIF/GPS wird entfernt (Neu-Kodierung). |
|---|---|---|
| GET | `/photos/:id` | Bild, nur mit Sichtrecht (`canSeeContent`) |
| PATCH | `/photos/:id` | `{ altText?, visibility? }` (Eigentümerin) |
| DELETE | `/photos/:id` | Eigentümerin oder Gruppenleitung |
| POST | `/photos/avatar` | multipart `photo` → `{ avatarUrl }`; DELETE `/photos/avatar` |
| GET | `/photos/avatar/:userId` | Profilbild: sichtbar für sich selbst, gemeinsame Gruppe, bestätigte Kontakte oder öffentliches Profil; sonst 404 |

### Benachrichtigungen – `server/src/modules/notifications.ts`

| GET | `/notifications` | `{ notifications: [{ id, type, data, readAt, createdAt }], unread: number }` (letzte 50) |
|---|---|---|
| GET | `/notifications/unread-count` | `{ unread }` |
| POST | `/notifications/read-all` | `{ ok }` |

Fehlercodes Paket C: `post_not_found`, `comment_not_found`, `photo_not_found`, `user_not_found`, `cannot_follow_self`, `blocked`.
