# Sicherheit und Datenschutz – Bedrohungsmodell, Maßnahmen, Befunde

Verantwortlich: Aylin Demir. Regeln zur Sichtbarkeit: `docs/WER-SIEHT-WAS.md`.
Tests zu den Befunden: `server/test/security.test.ts` (S-xx), `server/test/security2.test.ts` (S2-xx),
`web/src/pages/auth/safeNext.test.ts`.

## 1. Was wir schützen

| Schutzgut | Warum heikel |
|---|---|
| Treffpunkte und Zeiten von Walks | verraten, wann sich ältere Menschen wo aufhalten (Trickbetrug, Stalking) |
| Wohnort (PLZ), Strecken eingetragener Walks | Rückschluss auf Wohnung und Gewohnheiten |
| Alter, Geschlecht, Kontaktdaten | Zielgruppe für Betrug („Enkeltrick“, Romance Scam) |
| Fotos | Gesichter, Aufnahmeort in EXIF/GPS |
| Konten / Sitzungen | Übernahme → Zugriff auf alles oben |
| Verfügbarkeit | Gruppenleitungen verlassen sich auf die App |

## 2. Angreifer und Szenarien

1. **Fremde aus dem Internet** – Konten aufzählen, Anmelde-Links abfangen, Massenanmeldung, Bildbomben,
   Offene Weiterleitung für Phishing („gehmeinsam.de/anmelden?weiter=…“).
2. **Angemeldete Fremde** – Treffpunkte/Profile/Fotos außerhalb der Berechtigung lesen (IDs raten),
   Kontaktdaten erfragen, Gruppen „nur Frauen“ unterwandern, Belästigung.
3. **Gesperrte oder blockierte Personen** – über Umwege (Einladungslink, ICS, Profilbild-URL) weiter Inhalte sehen.
4. **Fremde Webseiten im Browser der Nutzerin** – CSRF (Konto löschen, Einstellungen ändern), Clickjacking.
5. **Innentäter/Datenleck** – Datenbank-Auszug, Server-Protokolle (Anmelde-Links, SMS-Codes).
6. **Fehlkonfiguration** – Test-Endpunkte oder Entwicklungs-Einstellungen in Produktion.

## 3. Schutzmaßnahmen (Stand Grundgerüst)

- **Anmeldung ohne Passwort** (Better Auth): Magic Link 20 min, einmalig, in der DB nur als Hash;
  SMS-Code 6-stellig, 10 min, 5 Versuche. Gleiche Antwort für bekannte und neue Adressen (keine Aufzählung).
- **Ratenbegrenzung**: Better Auth 100/min allgemein, Magic Link 5/10 min, SMS 3/10 min, SMS-Prüfung 10/10 min
  je IP; `/api/v1` 300/min je IP. Client-IP aus `req.ip` (`trust proxy 1`, Railway) – nicht aus vom Browser
  gesetzten Kopfzeilen.
- **Sitzung**: Cookie `HttpOnly`, `SameSite=Lax`, in Produktion `Secure` + `__Secure-`-Präfix, 90 Tage,
  verlängert bei Nutzung, kein Cookie-Cache (Abmelden wirkt sofort). „Auf allen Geräten abmelden“ in den Einstellungen.
- **Bearer (Mobil-App)**: nur signierte Tokens (`requireSignature`).
- **CSRF**: Better Auth prüft Origin (auch unter `NODE_ENV=test`); `/api/v1` lehnt schreibende Anfragen mit
  fremdem `Origin` bzw. `Sec-Fetch-Site: cross-site` ab; CORS nur für `APP_URL` + `TRUSTED_ORIGINS`.
- **Header** (helmet): CSP `default-src 'self'`, `script-src 'self'`, `script-src-attr 'none'`, `object-src 'none'`,
  `frame-ancestors 'none'`, Bilder nur eigene + Kartenkachel-Server, Schrift nur eigene; HSTS (Produktion);
  `Referrer-Policy: no-referrer` (Einladungs- und Anmelde-Tokens gelangen nicht an Kachel-Server);
  `Permissions-Policy` (Kamera/Mikrofon/Zahlung aus, Standort nur eigene Seite); `Cache-Control: private, no-store` für die API.
- **Fehler**: einheitlich `{ error: { code } }`, keine Stacktraces/SQL; Upload- und Body-Fehler als 4xx.
- **Uploads**: Inhalt statt Endung prüfen (JPEG/PNG/WebP/HEIF/GIF, kein SVG), `limitInputPixels` 50 MP,
  nur erstes Bild bei Animationen, immer Neu-Kodierung als JPEG (entfernt EXIF/GPS), zufällige Dateinamen,
  Ablage außerhalb öffentlicher Ordner, Pfadprüfung `resolveKey`.
- **DSGVO**: Export aller Daten (`GET /me/export`), Löschung inkl. Dateien (`DELETE /me`), keine Tracking-Cookies
  (nur Anmelde-Cookie + Schriftgröße/Anrede im `localStorage`, § 25 Abs. 2 Nr. 2 TDDDG → kein Cookie-Banner).
- **Start in Produktion verweigert** bei Standard-Geheimnis, fehlendem Resend-Schlüssel, `SMS_PROVIDER=console`, `APP_URL` ohne https.

## 4. Befunde – Prüfung Grundgerüst (Runde 1)

Schwere: hoch / mittel / niedrig. Status: ✅ behoben (mit Test) · ⏳ offen.

| ID | Schwere | Ort | Befund | Status |
|---|---|---|---|---|
| S-01 | niedrig | `server/src/app.ts:45,57,67` | CSP erlaubte Schriften von beliebigen `https:`-Quellen (helmet-Standard); keine `Permissions-Policy`; API-Antworten ohne `Cache-Control` (persönliche Daten in Zwischenspeichern). CSP passt sonst zum Vite-Build (nur `/assets/*.js`, kein Inline-Skript), Leaflet/React-Inline-Styles über `style-src 'unsafe-inline'`. | ✅ |
| S-02 | mittel | `server/src/app.ts:104` | `/api/v1` hatte keinen CSRF-Schutz außer `SameSite=Lax`. Same-Site-Angriffe (z. B. andere Subdomain) oder ältere Browser hätten `DELETE /me` auslösen können. → Origin-Prüfung für schreibende Anfragen. | ✅ |
| S-03 | niedrig | `server/src/app.ts:85` | Test-Postfach `/api/test/mailbox` hing nur an `NODE_ENV=test` + `E2E_MAILBOX=1`. Eine falsch gesetzte Produktions-Umgebung (NODE_ENV=test) hätte alle Anmelde-Links öffentlich gemacht. → zusätzlich `APP_URL` muss localhost sein; Bedingung als `testMailboxAllowed()` getestet. | ✅ |
| S-04 | hoch | `server/src/config.ts:51` | In Produktion ohne `RESEND_API_KEY` landeten Magic Links im Server-Protokoll (Kontoübernahme für jede Person mit Protokollzugriff), ebenso SMS-Codes bei `SMS_PROVIDER=console`. → Start wird verweigert (`productionConfigErrors`). | ✅ |
| S-05a | mittel | `server/src/auth.ts:65`, `app.ts:75` | Ratenbegrenzung las `X-Forwarded-For`. Bei mehreren Einträgen (Railway hängt an) liefert Better Auth `null` → **eine gemeinsame Bucket für alle** (Anmelde-Sperre für alle, DoS) bzw. Umgehung. → IP aus `req.ip` in eigenem, serverseitig gesetztem Kopf. | ✅ |
| S-05b | mittel | `server/src/auth.ts:80` | Magic-Link-Tokens lagen im Klartext in `verification` → DB-Auszug = 20 min gültige Anmelde-Links. → `storeToken: 'hashed'`. | ✅ |
| S-05c | mittel | `server/src/auth.ts:109` | `bearer()` akzeptierte unsignierte rohe Sitzungs-Tokens → DB-Auszug = Sitzungsübernahme. → `requireSignature: true` (Mobil-App erhält ohnehin den signierten Token aus `set-auth-token`). | ✅ |
| S-05d | mittel | `server/src/auth.ts:61` | Better Auth schaltet Origin-/CSRF-/Callback-Prüfung unter `NODE_ENV=test` ab → Tests (auch E2E) prüften nicht, was in Produktion gilt. → `disableOriginCheck: false`. | ✅ |
| S-05e | niedrig | `server/src/auth.ts` | Keine Begrenzung je E-Mail-Adresse (Mail-Flut an eine Adresse über viele IPs). Sitzungsdauer 90 Tage ohne Option „öffentliches Gerät“. | ⏳ Empfehlung |
| S-05f | niedrig | `server/src/auth.ts` | Ratenbegrenzung im Speicher (ein Prozess). Bei mehreren Railway-Instanzen auf `storage: 'database'` umstellen. | ⏳ Hinweis |
| S-06 | niedrig | `server/src/lib/http.ts:43,62,67` | multer-Fehler (außer Größe) und Body-Parser-Fehler (Zeichensatz u. ä.) wurden zu 500 + Log; keine Prüfung `headersSent`. → 400/4xx ohne Details. | ✅ |
| S-07 | niedrig | `server/src/services/storage.ts:30-42` | Abgeschnittene/kaputte Bilder und Bildbomben (Header ok, Dekodierung scheitert) führten zu 500, weil nur `metadata()` im `try` lag. Animierte Bilder dekodierten alle Frames. → alles im `try`, `pages: 1`, leere Puffer abgewiesen. EXIF-Entfernung und Pfadprüfung waren korrekt. | ✅ |
| S-08a | mittel | `server/src/modules/me.ts:179-221` | Kontolöschung ließ Dateien liegen: Profilbild, Bilder aufgelöster Gruppen, Fotos anderer an eigenen Beiträgen/aufgelösten Gruppen (DB-Zeilen per Kaskade weg, Dateien nicht). Einladungen an die eigene E-Mail-Adresse und offene SMS-Codes blieben. → Dateien einsammeln und löschen, Einladungen/Codes löschen. Sitzungen werden per Kaskade gelöscht (getestet). Gründungs-Übergabe korrekt (Moderatorin, sonst ältestes aktives Mitglied). | ✅ |
| S-08b | niedrig | `server/src/modules/me.ts:137-165` | Export unvollständig: Benachrichtigungen, Gehpartner-Anfragen, angelegte Termine/Serien/Gruppen/Challenges, Einladungen, angemeldete Geräte (IP, Browser), Anmeldeverfahren fehlten. → ergänzt, ohne Sitzungs-Tokens. | ✅ |
| S-08c | niedrig | `server/src/modules/me.ts` | Nach Löschung bleiben Benutzer-IDs ohne Fremdschlüssel in `group_members.invited_by`, `walks.confirmed_by`, `comments.deleted_by`, `group_invites.used_by` (pseudonym, ohne Zuordnung). | ⏳ niedrig |
| S-09 | mittel | `web/src/pages/auth/Login.tsx:13` | `safeNext` ließ `/\evil.example` und `/<Tab>/evil.example` durch (Browser lesen das als `//evil.example`) → offene Weiterleitung nach der Anmeldung (Phishing). Der Server (Better Auth) prüft `callbackURL` selbst korrekt. → Steuerzeichen/Backslash abweisen, Ziel per `URL` gegen eigene Herkunft prüfen. | ✅ |
| S-10 | niedrig | `web/vite.config.ts` | `sourcemap: true` veröffentlicht den Quelltext in Produktion (kein Geheimnis, erleichtert aber Angriffe). | ⏳ Empfehlung: `'hidden'` |
| S-11 | mittel | `server/src/config.ts:54` | `BILLING_PROVIDER` ist standardmäßig `dev` → in Produktion Premium ohne Zahlung. Entscheidung Lena: ohne Angabe gilt in Produktion `none`, `dev` verhindert den Start. | ✅ behoben |
| S-12 | niedrig | `web/src/pages/profile/Settings.tsx` | Einstellungen: Export per GET mit Cookie (ok, nur eigene Daten), Löschen mit Eingabe „LÖSCHEN“ + Server-Prüfung (ok). Hinweis: Fotos im Format HEIC werden vom vorinstallierten sharp nicht gelesen (nur AVIF/HEIF) → Fehlermeldung `invalid_image`. | ⏳ Hinweis Paket C |

## 5. Prüfliste für die zweite Prüfrunde (Pakete A/B/C) – abgearbeitet, Ergebnis in Abschnitt 6

Paket A (Gruppen, Walks, Einladungen, ländlich)
- Treffpunkt nur über `canSeeMeetingPoint` – auch in `GET /walks` (Liste), Karte, ICS, Druck/Aushang (`/poster` → kein Treffpunkt für Nicht-Mitglieder), Serien (`walk_series.meeting*`) und Benachrichtigungen.
- `pending`/`banned` sind keine Mitglieder; Einladung darf Sperre und „nur Frauen“ nicht umgehen.
- Einladungsgruppen: 404 statt 403; nicht in Suche, nicht in `nearest`, nicht in `rural/overview`.
- Einladungs-Tokens/-Codes: ausreichend zufällig (Codes `WALK-XXXX` sind kurz → Ratenbegrenzung für `join-by-code`/`GET /invites/:code`).
- `POST /groups/:id/invite/email`: max. 10 Adressen, Ratenbegrenzung (Spam über unsere Domain), Nachricht escapen (`textToHtml`).
- Gehpartner: Entfernung gerundet, keine Koordinaten, Anfrage ohne Kontaktdaten; Ablehnen ohne Benachrichtigung.
- Browser-Standort (`lat/lon`) nicht speichern/protokollieren.

Paket B (Eintragen, Abzeichen, Challenges, Premium)
- GPX: XML-Parser ohne Entitäten (XXE/„Billion Laughs“), Größe ≤ 5 MB, Punktzahl begrenzen.
- `GET /activities/:id`: `canSeeContent` inkl. Blockieren; Route nur nach Sichtbarkeit.
- Geteilte Abzeichen: Token zufällig (≥ 128 Bit), nur `displayName` + Abzeichen, Teilen beenden macht Link ungültig.
- Ranglisten: `leaderboardMode = 'hidden'` überall respektieren, keine IDs anderer ausliefern.
- Premium: `dev`-Anbieter in Produktion (S-11); Statistiken nur eigene Daten; Urkunde/Share-Card nur eigene.

Paket C (Soziales, Fotos, Benachrichtigungen)
- Jede Foto-Auslieferung über `canSeeContent`, Antwort `Cache-Control: private`; Foto-ID raten → 404.
- Blockieren: gegenseitig unsichtbar in Feed, Kommentaren, Profil, Folgen, Gehpartnern, Teilnehmerlisten.
- Meldungen: Melderin nicht an die gemeldete Person verraten; Ratenbegrenzung.
- `notifications.data`: keine Kontaktdaten/Treffpunkte; Löschen/Sperren ohne Benachrichtigung.
- Bei Löschung eines Beitrags/Fotos/Avatars die Datei entfernen (`deleteStoredFiles`).
- Neue Tabellen mit Personenbezug in Export und Löschung (`modules/me.ts`) aufnehmen.

## 6. Befunde – zweite Prüfrunde (Pakete A/B/C, alle Funktionen gebaut)

Geprüft: `modules/{groups,walks,invites,rural,activities,badges,challenges,premium,social,photos,notifications}.ts`,
`services/{interest,series,gamification}.ts`, `lib/{gpx,billing,people,email,ics}.ts`, `web/src/**`.
Schwere: hoch / mittel / niedrig. Status: ✅ behoben (Test in `server/test/security2.test.ts`) · ⏳ offen/Empfehlung · ✔ geprüft, in Ordnung.

| ID | Schwere | Ort | Befund | Status |
|---|---|---|---|---|
| S2-01 | hoch | `server/src/lib/access.ts:82`, `modules/walks.ts:126,162,197` | `canSeeMeetingPoint`, `walkSummaries`, `canManageWalk` und die Teilnehmerliste prüften **zuerst `createdBy`**. Eine Moderatorin, die einen (wiederkehrenden) Termin angelegt hat und danach **gesperrt oder entfernt** wurde, sah weiter Treffpunkt, Teilnehmende und ICS – auch für alle künftig vom Hintergrund-Job erzeugten Serientermine (`walks.createdBy = series.createdBy`) – und konnte die Termine ändern/absagen. → Bei Gruppen-Walks zählt nur noch die aktive Mitgliedschaft bzw. Gruppenleitung. | ✅ |
| S2-02 | mittel | `modules/walks.ts:194,374`, `modules/rural.ts:93` | `GET /walks?kind=distance` (auch anonym) und `GET /rural/overview` listeten „Gemeinsam auf Distanz“-Termine mit `groupId` einer Gruppe **„nur auf Einladung“** – inkl. Gruppenname/-ID. → gemeinsamer Filter `visibleDistanceWalks` (blockierte Erstellerinnen + fremde Einladungsgruppen). | ✅ |
| S2-03 | mittel | `modules/groups.ts:746,766` | `POST /groups/:id/invite/email`: max. 10 Adressen je Anfrage, aber **beliebig viele Anfragen** – jedes Mitglied einer offenen Gruppe konnte über unsere Absender-Domain Spam mit eigenem Text („Persönliche Nachricht“) versenden (Domain-Reputation, Phishing). → höchstens 30 Einladungs-Mails je Person in 24 h (DB-Zähler über `group_invites.created_by`, gilt auch bei mehreren Instanzen), sonst 429 `rate_limited`. Nachricht wird in HTML korrekt escaped (`textToHtml`). | ✅ |
| S2-04 | mittel | `lib/ratelimit.ts`, `modules/invites.ts:34,64`, `modules/groups.ts:590` | Einladungscodes `WALK-XXXXXX` (32^6 ≈ 1 Mrd.) nur durch die allgemeine Grenze 300/min je IP geschützt. → eigener Begrenzer 30 / 15 min je IP für `GET /invites/:code`, `POST /invites/:code/accept`, `POST /groups/join-by-code` (im Testmodus aus). Persönliche E-Mail-Tokens: 192 Bit, ✔. | ✅ |
| S2-05 | mittel | `modules/rural.ts:236,269` | `POST /rural/partners/:offerId/request` sendet je Gesuch eine E-Mail mit frei wählbarer Nachricht; mit `GET /rural/partners?postalCode=…` lassen sich bundesweit Gesuche finden → Massen-Anschreiben. → höchstens 10 neue Anfragen je Person in 24 h (429 `rate_limited`); bestehende bleiben idempotent. | ✅ |
| S2-06 | mittel | `modules/groups.ts:688` | „Nur Frauen“ umgehbar: Anfrage an eine „auf Anfrage“-Gruppe stellen, Leitung stellt danach auf „nur Frauen“ um (oder Person ändert ihr Geschlecht nach der Anfrage) → `approve` prüfte das Geschlecht nicht. → `approve` prüft `canJoinWomenOnly` (403 `women_only`). Beitritt per Code/Einladung/Gründung/Umstellung: ✔ geprüft. | ✅ |
| S2-07 | niedrig | `modules/groups.ts:602` | `POST /groups/:id/join` auf eine Einladungsgruppe antwortete 403 `invite_only`/`women_only`/`banned` → Existenz und Eigenschaften der Gruppe erkennbar (Grundsatz 4). → 404 `group_not_found` für alle, die die Gruppe nicht sehen dürfen. `test/groups.test.ts` angepasst, `docs/API.md` ergänzt. | ✅ |
| S2-08 | niedrig | `lib/email.ts:21`, `lib/ics.ts:15` | Betreffzeilen enthalten Benutzertexte (Anzeigename, Gruppen-/Walk-Titel; zod `trim()` lässt innere Zeilenumbrüche zu) → **Header-Injection**, falls je ein SMTP-Versand statt Resend-API genutzt wird. ICS: `esc` behandelte `\n`, aber nicht einzelnes `\r` → eingeschleuste Kalender-Eigenschaften (z. B. `ATTENDEE`, `URL`) bei toleranten Kalendern. → `safeSubject` in `sendMail`, ICS-Escaping für `\r` und Steuerzeichen. HTML-Escaping aller Mail-Texte: ✔ (`textToHtml`). | ✅ |
| S2-09 | niedrig | `modules/notifications.ts:39` | Ausblenden blockierter Personen nur über `data.actorId`; Beitrittsanfragen (`data.userId`) und Gehpartner-Anfragen (`data.fromUserId`) blockierter Personen blieben sichtbar. → alle drei Felder werden geprüft. | ✅ |
| S2-10 | niedrig | `modules/me.ts:224`, `modules/rural.ts:408` | Nach Kontolöschung blieb der Anzeigename in Benachrichtigungen **anderer** Personen (`join_request`, `partner_request`, `partner_accepted` speichern `displayName` in `data`). → `DELETE /me` löscht Hinweise mit `actorId`/`userId`/`fromUserId` = Person; `partner_accepted` trägt jetzt `actorId`. | ✅ |
| S2-11 | niedrig | `modules/challenges.ts:175` | Gruppen-Challenge: wer beigetreten war und dann **entfernt/gesperrt** wurde, sah weiter die Rangliste mit Namen der Gruppenmitglieder (`canSee` → `joined`). → Nicht-Mitglieder sehen nur die eigene Zeile. | ✅ |
| S2-12 | niedrig | `modules/rural.ts:337` | Gehpartner-Anfrage einer später blockierten Person konnte noch angenommen werden (legt 1:1-Walk mit Treffpunkt an). → 404 bei Blockierung in beide Richtungen. | ✅ |
| S2-13 | mittel | `modules/activities.ts:32`, `modules/social.ts:134` | Eingetragene Routen (GPX/aufgezeichnet) beginnen und enden meist **an der Wohnung**. Sie sind für Sichtbarkeit `group` (Mitglieder gemeinsamer Gruppen), `followers` und `public` (alle Angemeldeten) vollständig sichtbar. | ✅ Entscheidung Lena: Privatzone 300 m um Start und Ziel für andere Personen (`lib/geo.ts` `maskRouteForOthers`), eigene Route vollständig. |
| S2-14 | niedrig | `modules/groups.ts:576` | `GET /groups/:id/photo` ist öffentlich – auch für Gruppen „nur auf Einladung“. Die ID (UUID) ist nicht erratbar und wird nur über Einladungscode/-link oder an Mitglieder ausgegeben; die Einladungsseite braucht das Bild ohne Anmeldung. | ⏳ bewusst akzeptiert (Restrisiko: wer die ID kennt, z. B. nach Austritt, sieht weiter das Gruppenbild). Gruppenbild-Hinweis in der Oberfläche: „für alle sichtbar, keine Personen zeigen“. |
| S2-15 | niedrig | `server/src/lib/access.ts` (`canSeePost`, `canSeePhoto`), `lib/people.ts` (`ViewerContext.distanceWalks`, `canSeePostWith`), `modules/social.ts` (`visiblePostSql`, `serializePosts`, `POST /posts`), `modules/photos.ts`; Oberfläche `web/src/pages/rural/DistanceSection.tsx`, `web/src/pages/walks/WalkDetail.tsx` | Beiträge zu „Gemeinsam auf Distanz“-Terminen: Übersicht postete mit `visibility: 'public'` (alle Angemeldeten, auch im Profil-Feed `GET /feed?userId=` einer sonst privaten Person), die Walk-Seite mit `'followers'` (andere Teilnehmende sahen dann fast nichts). | ✅ Entscheidung Lena: Beiträge mit `walkId` eines Distanz-Termins sind – **unabhängig von `visibility`** – nur für Autorin, Erstellerin des Termins und Personen mit Zusage (`walk_rsvps.status = 'yes'`) sichtbar; gilt für alle Feeds, einzelne Beiträge, Kommentare, Herzen und Fotos dazu. Schreiben nur für Teilnehmende (403 `not_walk_participant`). Oberfläche sendet einheitlich `visibility: 'group'` und zeigt „Sichtbar für alle, die bei diesem Termin mitmachen“. Test: `server/test/social.test.ts` („Beiträge zu Gemeinsam auf Distanz (S2-15)“). |
| S2-16 | niedrig | `modules/walks.ts:511` | „Gemeinsam auf Distanz“ ohne Gruppe speichert `lat/lon` des **PLZ-Mittelpunkts der Erstellerin**; `WalkSummary.lat/lon` gibt ihn an alle aus → PLZ ableitbar (Stadt steht ohnehin da). | ⏳ Empfehlung: für `kind = 'distance'` `lat/lon` = Stadtmittelpunkt oder `null`. |
| S2-17 | niedrig | `modules/social.ts` (`/users/:id/follow`, `/reports`), `modules/rural.ts` (`/rural/partners?postalCode`) | Keine eigene Ratenbegrenzung für Folge-Anfragen (Benachrichtigungs-Flut) und Meldungen; Gehpartner-Entfernungen (ganze km) über viele `postalCode`-Abfragen trianguliertbar (Ergebnis ≈ PLZ, Stadt ist ohnehin sichtbar). | ⏳ Empfehlung: Tageskontingent für Folge-Anfragen; Ratenbegrenzer S-05f gilt auch für `lib/ratelimit.ts` (im Speicher). |
| S2-18 | niedrig | `lib/access.ts` (`canJoinWomenOnly`) | Geschlecht ist Selbstauskunft; wer nach dem Beitritt das Geschlecht ändert, bleibt Mitglied. Leitung kann Personen entfernen/sperren. | ⏳ Hinweis (Produkt): Moderation statt Technik. |
| S2-19 | niedrig | `modules/groups.ts` (E-Mail-Einladung) | Einladungs-Mail nennt im Betreff den frei wählbaren Anzeigenamen der einladenden Person („Gehmeinsam-Team lädt Sie …“) → Vortäuschen möglich; persönliche Nachricht kann Links enthalten (Mailprogramme verlinken sie). | ✅ Entscheidung Lena: Anzeigenamen mit „Gehmeinsam“, „Team“, „Admin“, „Moderat…“, „Support“ werden abgelehnt (`modules/me.ts`). |

### Geprüft und in Ordnung (Auswahl)

- **Treffpunkt** nur über `canSeeMeetingPoint`: Detail, Liste/Karte (nur Gruppen-/PLZ-Mittelpunkt), ICS, Aushang (`/poster` nur aktive Mitglieder, ohne Treffpunkt), Serien (`SeriesSummary` ohne Treffpunkt), Benachrichtigungen/E-Mails (Absage, Bestätigung, Gehpartner: nur Titel/Zeit, „Treffpunkt in der App“). Interessen-Mails: nur Art, Stadt, gerundete km.
- **pending/banned** sind keine Mitglieder (`isActiveMember`, `walkSummaries`, `loadViewerContext`, `canSeeContent`); Austreten hebt Sperre nicht auf; Einladung/Code umgehen Sperre und „nur Frauen“ nicht.
- **Einladungsgruppen**: nicht in `GET /groups`, `nearest`, `GET /walks` (Ortssuche), `rural/overview`; `GET /groups/:id`, `/walks?groupId=`, `/walks/:id` → 404.
- **Rollen**: Moderatorin kann keine Moderatorin ernennen/abberufen, keine Leitung entfernen/sperren; Gründerin kann nicht entfernt/gesperrt werden und nicht austreten; Aktionen auf sich selbst → 400; Leitung fremder Gruppe → 403.
- **IDOR**: fremde Aktivitäten (`loadOwn` / `canSeeActivity`), Fotos (`canSeeContent`, 404), Serien (`requireGroupLead(series.groupId)`), Mitglieder anderer Gruppen (`where groupId`), Gehpartner-Anfragen (nur Empfängerin), Ziele (`goals.userId`), Abzeichen-Teilen/Urkunde (`loadOwnBadge`), Benachrichtigungen (`userId`), Beiträge/Kommentare (Sichtbarkeit + Autorin/Leitung).
- **Massenzuweisung**: alle zod-Schemas sind `z.object` (unbekannte Felder werden verworfen); `PATCH` übernimmt nur gesendete Schemafelder (`sentFields`); kein `kind`/`groupId`/`createdBy`/`userId` aus dem Body.
- **SQL**: nur Drizzle-Abfragen bzw. `sql`-Template mit Parametern; kein `sql.raw`. `ilike`-Suche escaped `%`/`_`.
- **Personen** nur als `PersonRef`; `birthYear`, `gender`, `email`, `phoneNumber`, `postalCode`/`lat`/`lon` des Profils erscheinen in keiner fremden Antwort (grep über alle Module; nur `GET /me`, Export, `canJoinWomenOnly`). Gehpartner: Entfernung gerundet, keine PLZ.
- **Tokens**: Abzeichen-Teilen 192 Bit (`randomBytes(24)`), E-Mail-Einladung 192 Bit, Teilen beenden löscht Token; geteilte Seite nur `displayName` + Abzeichen.
- **Uploads**: Gruppenbild, Fotos, Profilbild über `storeImage` (Neu-Kodierung, EXIF weg, Größen-/Pixelgrenze); GPX ≤ 5 MB, DTD/Entitäten abgelehnt, `processEntities: false`, Punktzahl auf 2000 vereinfacht. Bildauslieferung `private`, `nosniff`.
- **Export/Löschung**: alle neuen Tabellen (Serien, Einladungen, Interessen, Gehpartner-Gesuche/-Anfragen, Ziele, Abo, Benachrichtigungen, Abzeichen, Punkte, Challenges) im Export; Löschung per Kaskade, Dateien (Profilbild, Fotos, Bilder aufgelöster Gruppen) werden entfernt.
- **Premium**: alle Routen nur eigene Daten; `dev`-Anbieter in Produktion verboten (S-11).
- **Feed nach `walkId`** (`social.ts` `canSeeWalk`): Partner-Walk nur Beteiligte, Einladungsgruppe nur Mitglieder, Blockierung der Erstellerin → 404; einzelne Beiträge zusätzlich nach `visibility` bzw. bei Distanz-Terminen nur für Teilnehmende (S2-15). ✔
- **Oberfläche**: `dangerouslySetInnerHTML` nur für das vom Server erzeugte QR-SVG (Inhalt = `APP_URL` + Code, keine Benutzertexte) ✔; `target="_blank"` nur mit `rel="noopener noreferrer"` ✔; Links mit Benutzerdaten nur `encodeURIComponent`-kodiert (WhatsApp/Mailto serverseitig) ✔; `localStorage` nur Schriftgröße/Anrede ✔; Tokens nicht in Drittanfragen (`Referrer-Policy: no-referrer`) ✔; Benutzertexte nur über React-Textknoten ✔.
