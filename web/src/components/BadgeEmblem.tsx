import '../styles/pages-e.css';
import type { BadgeKind } from '@happywalkers/shared';

/**
 * Wappen für ein Abzeichen (Paket E).
 * - Die Form zeigt die Art (kind): Strecke = Schild, Anzahl = Medaille, Gruppe = breites Schild,
 *   Gemeinschaft = Sechseck, Region = Burgwappen, Mitmach-Aktion = Wimpel, Serie = Achteck.
 * - Die Stufe (tier) ist ohne Farbe erkennbar: 1, 2 oder 3 Sterne im Band und 1, 2 oder 3 Rahmenlinien.
 * - Nicht erreichte Abzeichen sind grau mit gestricheltem Rahmen.
 * Standard: dekorativ (aria-hidden), weil der Name daneben steht. Mit `label` wird es ein Bild mit Text.
 */
const TIER = {
  1: { stroke: '#7a4420', fill: '#f6e2cf', mid: '#d79a66' }, // Bronze
  2: { stroke: '#4a5560', fill: '#eef1f4', mid: '#b4bec8' }, // Silber
  3: { stroke: '#6e5000', fill: '#fdf0bf', mid: '#e3b93c' }, // Gold
} as const;
const GREY = { stroke: '#77706a', fill: '#f1eee8', mid: '#cfc8bd' };

const SHAPES: Record<BadgeKind, string> = {
  distance: 'M60 6 108 22v42c0 30-20 52-48 68C32 116 12 94 12 64V22Z',
  count: 'M60 8a56 56 0 1 1 0 112A56 56 0 0 1 60 8Z',
  group: 'M8 14h104v46c0 34-24 56-52 68C32 116 8 94 8 60Z',
  social: 'M60 6 110 34v64L60 126 10 98V34Z',
  region: 'M14 10h22v12h16V10h16v12h16V10h22v54c0 32-24 54-46 66C38 118 14 96 14 64Z',
  challenge: 'M14 8h92v96L60 132 14 104Z',
  streak: 'M40 8h40l28 28v40l-28 28H40L12 76V36Z',
};

/** Innenrahmen: gleiche Form, etwas kleiner (für doppelte/dreifache Linien) */
function scaled(kind: BadgeKind, s: number) {
  const c = 60;
  const cy = kind === 'count' ? 64 : 66;
  return `translate(${c * (1 - s)} ${cy * (1 - s)}) scale(${s})`;
}

const SYMBOLS: Record<BadgeKind, string> = {
  // Weg mit Ziel-Fähnchen
  distance: 'M38 80c8-4 10-12 18-14s14 4 22-4M78 62V40l12 5-12 5',
  // Schuh
  count: 'M36 56h14l6 8 20 4c6 1 8 5 8 9H36ZM36 77h48',
  // drei Personen
  group: 'M44 52a6 6 0 1 0 0-.1M76 52a6 6 0 1 0 0-.1M60 46a7 7 0 1 0 0-.1M32 80c1-8 6-12 12-12s9 3 10 6M66 74c1-3 4-6 10-6s11 4 12 12M46 82c1-10 7-16 14-16s13 6 14 16',
  // Herz
  social: 'M60 84S40 72 40 58a10 10 0 0 1 20-3 10 10 0 0 1 20 3c0 14-20 26-20 26Z',
  // Turm
  region: 'M46 86V54h28v32M46 54v-8h6v6h5v-6h6v6h5v-6h6v8M56 86V74a4 4 0 0 1 8 0v12',
  // Pokal
  challenge: 'M48 40h24v14a12 12 0 0 1-24 0ZM48 44h-8c0 8 4 12 9 13M72 44h8c0 8-4 12-9 13M60 66v8M50 82h20M54 74h12v8H54Z',
  // Kalender mit Haken
  streak: 'M40 44h40v38H40ZM40 54h40M48 38v10M72 38v10M50 68l6 6 14-12',
};

export function BadgeEmblem({
  kind,
  tier,
  earned = true,
  size = 96,
  label,
  className,
}: {
  kind: BadgeKind;
  tier: 1 | 2 | 3;
  earned?: boolean;
  size?: number | string;
  label?: string;
  className?: string;
}) {
  const c = earned ? TIER[tier] : GREY;
  const shape = SHAPES[kind] ?? SHAPES.distance;
  const dash = earned ? undefined : '6 5';
  return (
    <svg
      viewBox="0 0 120 140"
      width={size}
      height={typeof size === 'number' ? (size * 140) / 120 : undefined}
      className={`badge-emblem ${earned ? '' : 'badge-emblem--locked'} ${className ?? ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={shape} fill={c.fill} stroke={c.stroke} strokeWidth={5} strokeLinejoin="round" strokeDasharray={dash} />
      {tier >= 2 ? (
        <path d={shape} transform={scaled(kind, 0.86)} fill="none" stroke={c.stroke} strokeWidth={3} strokeLinejoin="round" strokeDasharray={dash} />
      ) : null}
      {tier >= 3 ? (
        <path d={shape} transform={scaled(kind, 0.74)} fill="none" stroke={c.stroke} strokeWidth={2.5} strokeLinejoin="round" strokeDasharray={dash} />
      ) : null}
      <path d={SYMBOLS[kind] ?? SYMBOLS.distance} fill="none" stroke={c.stroke} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Band mit Sternen = Stufe */}
      <rect x={24} y={96} width={72} height={20} rx={6} fill={c.mid} stroke={c.stroke} strokeWidth={3} />
      {Array.from({ length: tier }, (_, i) => {
        const x = 60 + (i - (tier - 1) / 2) * 20;
        return <path key={i} d={star(x, 106, 7)} fill={earned ? c.stroke : '#ffffff'} stroke={c.stroke} strokeWidth={1.5} strokeLinejoin="round" />;
      })}
    </svg>
  );
}

function star(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
