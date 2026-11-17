/**
 * Flächige Landschaftsbilder „Draußen unterwegs“ (Hügel, Weg, Sonne, Höhenlinien).
 * Nur 5 Farben (#0e5149, #175a52, #2f7a6f, #dcede7, #f5b82e), immer rein dekorativ (aria-hidden).
 * - hero:     Startseiten-Kopf (Sonne, drei Hügel, gepunkteter Weg, Ortsmarke)
 * - thumb:    Ersatzbild für Gruppen ohne Foto; `seed` (z. B. Gruppen-ID) wählt eine von 3 Hügelformen
 * - empty:    kleines Bild für leere Zustände
 * - contours: Höhenlinien als Hintergrund dunkler Bühnen
 */
type Variant = 'hero' | 'thumb' | 'empty' | 'contours';

const THUMB_HILLS: [string, string, number, number][] = [
  // [hinterer Hügel, vorderer Hügel, Sonne x, Sonne y]
  ['M0 78c26-16 52-18 78-8s32 6 42-2v52H0Z', 'M0 96c30-10 64-10 90-2s22 2 30 0v28H0Z', 86, 34],
  ['M0 70c20-4 40-20 64-18s40 18 56 10v58H0Z', 'M0 100c24-14 50-14 76-6s32 0 44-6v32H0Z', 34, 32],
  ['M0 84c30-24 62-30 92-16s20 8 28 4v48H0Z', 'M0 92c18 6 46 8 70 0s38-6 50 0v28H0Z', 62, 30],
];

/** Kleine, stabile Zahl aus einer Zeichenkette (für die Wahl der Bildvariante). */
function pick(seed: string | number | undefined, n: number) {
  const s = String(seed ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % n;
}

export function Landscape({ variant, seed, className }: { variant: Variant; seed?: string | number; className?: string }) {
  const cls = `landscape landscape--${variant} ${className ?? ''}`.trim();

  if (variant === 'contours') {
    return (
      <svg className={cls} viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <g fill="none" stroke="#175a52" strokeWidth="1.5">
          <path d="M-50 420c180-60 320-20 460-70s240-150 420-130 300 90 420 60" />
          <path d="M-50 460c200-60 340-10 500-60s250-140 420-110 280 90 380 70" />
          <path d="M-50 380c170-60 300-40 430-90s230-160 410-150 320 80 460 50" />
          <path d="M-50 340c160-60 280-60 400-110s220-170 400-170 340 70 500 40" />
          <path d="M-50 300c150-60 260-80 370-130s210-180 390-190 360 60 540 30" />
          <path d="M-50 500c220-50 360 0 540-40s260-120 420-90 260 80 340 70" />
          <path d="M600 120c40-30 110-30 140 0s-10 70-70 70-110-40-70-70Z" />
          <path d="M570 110c60-60 170-55 210-5s-20 115-110 115-160-50-100-110Z" />
        </g>
      </svg>
    );
  }

  if (variant === 'hero') {
    return (
      <svg className={cls} viewBox="0 0 400 360" aria-hidden="true" focusable="false">
        <circle cx="292" cy="96" r="44" fill="#f5b82e" />
        <path d="M0 220c70-40 140-50 210-26s130 20 190-14v180H0Z" fill="#175a52" />
        <path d="M0 262c90-30 170-28 250-8s110 12 150-4v110H0Z" fill="#2f7a6f" />
        <path d="M0 300c80-18 170-16 260-2s110 6 140 0v64H0Z" fill="#dcede7" />
        <path d="M120 360c10-30 60-40 90-56s50-30 80-58" fill="none" stroke="#f5b82e" strokeWidth="7" strokeLinecap="round" strokeDasharray="2 16" />
        <g transform="translate(276 214)">
          <path d="M14 40S0 26 0 14a14 14 0 0 1 28 0c0 12-14 26-14 26Z" fill="#fff" />
          <circle cx="14" cy="14" r="5" fill="#0e5149" />
        </g>
      </svg>
    );
  }

  if (variant === 'empty') {
    return (
      <svg className={cls} viewBox="0 0 120 80" aria-hidden="true" focusable="false">
        <rect width="120" height="80" rx="12" fill="#dcede7" />
        <circle cx="88" cy="26" r="10" fill="#f5b82e" />
        <path d="M0 52c22-12 44-14 66-6s38 6 54-2v24c0 6-6 12-12 12H12C6 80 0 74 0 68Z" fill="#2f7a6f" />
        <path d="M36 80c4-10 18-14 28-20s16-10 22-18" fill="none" stroke="#f5b82e" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="1 7" />
      </svg>
    );
  }

  const [back, front, sx, sy] = THUMB_HILLS[pick(seed, THUMB_HILLS.length)];
  return (
    <svg className={cls} viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="120" height="120" fill="#dcede7" />
      <circle cx={sx} cy={sy} r="14" fill="#f5b82e" />
      <path d={back} fill="#2f7a6f" />
      <path d={front} fill="#0e5149" />
    </svg>
  );
}
