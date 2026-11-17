# Gestaltungskonzept „Draußen unterwegs“ – Überarbeitung der Oberfläche

Verfasst von Miriam Schulz (Gestaltung und Barrierefreiheit), umgesetzt wird es von Jonas.
Stand: 17.11.2026. Musterseite zur Abstimmung: `docs/design-muster.html`, Bildschirmfoto: `docs/design-muster.png`.

**Kurz:** Wir ändern das Aussehen, aber nicht die Funktion. Texte, Rollen, Beschriftungen und Abläufe bleiben
wie sie sind. Die Barrierefreiheitsregeln (WCAG 2.2 AA, 18 px Grundschrift, drei Schriftgrößen, 200 % Zoom,
320 px Breite, Kontraste, 44-px-Klickflächen, sichtbarer Fokus, 5 Navigationspunkte mit Symbol und Text,
`prefers-reduced-motion`) gelten unverändert und sind in jedem Wert unten berücksichtigt.

---

## 1. Diagnose: Warum wirkt es „altbacken / krankenkassenartig“?

Grundlage: Bildschirmfotos von Start (ab- und angemeldet), Walks-Liste, Walk-Seite, Gruppe, Vitrine und
„Walk eintragen“ bei 1280 px und 390 px Breite.

| Bereich | Beobachtung | Wirkung |
|---|---|---|
| **Farben** | Flaschengrün `#1d5c3f` auf Creme `#fbf8f2`, dazu Rostrot `#a9441c` und ein blasses Mintgrün für fast jede Fläche. Alles ist mittelhell, es gibt keinen echten dunklen Ruhepol und keinen frischen Akzent. | Wie Apotheke, Krankenkasse oder Reformhaus. Gleichzeitig die übliche „Creme + Terrakotta“-Optik vieler Vorlagen. |
| **Rahmen** | Fast jedes Element hat einen 2 px breiten beigen Rahmen **und** einen Schatten **und** große runde Ecken (1,25 rem). Karten stecken in Karten (Start: „Ihre nächsten Walks“ ist eine Karte mit Karten darin). Gesperrte Abzeichen sind gestrichelt umrandet, leere Zustände ebenso. | Kastig, unruhig, wie ein Formular. Die Fläche zerfällt in viele gleich wichtige Kästen. |
| **Hierarchie** | Fast alles ist fett (700): Navigation, Beschriftungen, Knöpfe, Meta-Angaben in Pillen. Überschriften sind nur wenig größer als der Text. Kleine Überschriften in Großbuchstaben („WANN“, „DAUER“) wirken amtlich. | Kein Blickfang, alles ruft gleich laut. |
| **Schrift** | Atkinson Hyperlegible (Version 1) überall, auch in großen Überschriften und Zahlen. Die durchgestrichene Null in „09:30“ und „2026“ ist in großen Zahlen (Datumskachel, Kennzahlen) sehr auffällig. | Technisch, „Behördenschrift“. Die Schrift ist für Fließtext richtig, für Überschriften und große Zahlen fehlt Charakter. |
| **Navigation** | Aktiver Punkt als dunkelgrüner Block. | Schwer und altmodisch (wie ein Reiter in einer Verwaltungssoftware). |
| **Bildsprache** | Strichmännchen im Logo und im Startbild, Kreis als Sonne, Hügel in Mint. | Wirkt wie ein Piktogramm auf einem Hinweisschild oder in einer Broschüre zur Sturzvorbeugung, also „seniorig“ statt einladend. |
| **Dichte / Layout** | Walks-Liste: 16 gleich große Karten mit je 6 bis 8 Symbolzeilen. Die Startseite für Angemeldete endet nach wenigen Kästen. Kein Abschnitt hat einen eigenen Rhythmus. Seitenköpfe sind nur Überschrift plus grauer Text. | Monoton. Es fehlt eine Bühne, besonders für die Abzeichen, auf die unsere Persona stolz ist. |
| **Abzeichen** | Gute, farbunabhängige Wappen, aber blasse Pastellfüllungen auf weißen Karten mit gestrichelten Rahmen. Erreichte und offene Abzeichen sehen sich zu ähnlich. | Die Vitrine wirkt wie eine Checkliste, nicht wie eine Sammlung. |

Das ist schon **gut** und bleibt so: großzügige Klickflächen, klare Texte, Symbole immer mit Text, Fokusrahmen
mit gelbem Hof, Tempo-Zeichen mit 1 bis 3 Pfeilen, Stufen über Sterne und Rahmenlinien erkennbar, keine
Bewegung.

---

## 2. Gestaltungsidee

**„Draußen unterwegs“:** Die Oberfläche erinnert an eine gute Outdoor-Marke oder eine hochwertige
Wanderkarte. Das Grün ist ein tiefes Tannen-Petrol, dazu kommen kühle Kieselgrau-Töne und ein einziger warmer
Akzent: Sonnengelb wie Morgenlicht. Höhenlinien, Wege und Landschaftsflächen ersetzen die Strichmännchen.
Klare, selbstbewusste Überschriften in Figtree, gut lesbarer Fließtext in Atkinson Hyperlegible Next.
Weniger Rahmen, mehr Weißraum. Wichtiges bekommt eine dunkle Bühne, zum Beispiel der Startseiten-Kopf und
die erreichten Abzeichen.

Leitlinien:
- **Ruhig statt bunt:** Viel Weiß und Kieselgrau, Petrol für Handlung, Gelb nur für **eine** Hauptsache je Ansicht.
- **Linksbündig:** Text und Überschriften stehen links. Zentriert sind nur Erfolgsmeldungen und Zahlen in Kacheln.
- **Ein Rahmen genügt:** Karten haben 1 px hellen Rahmen und einen leichten Schatten. Keine Karte in einer Karte.
- **Erwachsen und herzlich:** keine Comic-Figuren, keine Emojis, keine Verläufe in Lila. Wärme entsteht durch Sprache, Gelb und Landschaftsbilder.

---

## 3. Design-Tokens (fertiger Block für `web/src/styles/tokens.css`)

Alle **bisherigen Variablennamen bleiben erhalten**, damit `components.css`, `features.css`, `pages-e.css`,
`print.css` und `pages/info/info.css` sofort weiter funktionieren. Neu hinzu kommen: `--font-display`,
`--weight-*`, `--line-height-tight`, `--font-size-display`, `--space-8`, `--radius-pill`, `--shadow-raised`,
`--control-height`, `--text-max`, `--color-on-accent`, `--color-accent-text`, `--color-hero*`,
`--color-error-strong`, `--color-warning`, `--color-warning-border`, `--tier-*-soft/-mid`.

> **Bedeutungswechsel bei `--color-accent`:** bisher Rostrot (weiße Schrift darauf möglich), künftig
> Sonnengelb (**nur dunkle Schrift darauf**, `--color-on-accent`). Für farbigen Akzent-**Text** gibt es
> `--color-accent-text`. Jonas muss deshalb die vier Stellen anpassen, die `--color-accent` heute mit weißer
> Schrift oder als Textfarbe verwenden (siehe Abschnitt 5).

```css
/*
 * Gestaltungsgrundlagen „Draußen unterwegs“ (Miriam Schulz, 11/2026)
 * Alle Größen in rem → Schriftgröße-Einstellung und Browser-Zoom wirken überall.
 * Kontraste (WCAG 2.x) sind hinter jeder Farbe angegeben: gegen Weiß (#fff) / Hintergrund (#f4f5f1).
 */
:root {
  /* ---- Neutralfarben (Kiesel, leicht grünlich, NICHT Creme) ---- */
  --color-bg: #f4f5f1;            /* Seitenhintergrund */
  --color-surface: #ffffff;       /* Karten, Felder */
  --color-surface-2: #e8ece6;     /* abgesenkte Flächen, Tabellenkopf, Fußzeile */
  --color-text: #172321;          /* 16,2:1 / 14,8:1 – auf surface-2 13,5:1 */
  --color-text-muted: #4a5754;    /* 7,6:1 / 6,9:1 – auf surface-2 6,3:1 */
  --color-border: #6e7b77;        /* 4,4:1 / 4,0:1 – Rahmen von Bedienelementen (≥ 3:1) */
  --color-border-soft: #d3dad4;   /* nur Schmuck: Kartenrahmen, Trennlinien (keine Bedeutung!) */

  /* ---- Hauptfarbe: Tannen-Petrol ---- */
  --color-primary: #0e5149;       /* 9,2:1 / 8,4:1 – auf primary-soft 7,6:1 */
  --color-primary-strong: #093b35;/* 12,4:1 / 11,4:1 */
  --color-primary-soft: #dcede7;  /* Fläche für „ausgewählt“, Hinweise */
  --color-on-primary: #ffffff;    /* auf primary 9,2:1, auf primary-strong 12,4:1 */

  /* ---- Akzent: Sonnengelb (nur Fläche, nie Textfarbe auf Weiß!) ---- */
  --color-accent: #f5b82e;        /* mit --color-on-accent: 9,1:1; gegen Hero 6,6:1 */
  --color-accent-strong: #e9a91b; /* Hover der gelben Knöpfe (on-accent darauf 7,8:1) */
  --color-accent-soft: #fdefc8;   /* Text darauf 14,1:1 */
  --color-on-accent: #172321;
  --color-accent-text: #7a4e00;   /* warmer Akzent als Textfarbe: 7,2:1 / 6,5:1 */

  /* ---- Dunkle Bühne (Startseiten-Kopf, Erfolgsseite) ---- */
  --color-hero: #0b3f3a;
  --color-hero-line: #175a52;     /* Höhenlinien, nur Schmuck */
  --color-on-hero: #ffffff;       /* 11,8:1 */
  --color-on-hero-muted: #c9ded8; /* 8,4:1 */

  /* ---- Zustände ---- */
  --color-success: #1c6b3c;       /* 6,5:1 / 6,0:1 – auf success-soft 5,6:1 */
  --color-success-soft: #e1f1e6;
  --color-error: #b3261e;         /* 6,5:1 / 6,0:1 – auf error-soft 5,6:1 */
  --color-error-strong: #8c1d17;  /* Hover „Löschen“ (ersetzt festes #7d1013) */
  --color-error-soft: #fce8e6;
  --color-warning: #7a4e00;       /* 7,2:1 – auf warning-soft 6,5:1 */
  --color-warning-border: #a86b00;/* Rahmen/Balken auf warning-soft 4,0:1 */
  --color-warning-soft: #fff3cf;
  --color-premium: #34508f;       /* Nachtblau statt Lila: 7,8:1 – auf premium-soft 6,6:1 */
  --color-premium-soft: #e6ecf8;
  --color-heart: #b0174a;         /* 6,9:1 */

  /* ---- Fokus (doppelt: blauer Rahmen + gelber Hof, wirkt auf hell UND dunkel) ---- */
  --color-focus: #1f4fd1;         /* 6,8:1 / 6,2:1 */
  --color-focus-halo: #f5b82e;    /* gegen Petrol 5,1:1, gegen Hero 6,6:1 */

  /* ---- Abzeichen-Stufen: Linie (Text-tauglich) / Fläche / Band ---- */
  --tier-1: #8a552a; --tier-1-soft: #f5e4d3; --tier-1-mid: #d49a68; /* Bronze: 6,2:1, auf soft 5,0:1 */
  --tier-2: #56636e; --tier-2-soft: #ebeff2; --tier-2-mid: #b7c1ca; /* Silber: 6,2:1, auf soft 5,3:1 */
  --tier-3: #7d6100; --tier-3-soft: #fbf0c4; --tier-3-mid: #e6b93a; /* Gold:   5,9:1, auf soft 5,1:1 */
  --tier-locked: #6e7b77;         /* nur Linien (4,4:1); Text bei gesperrten Abzeichen = --color-text-muted */

  /* ---- Schrift ---- */
  --font-family: 'Atkinson Hyperlegible Next Variable', 'Atkinson Hyperlegible', system-ui, -apple-system,
    'Segoe UI', Roboto, Arial, sans-serif;               /* Fließtext, Formulare, Beschriftungen */
  --font-display: 'Figtree Variable', 'Atkinson Hyperlegible Next Variable', system-ui, -apple-system,
    'Segoe UI', Roboto, Arial, sans-serif;               /* Überschriften, Logo-Wort, große Zahlen */
  --font-size-sm: 0.9rem;     /* 16,2 px – nur Hinweise unter Feldern, Meta-Zeilen */
  --font-size-md: 1rem;       /* 18 px Grundschrift */
  --font-size-lg: 1.25rem;    /* 22,5 px – h3, Kartentitel */
  --font-size-xl: 1.6rem;     /* 28,8 px – h2 */
  --font-size-xxl: 2.2rem;    /* 39,6 px – h1 */
  --font-size-display: clamp(2.3rem, 1.7rem + 2.6vw, 3.6rem); /* nur Startseiten-Kopf */
  --line-height: 1.6;
  --line-height-tight: 1.2;   /* Überschriften */
  --weight-regular: 400;
  --weight-medium: 560;       /* Navigation, Meta-Beschriftungen */
  --weight-bold: 700;         /* Knöpfe, Feldbeschriftungen, Kartentitel */
  --weight-display: 780;      /* h1/h2 in Figtree */

  /* ---- Abstände (4-px-Raster in rem) ---- */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-7: 3rem;
  --space-8: 4.5rem;          /* Abstand zwischen großen Seitenabschnitten */

  /* ---- Formen ---- */
  --radius-sm: 0.5rem;
  --radius: 0.75rem;          /* Felder, Kacheln */
  --radius-lg: 1rem;          /* Karten (vorher 1,25 rem) */
  --radius-pill: 999px;       /* Knöpfe, Marken */
  --shadow: 0 1px 2px rgb(23 35 33 / 0.06), 0 2px 10px rgb(23 35 33 / 0.05);   /* Karte */
  --shadow-raised: 0 2px 4px rgb(23 35 33 / 0.08), 0 10px 28px rgb(23 35 33 / 0.10); /* Suchfeld im Kopf, Mitteilung */

  /* ---- Maße ---- */
  --tap-min: 2.75rem;         /* ≥ 44 px auch bei 16 px Browser-Grundschrift */
  --control-height: 3rem;     /* Knöpfe und Felder: 54 px bei Normal */
  --content-max: 72rem;
  --text-max: 42rem;          /* Zeilenlänge Fließtext ≈ 70 Zeichen */
  --nav-height: 4.5rem;
  --sidebar-width: 22rem;
}

/* Schriftgröße in der App einstellbar – UNVERÄNDERT: Normal 18 px / Groß 20 px / Sehr groß 23 px */
html { font-size: 112.5%; }
html[data-font='gross'] { font-size: 125%; }
html[data-font='sehr-gross'] { font-size: 143.75%; }

/* Tempo-Farben (immer mit Pfeil-Symbol und Text) – Linie/Text ≥ 4,5:1 auf Weiß und auf der eigenen Fläche */
:root {
  --tempo-gemuetlich: #1c6b3c;  --tempo-gemuetlich-soft: #e1f1e6;  /* 6,5:1 / 5,6:1 */
  --tempo-zuegig: #8a5a00;      --tempo-zuegig-soft: #fdf0d2;      /* 5,9:1 / 5,2:1 */
  --tempo-flott: #a8361e;       --tempo-flott-soft: #fbe5de;       /* 6,5:1 / 5,4:1 */
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
@media (forced-colors: active) {
  :root { --color-focus: Highlight; }
}
```

Die Kontrastwerte habe ich mit der WCAG-Formel nachgerechnet. Die Musterseite ist mit axe (WCAG 2.2 AA)
geprüft und ohne Fehler.

### Schrift

| Rolle | Schrift | Paket | Schnitte |
|---|---|---|---|
| Fließtext, Formulare, Navigation | **Atkinson Hyperlegible Next** (Nachfolger der jetzigen Schrift, gleiche Lesbarkeitsmerkmale, aber 7 Stärken und moderner) | `@fontsource-variable/atkinson-hyperlegible-next` (5.3.0, OFL-1.1) | variabel 200–800 |
| Überschriften, Logo-Wort, große Zahlen | **Figtree** (freundliche, klare Grotesk, wirkt modern und hochwertig, gut lesbar) | `@fontsource-variable/figtree` (5.3.0, OFL-1.1) | variabel 300–900 |

**Warum neue Pakete?** Installiert ist nur `@fontsource/atkinson-hyperlegible` (Version 1, nur 400/700).
Mit nur zwei Stärken ist keine ruhige Abstufung möglich, deshalb ist heute alles fett. Eine zweite Schrift für
Überschriften ist der wirksamste einzelne Schritt weg von der Amtsoptik. Beide Pakete sind selbst gehostet,
es gibt keine Anfragen an fremde Dienste. Die Lizenz ist OFL. Mit dem Teil-Laden (latin und latin-ext über
`unicode-range`) kommen etwa 2 × 50 KB als woff2 hinzu.

**Installation durch Jonas** (im Hauptordner):
```bash
npm install -w web @fontsource-variable/atkinson-hyperlegible-next@^5.3.0 @fontsource-variable/figtree@^5.3.0
```
In `web/src/main.tsx` die beiden Zeilen `@fontsource/atkinson-hyperlegible/400.css` und `/700.css` ersetzen durch:
```ts
import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource-variable/figtree';
```
Danach `@fontsource/atkinson-hyperlegible` aus `web/package.json` entfernen (Kann).

**Hinweis Null:** Atkinson Next behält die durchgestrichene Null. Sie hat keine Alternative, ich habe das
geprüft. Für Einladungscodes ist das sogar gut (O und 0 lassen sich unterscheiden). **Große und wichtige Zahlen**
setzen wir in `--font-display` mit `font-variant-numeric: tabular-nums`: Datumskachel, Kennzahlen-Kacheln,
Uhrzeit-Zeile der Terminkarte, `.facts__big`, Punkte auf der Erfolgsseite.

### Typo-Regeln
- `h1`, `h2`: `font-family: var(--font-display); font-weight: var(--weight-display); letter-spacing: -0.01em; line-height: var(--line-height-tight)`.
- `h3`: `--font-display`, `--weight-bold`, `--font-size-lg`.
- Fließtext 400. Fett (700) **nur** für Knöpfe, Feldbeschriftungen, Kartentitel und wichtige Werte. Meta-Angaben normal in `--color-text-muted`.
- Kleine Großbuchstaben-Überschriften („WANN“, „DAUER“) als `.overline`: Figtree 700, `--font-size-sm`, `letter-spacing: 0.06em`. Nur dort, wo es sie heute schon gibt.
- Absätze `max-width: var(--text-max)`.

### Dunkelmodus: bewusst weggelassen
Begründung: (1) Feste Farben in SVG und Karten (`BadgeEmblem`, `RouteDrawMap`, Logo, Startbild,
Leaflet-Kartenkacheln, die hell bleiben). (2) Druckansichten und Aushang müssen hell bleiben. (3) Jede Seite
müsste ein zweites Mal mit axe und Tastatur geprüft werden. (4) Unsere Persona braucht ihn nicht. Wer sehr
starken Kontrast braucht, bekommt ihn über den Windows-Kontrastmodus (`forced-colors`), den wir schon
unterstützen. Die Tokens sind so angelegt, dass ein späterer Dunkelmodus nur einen zweiten `:root`-Block braucht.

---

## 4. Komponenten-Vorgaben

Alle Werte beziehen sich auf die Tokens oben. Die Musterseite zeigt Kopfzeile, Startseiten-Kopf, Karten, Knöpfe,
Formularfeld, Bestätigung, Kennzahlen und Abzeichen in fertiger Form. CSS-Ausschnitte lassen sich von dort
übernehmen.

### 4.1 Kopfzeile und Hauptnavigation (`Layout.tsx`, `components.css`)
- Kopf weiß, unten **1 px** `--color-border-soft` (statt 2 px), kein Schatten.
- **Logo:** neues Zeichen „Weg zur Sonne“ (Petrol-Quadrat mit Radius 16/64, gelbe Sonne, weißer
  geschwungener Weg, Hügellinie). Das SVG steht in der Musterseite. Daneben das Wort aus `t('app.name')` in
  Figtree 800, 1,3 rem, Farbe `--color-text`. **Den Namen nie fest eintragen** (siehe `docs/ARCHITEKTUR.md`,
  Abschnitt Projektname). Dasselbe Zeichen kommt in `web/public/favicon.svg`.
- **Navigationspunkte:** Symbol in `--color-primary`, Text `--color-text`, `--weight-medium`, Höhe `--control-height`.
  - Hover: `--color-surface-2` als Fläche (nur Schmuck, keine Funktion).
  - **Aktuelle Seite** (`aria-current="page"`): Fläche `--color-primary-soft`, Text `--color-primary-strong` in 700,
    **dazu ein 0,2 rem hoher Balken in `--color-primary`** unten (am Handy oben). So ist der Zustand nicht nur an der
    Farbe erkennbar (Balken + Fettung), und der schwere dunkle Block verschwindet.
- **Unter 60 em:** wie bisher fest am unteren Rand, Symbol über Text, oben 1 px Linie plus leichter Schatten
  `0 -2px 12px rgb(23 35 33 / .08)`. Bei 22 em (320 px) bleiben Schrift 0,72 rem und Polster 0 wie heute.
  Wichtig: Der Test „320 CSS-Pixel“ muss grün bleiben.
- Sprunglink unverändert.

### 4.2 Knöpfe (`.btn`)
| Art | Aussehen | Einsatz |
|---|---|---|
| **Primär** `.btn` | Pille (`--radius-pill`), Fläche `--color-primary`, Schrift weiß 700, Höhe `--control-height`, Polster `0.5rem 1.5rem`. Hover `--color-primary-strong`. | Hauptaktion eines Bereichs |
| **Hervorgehoben** `.btn--accent` *(neu)* | Fläche `--color-accent`, Schrift `--color-on-accent`, Hover `--color-accent-strong`. | **Höchstens einmal je Ansicht**: Suche im Startseiten-Kopf, „Walk speichern“, „Zusagen“ |
| **Sekundär** `.btn--secondary` | Weiß, 2 px Rahmen `--color-primary`, Schrift `--color-primary-strong`. Hover `--color-primary-soft`. | Nebenaktionen |
| **Auf dunkel** `.btn--on-dark` *(neu)* | Durchsichtig, 2 px Rahmen `--color-on-hero-muted`, Schrift weiß. Hover `--color-hero-line`. | „Anmelden“ im Startseiten-Kopf |
| **Text** `.btn--ghost` | Ohne Rahmen, unterstrichen, Schrift `--color-primary-strong`, Polster seitlich 0,75 rem, Mindesthöhe bleibt. | „Absagen“, „Alle ansehen →“ |
| **Gefahr** `.btn--danger` / `--danger-outline` | Wie bisher, Hover über `--color-error-strong` statt `#7d1013`. | Löschen, Austreten |

- Übergang nur `background-color`, `border-color` mit 120 ms (wird bei `prefers-reduced-motion` abgeschaltet). Keine Bewegung, kein Anheben.
- `disabled`: nicht mehr `opacity: .6`, sondern Fläche `--color-surface-2`, Schrift `--color-text-muted`, Rahmen `--color-border` (Kontrast bleibt lesbar).
- Klickfläche mindestens 44 × 44 px bleibt (`min-height: var(--control-height)`, `min-width: var(--tap-min)`).

### 4.3 Formularfelder (`.input`, `.select`, `.textarea`, `.choice`, `.switch`)
- Höhe `--control-height`, Polster `0.5rem 1rem`, Radius `--radius`, Rahmen 2 px `--color-border` (4,4:1).
- Hover: Rahmen `--color-text-muted`. Fokus: globaler Fokusrahmen **plus** Rahmen `--color-primary`.
- Beschriftung 700, Hinweis darunter `--font-size-sm` in `--color-text-muted`, Abstand zum Feld 0,5 rem.
- **Fehler:** Rahmen `--color-error` (2 px, nicht 3 px, dafür) Fläche `--color-error-soft`. Darunter die Meldung
  in Worten mit Warnsymbol, 700, `--color-error`. Die Verknüpfung über `aria-describedby` und `aria-invalid`
  bleibt wie heute.
- **Auswahlkacheln** `.choice`: Rahmen 1 px `--color-border-soft` → **2 px `--color-border`**, weil die Kachel ein Bedienelement ist (3:1).
  Gewählt: Rahmen 2 px `--color-primary`, Fläche `--color-primary-soft`. Radio und Kästchen bleiben sichtbar (`accent-color: var(--color-primary)`).
- **Schalter:** Bahn aus `--color-border`, an = `--color-primary`, Knopf weiß. Text „an/aus“ bleibt daneben.

### 4.4 Karten – allgemein (`.card`)
- Fläche weiß, **1 px** `--color-border-soft`, `--shadow`, Radius `--radius-lg`, Polster `--space-5`.
- **Keine Karte in einer Karte:** Wenn ein Abschnitt Karten enthält (Startseite „Ihre nächsten Walks“,
  Gruppe „Nächste Termine“), wird der Abschnitt **keine** `.card`, sondern ein Abschnitt mit Kopfzeile
  (`.section-head`: Überschrift links, Textknopf „Alle ansehen →“ rechts). Das ist eine reine Klassenänderung
  in `Home.tsx` und der Gruppenseite. Überschrift, `aria-labelledby` und IDs bleiben.
- `.card--warm`: Fläche `--color-accent-soft`, Rahmen 1 px `--color-warning-border` (ersetzt `#e7c3ae`).
- `.card--attention`: Rahmen 2 px `--color-accent-text` plus links 0,375 rem Balken.

### 4.5 Terminkarte (`WalkCard.tsx`, `.walk-card*`)
- Rahmen 1 px hell, Polster `--space-5`, Abstand Datum zu Inhalt `--space-5`.
- **Datumskachel als Kalenderblatt:** weiß mit 1 px Rahmen. Oben ein Streifen `--color-primary` mit dem
  Wochentag (weiß, Großbuchstaben, 0,06 em Zeichenabstand), darunter der Tag in Figtree 800 / 2 rem / `tabular-nums`,
  darunter der Monat in `--color-text-muted`. Unter 30 em liegt alles in einer Zeile wie heute.
- Titel: Figtree 700, `--font-size-lg`, Farbe `--color-text`, Unterstreichung in `--color-primary` (0,08 em).
  Hover: Schrift Petrol. Die Unterstreichung **bleibt**, weil sie für unsere Zielgruppe der Hinweis auf
  „anklickbar“ ist.
- Zeile „wann“: Figtree 700, 1,05 rem, `--color-primary-strong`, `tabular-nums`.
- Meta-Liste: Symbole in `--color-primary`, Text `--color-text-muted`, Abstand `0.5rem 1.5rem`.
- **„Sie sind dabei“:** statt dickem linkem Balken ein 2-px-Rahmen in `--color-primary` und die Marke
  „Sie sind dabei“ **gefüllt** (`--color-success`, weiße Schrift, 6,5:1). Abgesagt: Fläche `--color-surface-2`,
  Titel durchgestrichen und Marke „Abgesagt“ in `--color-error`, wie heute.
- *Kann:* ganze Karte anklickbar über `.walk-card__title a::after { content:''; position:absolute; inset:0 }`
  mit `position: relative` an der Karte. Die Karte enthält sonst keine Links. Der Fokusrahmen liegt dann um die
  ganze Karte (`.walk-card:has(a:focus-visible)` mit Fokus-Stil). **Nicht** bei der Gruppenkarte, denn sie hat
  einen zweiten Link.

### 4.6 Gruppenkarte (`GroupCard.tsx`, `.group-card*`)
- Aufbau wie die Terminkarte. Bild 7 × 7 rem, Radius `--radius`.
- **Ohne Foto:** statt Personen-Symbol ein kleines Landschaftsbild (Fläche `--color-primary-soft`, Sonne gelb,
  zwei Hügel in Petrol). Es ist rein dekorativ und bleibt `aria-hidden`. Als eigene Komponente
  `GroupPlaceholderArt` in `web/src/components/` (SVG aus der Musterseite). *Soll:* die Hügelform über die
  Gruppen-ID leicht verändern (zum Beispiel 3 Varianten), damit nicht alle gleich aussehen.
- „Nächster Termin“: Kalendersymbol in Petrol, der Link bleibt.

### 4.7 Seitenköpfe (`PageHeader.tsx`, `.page-header`)
- h1 in Figtree, `--font-size-xxl`, darunter die Einleitung in `--font-size-lg` und `--color-text-muted`, `max-width: var(--text-max)`.
- Abstand nach unten `--space-6`. Aktionen als `.btn-row` darunter.
- *Soll:* auf Detailseiten (Walk, Gruppe) den Zurück-Link als `.btn--ghost` mit Pfeil darstellen.

### 4.8 Startseite
**Abgemeldet (`HomeWelcome`):**
- Der Kopf (`.home-hero`) wird eine **volle Breite, dunkle Bühne**: Fläche `--color-hero` mit Höhenlinien
  (SVG, 1,5 px, `--color-hero-line`, rein dekorativ, `aria-hidden`), Polster `--space-8` oben und unten.
  Technik: `.home-hero` mit `margin-inline: calc(50% - 50vw)` aus der `.app-main` herausziehen, **mit
  `max-width: 100vw` und `overflow: hidden`**, damit bei 320 px nichts waagerecht scrollt. Sauberer ist
  eine eigene `.app-main--wide`-Variante. Jonas entscheidet, Hauptsache der Test bleibt grün.
- Links: h1 in `--font-size-display` (Figtree 780, weiß, `max-width: 14ch`), Einleitung `--color-on-hero-muted`.
  Darunter das Suchfeld als weiße Karte mit `--shadow-raised` und **gelbem Suchknopf** (`.btn--accent`).
  „Schon dabei oder neu hier?“ mit `.btn--on-dark`.
- Rechts (ab 40 em sichtbar): **Landschaft statt Strichmännchen**: Sonne, drei Hügelflächen, gelb gepunkteter
  Weg, weiße Ortsmarke. Das SVG steht in der Musterseite. Es ersetzt `HeroArt` in `Home.tsx` und bleibt `aria-hidden`.
- Fokus im dunklen Bereich: `.home-hero :focus-visible { outline-color: #fff }`, der gelbe Hof bleibt.
- „So einfach geht's“: **keine Kästen mehr**. Drei Spalten, jede mit 2 px Linie oben in `--color-border-soft`,
  Ziffer in einem gelben Kreis (`--color-accent`, Schrift `--color-on-accent`, Figtree 800). Bisher war es
  weiße Schrift auf Rostrot, das muss angepasst werden.
- „Darauf können Sie sich verlassen“: Symbole in einem Kreis aus `--color-primary-soft`, Text normal.

**Angemeldet (`HomeSignedIn`):**
- Begrüßung wie Seitenkopf, h1 in Figtree.
- Schnellkacheln: erste Kachel („Walk eintragen“) Fläche `--color-primary`, Symbol in einem **gelben** Kreis.
  Die anderen sind weiß mit 1 px Rahmen, Symbol in einem `--color-primary-soft`-Kreis. Titel unterstrichen (bleibt).
- „Ihre nächsten Walks“ **ohne** umgebende Karte (siehe 4.4), „Meine Gruppen“ als Karte rechts daneben ist in Ordnung.

### 4.9 Hinweisboxen und Bestätigungen (`.notice`, `.toast`, `.status-pill`)
- `.notice`: **kein Rundum-Rahmen** mehr, dafür links ein Balken von 0,375 rem in der Zustandsfarbe, die
  passende helle Fläche und das Symbol in der Zustandsfarbe. Bedeutung immer auch im Text („Gespeichert.“,
  „Bitte prüfen Sie …“).
  - success: `--color-success` / `--color-success-soft` · error: `--color-error` / `--color-error-soft`
  - warning: `--color-warning-border` / `--color-warning-soft` (ersetzt festes `#8a6400`) · info: `--color-primary` / `--color-primary-soft`
  - premium: `--color-premium` / `--color-premium-soft`
- `.toast` (role="status" bleibt): Fläche `--color-text` (fast schwarz-grün), Schrift weiß, Erfolgs-Haken in
  einem **gelben** Kreis, `--shadow-raised`, Radius `--radius-lg`. Fehler-Toast: `--color-error`.
  Position, Dauer und Schließen-Knopf bleiben.
- `.status-pill--success`: gefüllt (siehe 4.5). `.status-pill--error`: Fläche `--color-error-soft`, Rahmen und Schrift `--color-error`.
- Erfolgsseite nach dem Eintragen (`.success-e__head`): dunkle Bühne wie der Startseiten-Kopf (`--color-hero`,
  weiße h1, gelbes Symbol). Das ist feierlich, aber ruhig, ohne Konfetti und ohne Bewegung.

### 4.10 Abzeichen-Vitrine (`BadgesPage.tsx`, `BadgeEmblem.tsx`, `pages-e.css`)
- **Kennzahlen** (`.stat-tile`): weiß, 1 px Rahmen, Wert in Figtree 800 / `--font-size-xxl` / `tabular-nums`,
  Beschriftung `--weight-medium` muted. Punkte-Kachel: `--color-accent-soft` mit Rahmen `--color-warning-border`.
- **Abzeichen-Karte** (`.badge-card`): Wappen **oben auf einem „Sockel“**: eine Fläche `--color-bg` über die
  ganze Breite mit einem Kreis in der Stufen-Fläche (`--tier-n-soft`) hinter dem Wappen. Darunter Name (h3),
  Stufe mit kleinem Farbpunkt plus Text („Bronze · erreicht am …“), Beschreibung, Knöpfe.
  Raster `minmax(min(100%, 15rem), 1fr)`, damit mehr Abzeichen nebeneinander passen und die Sammlung wirkt.
- **Noch nicht erreicht:** Fläche `--color-surface-2`, **kein** gestrichelter Kartenrahmen und kein Schatten.
  Das Wappen selbst bleibt grau und gestrichelt (das ist die eigentliche Information). Der Fortschrittsbalken
  bleibt mit Text.
- `BadgeEmblem.tsx`: nur die Farbtabelle austauschen (Form, Sterne und Rahmenlinien bleiben):
  ```ts
  const TIER = {
    1: { stroke: '#8a552a', fill: '#f5e4d3', mid: '#d49a68' }, // Bronze
    2: { stroke: '#56636e', fill: '#ebeff2', mid: '#b7c1ca' }, // Silber
    3: { stroke: '#7d6100', fill: '#fbf0c4', mid: '#e6b93a' }, // Gold
  } as const;
  const GREY = { stroke: '#6e7b77', fill: '#f1f3ef', mid: '#d3dad4' };
  ```
  (SVG-Attribute können keine CSS-Variablen in jedem Browser sicher nutzen. Die Werte entsprechen den Tokens
  `--tier-*` und sind dort dokumentiert.)
- Fortschrittsbalken (`.progress__bar`): Höhe 0,75 rem, Pille, Bahn weiß mit 1 px `--color-border`, Füllung
  `--color-primary`, erledigt `--color-success`. Text darunter bleibt die Hauptinformation.

### 4.11 Tabellen (`table.data`, Rangliste, Mitgliederliste)
- Kopfzeile `--color-surface-2`, Schrift 700 `--color-text`, keine senkrechten Linien.
- Zeilen: 1 px `--color-border-soft` unten, Polster `0.75rem 1rem`, Mindesthöhe der Zeile 3 rem.
- Zahlen rechtsbündig mit `tabular-nums`.
- Eigene Zeile in der Rangliste: Fläche `--color-accent-soft` plus links 0,375 rem Balken `--color-accent-text`
  plus Text „(Sie)“, wie heute.
- `.table-wrap` mit `overflow-x: auto` bleibt.

### 4.12 Fußzeile (`.app-footer`)
- Volle Breite, Fläche `--color-surface-2`, Abstand nach oben `--space-8`, Polster `--space-6`.
- Erste Zeile: Wort aus `t('app.name')` in Figtree 800 (*Soll*, optional mit kleinem Logo). Darunter dieselben
  5 Links (Text, Reihenfolge und Ziele unverändert), Farbe `--color-primary-strong` (10:1 auf surface-2), Mindesthöhe 44 px.

### 4.13 Leere Zustände (`.empty-state`)
- **Linksbündig**, kein gestrichelter Rahmen. Fläche `--color-surface-2`, Radius `--radius-lg`.
- Links ein Symbol in einem 4-rem-Kreis `--color-primary-soft` (Symbol `--color-primary`), rechts Text und
  ein Knopf. Unter 30 em untereinander.

### 4.14 Reiter, Kacheln, Kleinteile
- `.tabs`: statt „Karteikarten“-Reitern eine Leiste mit 2 px Linie unten. Aktiver Reiter: Schrift
  `--color-primary-strong` 700 plus 0,2 rem Balken in `--color-primary` (wie in der Navigation). Rollen
  `tab`/`tabpanel` und `aria-selected` bleiben.
- `.badge-pill` und Tempo-Marken: Höhe 1,9 rem, Pille, 1 px Rahmen in der Tempo-Farbe, helle Tempo-Fläche,
  **Pfeil-Symbol in Tempo-Farbe**, Text `--color-text`. `.badge-pill--count`: Fläche `--color-accent`, Schrift
  `--color-on-accent` (bisher weiß, das ginge auf Gelb nicht).
- Avatare: Fläche `--color-primary-soft`, Initiale Figtree 700 `--color-primary-strong`.
- `.explain__text`: links Balken `--color-primary`, Fläche `--color-primary-soft` (wie bisher, nur neue Werte).
- Karten-Pins (`.map-pin`), `RouteDrawMap.tsx`: Farben auf `#0e5149` / `#093b35` umstellen.

### 4.15 Bilder und Illustrationen
- **Keine Fotos aus Bilddatenbanken** und keine fremden Dienste. Lizenzfreie Fotos, die sicher lokal eingebunden
  werden dürfen und zur Zielgruppe passen, haben wir nicht. Stockfotos von „fröhlichen Senioren“ würden
  außerdem genau das Klischee erzeugen, das wir vermeiden wollen.
- Stattdessen ein **einheitlicher Satz flächiger Landschaftsbilder** als Inline-SVG (Hügel, Weg, Sonne,
  Höhenlinien) in nur 5 Farben: `#0e5149`, `#175a52`, `#2f7a6f`, `#dcede7`, `#f5b82e`. Immer `aria-hidden`.
  Einsatz: Startseiten-Kopf, Gruppenbild-Ersatz, leere Zustände (klein), Erfolgsseite.
  Neue Komponente `web/src/components/Landscape.tsx` mit `variant`-Prop (hero, thumb, empty).
- Echte Gruppenfotos (von den Gruppen hochgeladen) bleiben wie sie sind: Radius `--radius`, `object-fit: cover`.
- Symbole (`Icon.tsx`) bleiben: Linien-Symbole mit 2 px Strich passen zum neuen Stil.

### 4.16 Druck (`print.css`)
- Bleibt hell. Nur `color: var(--color-accent)` beim Aushang-Untertitel (`.poster__kicker`) auf
  `var(--color-accent-text)` umstellen, denn Gelb auf Weiß ist nicht lesbar. Überschriften dürfen Figtree nutzen.

---

## 5. Dateien für Jonas

### Muss
| Datei | Änderung |
|---|---|
| `web/package.json` (+ `package-lock.json`) | Zwei Schriftpakete installieren (Befehl in Abschnitt 3) |
| `web/src/main.tsx` | Schrift-Importe austauschen |
| `web/src/styles/tokens.css` | Kompletter Token-Block aus Abschnitt 3 |
| `web/src/styles/base.css` | Überschriften mit `--font-display`, Gewichte, `p { max-width: var(--text-max) }`, Link-Unterstreichung 0,07 em / Abstand 0,2 em |
| `web/src/styles/components.css` | Kopf, Navigation (aktiver Balken), Knöpfe (Pille, `--accent`, `--on-dark`, disabled), Felder, `.choice`-Rahmen, Karten (1 px), Notice (Balken), Toast, Tabs, Tabelle, Fußzeile, leere Zustände; feste Farben `#7d1013`, `#8a6400`, `#e6f2ea`, `#fff1d6`, `#fbe2d6` durch Tokens ersetzen |
| `web/src/styles/features.css` | Termin- und Gruppenkarte, Startseite (Kopf, Schritte, Schnellkacheln, `.step__num` → Gelb mit dunkler Schrift), `.card--warm` (`#e7c3ae` → Token), Tempo-Marken |
| `web/src/styles/pages-e.css` | Kennzahlen, Vitrine (Sockel, gesperrte Karten ohne gestrichelten Rahmen), Erfolgsseite, Fortschrittsbalken, `.badge-pill--count` (Schrift `--color-on-accent`) |
| `web/src/components/BadgeEmblem.tsx` | Nur die Farbtabelle `TIER`/`GREY` (Abschnitt 4.10) |
| `web/src/components/Layout.tsx` | Nur das `Logo`-SVG austauschen (neues Zeichen). Struktur, Rollen, Links, `aria-label` bleiben |
| `web/src/pages/Home.tsx` | `HeroArt` durch das Landschaftsbild ersetzen. „Ihre nächsten Walks“: `className="card"` → Abschnitt ohne Karte. Sonst nichts |
| `web/src/styles/print.css` | `.poster__kicker` auf `--color-accent-text` |

### Soll
| Datei | Änderung |
|---|---|
| `web/src/components/Landscape.tsx` *(neu)* | Wiederverwendbare Landschafts-SVGs (hero, thumb, empty), `aria-hidden` |
| `web/src/components/GroupCard.tsx` | Ersatzbild ohne Foto: `<Landscape variant="thumb" />` statt Personen-Symbol |
| `web/src/pages/groups/GroupDetail.tsx` | „Nächste Termine“ ohne umgebende Karte (wie Startseite) |
| `web/public/favicon.svg`, `web/index.html` | Neues Zeichen; `theme-color` → `#0e5149` |
| `web/src/components/RouteDrawMap.tsx` | Linien- und Punktfarben auf neue Petrol-Werte |
| `web/src/pages/info/info.css` | Prüfen, ob nur Tokens verwendet werden (`--color-warning-soft` bleibt gültig) |

### Kann
- Ganze Terminkarte anklickbar (4.5).
- Varianten des Gruppen-Ersatzbilds über die Gruppen-ID.
- Altes Paket `@fontsource/atkinson-hyperlegible` entfernen.

### Darf NICHT geändert werden
- **Funktion und Abläufe:** keine Änderungen an Logik, API-Aufrufen, Routen, Hooks, Formular-Validierung.
- **Alle Texte und i18n-Schlüssel** (`web/src/i18n/**`). Keine neuen sichtbaren Texte ohne Absprache. Der App-Name
  kommt immer aus `APP_NAME` / `t('app.name')` / `{{appName}}`, **nie fest im Code**.
- **Semantik, auf die Screenreader und die Playwright-Tests in `e2e/` zugreifen:**
  - Landmarken und Namen: `navigation` „Hauptnavigation“ mit **genau 5 Links** (Start, Walks, Gruppen,
    Abzeichen, Profil), je **ein** `svg` plus Text, `aria-current="page"`; `main#inhalt` mit `tabIndex=-1`;
    Sprunglink „Zum Inhalt springen“.
  - **Eine** h1 je Seite; Überschriften-Ebenen und Texte (Tests suchen z. B. „Hallo Erika“, „Meine Vitrine“,
    „Walks in Ihrer Nähe“, „Geschafft – 3,1 km!“).
  - Rollen und Namen von Knöpfen, Links, Feldern, Reitern und Formularen (z. B. Formular „Angaben zu Ihrem
    Walk“, Felder „Minuten“, „Strecke in Kilometern“, Knopf „Walk speichern“, Reiter „Karte“, „Anmelde-Link senden“).
  - Alle `aria-*`-Attribute, `role="status"` der Mitteilungen, `aria-describedby`/`aria-invalid` der Felder,
    `aria-hidden` an dekorativen Bildern, `id`s, auf die `aria-labelledby` zeigt.
  - Lade-Text „Wird geladen …“.
  - Klassen, auf die Tests direkt zugreifen: `.leaflet-container`, `.map`; außerdem die Prüfung der
    Klickflächen über `main .btn, main button, nav a, [role=tab], input[type=checkbox|radio]` (≥ 44 × 44 px).
- Fokusrahmen: Breite ≥ 2 px oder Schatten (Test `tastatur.spec.ts`). Der doppelte Fokus bleibt.
- Die drei Schriftgrößen-Stufen auf `html` (`data-font`) und die Werte 112,5 / 125 / 143,75 %.
- Farbunabhängige Kennzeichen: Tempo-Pfeile (1 bis 3), Sterne und Rahmenlinien der Abzeichen, Text bei jedem Zustand.

**Abnahme durch Jonas vor der Übergabe:** `npm run typecheck`, `npm test`, `npm run test:e2e` (insbesondere
`barrierefreiheit`, `ansichten`, `tastatur`, `einstellungen`) komplett grün. Dazu Bildschirmfotos der Seiten aus
Abschnitt 1 bei 1280 px, 768 px und 320 px sowie in den Stufen „Sehr groß“ und bei 200 % Zoom.

---

## 6. Prüfkriterien für Thomas (Usability-Test danach)

**Teilnehmende:** 5 bis 6 Personen zwischen 58 und 75 Jahren, mindestens 3 Frauen, gemischt Laptop und Tablet,
mindestens eine Person mit Lesebrille oder Sehschwäche, eine Person, die die Schriftstufe „Sehr groß“ nutzt.

**Erster Eindruck (5-Sekunden-Test auf der Startseite, abgemeldet), danach fragen:**
1. „Was kann man hier machen?“ Ziel: mindestens 5 von 6 nennen „gemeinsam spazieren gehen / Gruppen in der Nähe finden“.
2. „Mit drei Worten: Wie wirkt die Seite auf Sie?“ Ziel: keine Nennung von „Krankenkasse“, „Amt“, „altmodisch“
   oder „für alte Leute“. Gewünscht sind Worte wie „frisch“, „draußen“, „ordentlich“, „einladend“.
3. „Würden Sie dieser Seite Ihre E-Mail-Adresse geben?“ (Vertrauen) Ziel: mindestens 5 von 6 sagen Ja oder Eher ja.

**Aufgaben (Erfolg, Zeit, Zögern und Fehlklicks messen):**
| Aufgabe | Ziel |
|---|---|
| A. Einen Walk in Ihrer Nähe finden (PLZ 34117) und öffnen | ohne Hilfe, unter 60 s, gelber Suchknopf wird sofort gefunden |
| B. Bei einem Walk zusagen und die Bestätigung benennen | Bestätigung wird bemerkt und vorgelesen bzw. benannt |
| C. Einen eigenen Walk eintragen (5,2 km, 1 Std.) – mit absichtlichem Tippfehler „5.2.1“ | Fehlermeldung am Feld wird verstanden und selbst korrigiert |
| D. In der Vitrine zeigen: „Welches Abzeichen haben Sie schon, welches als Nächstes?“ | Erreichte und offene Abzeichen werden ohne Nachfragen unterschieden, Stufe wird genannt |
| E. Schriftgröße auf „Sehr groß“ stellen und Aufgabe A wiederholen | Nichts wird abgeschnitten oder überdeckt, die Navigation bleibt vollständig |
| F. (Tablet) die Gruppe „Morgenrunde Karlsaue“ finden und nächsten Termin nennen | ohne waagerechtes Wischen |

**Beobachten und notieren:**
- Erkennen alle, **welcher Navigationspunkt aktiv** ist (Balken plus Fettung statt dunklem Block)? Ziel 6 von 6.
- Werden die **Pillen-Knöpfe** als Knöpfe erkannt? Wird der **Textknopf** („absagen“, „Alle ansehen“) als anklickbar erkannt?
- Werden **Kartentitel** als Link erkannt (Unterstreichung)? Klickt jemand ins Leere neben den Titel? (Dann die Kann-Vorgabe „ganze Karte anklickbar“ umsetzen.)
- Wird **Gelb** als „das ist die wichtigste Handlung“ verstanden oder als Warnung missverstanden?
- Ist die **dunkle Bühne** gut lesbar (Blendung, Spiegelung am Tablet)?
- Stolz-Moment: Spontane positive Äußerung in der Vitrine oder auf der Erfolgsseite? Würde die Person ein Abzeichen teilen?

**Technische Gegenprüfung (Thomas oder Miriam):**
- axe ohne Befund auf allen Seiten der Testliste (`e2e/barrierefreiheit.spec.ts`).
- Nur Tastatur: alle Aufgaben A bis D lösbar, Fokus immer sichtbar, auch im dunklen Startseiten-Kopf.
- Screenreader (NVDA + Firefox, VoiceOver + Safari am iPad): Überschriften-Liste und Landmarken unverändert gegenüber vorher.
- 200 % Zoom bei 1280 px und 320 px Breite: kein waagerechtes Scrollen.
- `prefers-reduced-motion` aktiv: keinerlei Übergänge.
- Windows-Kontrastmodus: Knöpfe, Felder, aktiver Navigationspunkt und Fokus bleiben erkennbar.

**Erfolg gilt als erreicht, wenn:** alle Aufgaben von mindestens 5 von 6 Personen ohne Hilfe gelöst werden,
keine Person das Design als „Krankenkasse/Amt/altmodisch“ beschreibt und keine neue Barriere gegenüber dem
bisherigen Stand auftaucht.
