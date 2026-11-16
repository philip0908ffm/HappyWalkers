# Sicherheit und Datenschutz – Bedrohungsmodell, Maßnahmen, Befunde

Verantwortlich: Aylin Demir. Regeln zur Sichtbarkeit: `docs/WER-SIEHT-WAS.md`.
Tests zu den Befunden: `server/test/security.test.ts` (S-xx), `web/src/pages/auth/safeNext.test.ts`.

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
| S-11 | mittel | `server/src/config.ts:54` | `BILLING_PROVIDER` ist standardmäßig `dev` → in Produktion Premium ohne Zahlung. Geschäftsentscheidung (Lena); derzeit nur Warnung beim Start. | ⏳ Lena |
| S-12 | niedrig | `web/src/pages/profile/Settings.tsx` | Einstellungen: Export per GET mit Cookie (ok, nur eigene Daten), Löschen mit Eingabe „LÖSCHEN“ + Server-Prüfung (ok). Hinweis: Fotos im Format HEIC werden vom vorinstallierten sharp nicht gelesen (nur AVIF/HEIF) → Fehlermeldung `invalid_image`. | ⏳ Hinweis Paket C |

## 5. Für die zweite Prüfrunde (Pakete A/B/C)

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
