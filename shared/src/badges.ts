/**
 * Abzeichen („Wappen“). Die Texte stehen in den i18n-Dateien unter `badges.<key>`.
 * `kind`: Gestalt des Wappens in der Vitrine.
 */
export type BadgeKind = 'distance' | 'count' | 'group' | 'social' | 'region' | 'challenge' | 'streak';

export interface BadgeDefinition {
  key: string;
  kind: BadgeKind;
  /** Stufe für die Farbe: 1 Bronze, 2 Silber, 3 Gold */
  tier: 1 | 2 | 3;
}

export const BADGES: BadgeDefinition[] = [
  { key: 'first_walk', kind: 'count', tier: 1 },
  { key: 'first_5k', kind: 'distance', tier: 1 },
  { key: 'first_10k', kind: 'distance', tier: 2 },
  { key: 'total_50k', kind: 'distance', tier: 1 },
  { key: 'total_100k', kind: 'distance', tier: 2 },
  { key: 'total_500k', kind: 'distance', tier: 3 },
  { key: 'walks_10', kind: 'count', tier: 1 },
  { key: 'walks_50', kind: 'count', tier: 2 },
  { key: 'walks_100', kind: 'count', tier: 3 },
  { key: 'first_group_walk', kind: 'group', tier: 1 },
  { key: 'group_walks_10', kind: 'group', tier: 2 },
  { key: 'group_walks_50', kind: 'group', tier: 3 },
  { key: 'group_founder', kind: 'social', tier: 2 },
  { key: 'inviter', kind: 'social', tier: 1 },
  { key: 'week_streak_4', kind: 'streak', tier: 2 },
  { key: 'challenge_done', kind: 'challenge', tier: 1 },
  { key: 'places_3', kind: 'region', tier: 1 },
  { key: 'places_10', kind: 'region', tier: 2 },
];

/** Regionale Wappen werden dynamisch vergeben: Schlüssel `region:<Landkreis>`. */
export const REGION_BADGE_PREFIX = 'region:';

export function badgeDefinition(key: string): BadgeDefinition | undefined {
  if (key.startsWith(REGION_BADGE_PREFIX)) return { key, kind: 'region', tier: 1 };
  return BADGES.find((b) => b.key === key);
}
