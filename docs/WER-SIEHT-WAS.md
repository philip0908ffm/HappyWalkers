# Wer sieht was? – technische Fassung

Verantwortlich: Aylin Demir (Sicherheit & Datenschutz). Verständliche Fassung für Nutzerinnen:
`web/src/pages/info/WhoSeesWhat.tsx` (`/wer-sieht-was`, Texte in `web/src/i18n/locales/*/info.json`).
**Beide Fassungen gemeinsam ändern.**

Alle Module nutzen die zentralen Funktionen in `server/src/lib/access.ts` (und `server/src/lib/people.ts`
für Personen/Profilbilder) statt eigener Regeln. Neue Regeln dort ergänzen, nicht im Modul.

## Grundsätze

1. **Standard ist privat.** Profil `profileVisibility = 'private'`, Fotos/Beiträge/Einträge `visibility = 'group'`.
2. **Nie an andere ausliefern:** `user.email`, `user.phoneNumber`, `profile.birthYear`, `profile.gender`,
   `profile.lat/lon`, `profile.postalCode`, `walks.meetingLat/Lon/Address` ohne Berechtigung,
   `photos.storageKey`, `userBadges.shareToken` (außer an die Eigentümerin), Sitzungs-Tokens.
   Personen erscheinen nur als `PersonRef = { id, displayName, avatarUrl }`.
3. **Blockieren gilt immer und in beide Richtungen** (`isBlockedEitherWay`) – vor jeder anderen Regel.
   Blockierte Profile → 404 (nicht 403, damit die Blockierung nicht erkennbar ist).
4. **Nicht vorhanden und nicht erlaubt sehen gleich aus**, wo eine Existenz etwas verraten würde
   (Einladungsgruppen, Fotos, Profilbilder → 404).
5. **Anonyme Anfragen** (`viewerId` undefined) sehen keine Inhalte von Personen (`canSeeContent` → false).

## Regeln im Einzelnen

| Daten | Wer darf lesen | Funktion / Ort |
|---|---|---|
| Profil-Details (Ort, Abzeichen, Statistik, Bio) | selbst; `followers` → bestätigte Folgende; `public` → alle Angemeldeten | `modules/social.ts` `GET /users/:id` |
| Anzeigename | alle, die die Person in einem Kontext sehen (Gruppe, Walk, Beitrag) | `PersonRef` |
| Name in Ranglisten | `leaderboardMode = 'hidden'` → „Teilnehmerin“ | `modules/challenges.ts` |
| Profilbild | selbst, gemeinsame aktive Gruppe, bestätigte Kontakte, öffentliches Profil; sonst 404 | `lib/people.ts` `avatarVisibleSet` |
| Geburtsjahr, Geschlecht | **nur selbst** (`GET /me`, Export). Geschlecht nur für `canJoinWomenOnly` | `lib/access.ts` |
| Wohnort | gespeichert nur PLZ + PLZ-Mittelpunkt; andere sehen höchstens `city`; Entfernungen auf ganze km gerundet | `lib/geo.ts`, `modules/rural.ts` |
| Genauer Treffpunkt | Gruppen-Walk: aktive Mitglieder; Partner-Walk: Personen mit RSVP-Zeile; Erstellerin; sonst `meetingPoint: null`, Liste/Karte nur `lat/lon` des Gruppen-/PLZ-Mittelpunkts. Gilt auch für ICS-Datei | `canSeeMeetingPoint` |
| Teilnehmerliste eines Walks | Mitglieder / Teilnehmende, sonst `participants: null` | `modules/walks.ts` |
| Beiträge, Fotos, Einträge | `private` selbst; `group` aktive Mitglieder der Gruppe (ohne Gruppe: wie `followers`); `followers` bestätigte Folgende; `public` alle Angemeldeten | `canSeeContent` |
| Kommentare, Herzen | wer den Beitrag sehen darf | `canSeeContent` des Beitrags |
| Folgen | nur nach Bestätigung (`status = 'accepted'`) | `isAcceptedFollower` |
| Blockierungen, Meldungen | nur die Person selbst (Meldungen zusätzlich Betreiber-Team) | `modules/social.ts` |
| Gehpartner-Gesuch | angemeldete Personen im Umkreis: `PersonRef`, Stadt, gerundete Entfernung, Tempo, Zeiten, Notiz – keine Kontaktdaten | `modules/rural.ts` |
| Geteiltes Abzeichen | öffentlich nur per zufälligem Token, nur `displayName` + Abzeichen; Teilen beenden löscht Token | `modules/badges.ts` |
| Browser-Standort | nur als Suchparameter `lat/lon` einer Anfrage; **nie speichern, nie protokollieren** | `modules/groups.ts`, `walks.ts` |
| E-Mail/Telefon | nur selbst; Benachrichtigungen laufen über Gehmeinsam | `services/notify.ts` |
| Fotos (Dateien) | nur über Routen mit Zugriffsprüfung, nie statisch; EXIF/GPS beim Speichern entfernt | `services/storage.ts` |
| Gruppen „nur auf Einladung“ | erscheinen nicht in Suchen; Details nur für Mitglieder/Eingeladene (sonst 404) | `modules/groups.ts` |
| „Nur Frauen“-Gruppen | Beitritt nur mit `gender = 'woman'`; Geschlecht wird nie angezeigt | `canJoinWomenOnly` |
| Gesperrte Mitglieder (`banned`) | keine Inhalte der Gruppe, kein Treffpunkt, kein erneuter Beitritt (auch nicht per Einladung) | `isActiveMember` |

## Benachrichtigungen

- Entfernen/Sperren aus einer Gruppe, Löschen eines Kommentars, Ablehnen einer Gehpartner-Anfrage
  und Blockieren erzeugen **keine** Benachrichtigung.
- `notifications.data` darf keine Kontaktdaten, kein Geburtsjahr und keinen Treffpunkt enthalten
  (Treffpunkt nur über die Walk-Seite mit Zugriffsprüfung).

## Eigene Daten

- `GET /me/export` liefert alle Daten der Person (Art. 15/20 DSGVO) – ohne Sitzungs-Tokens.
  Neue Tabellen mit Personenbezug **dort ergänzen**.
- `DELETE /me` löscht per Kaskade; Dateien (Fotos, Profilbild, Bilder aufgelöster Gruppen) werden danach
  von der Platte entfernt. Neue Tabellen mit `user_id` brauchen `onDelete: 'cascade'` (oder `set null`
  bei gemeinsamem Inhalt) und – falls sie Dateien referenzieren – einen Eintrag in `modules/me.ts`.

## Checkliste für neue Endpunkte

- [ ] Liefert der Endpunkt Personen? → nur `PersonRef`.
- [ ] Inhalte einer Person? → `canSeeContent` (inkl. Blockieren).
- [ ] Treffpunkt/Koordinaten? → `canSeeMeetingPoint`, sonst nur ungefährer Ort.
- [ ] Gruppenbezug? → `getMembership` + `isActiveMember` / `isGroupLead`, gesperrte ausschließen.
- [ ] Datei? → `resolveKey` + Zugriffsprüfung, `Cache-Control: private`.
- [ ] Test für „darf nicht sehen“ geschrieben.
