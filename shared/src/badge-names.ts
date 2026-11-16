import { REGION_BADGE_PREFIX } from './badges.js';

/**
 * Namen der Abzeichen – EINE Quelle für Oberfläche (i18n `badges:names`, siehe web/src/i18n/index.ts),
 * Urkunde (PDF) und Teil-Bild (server/src/modules/badges.ts).
 * Kurz und stolz. `region` ist die Vorlage für regionale Wappen („Wappen {{label}}“, label = Landkreis).
 * Weitere Sprachen: neuen Schlüssel (z. B. `tr`) mit denselben Einträgen anlegen.
 */
export const BADGE_NAMES = {
  de: {
    first_walk: 'Erster Walk',
    first_5k: 'Erster 5-km-Walk',
    first_10k: 'Erster 10-km-Walk',
    total_50k: '50 Kilometer gesamt',
    total_100k: '100 Kilometer gesamt',
    total_500k: '500 Kilometer gesamt',
    walks_10: '10 Walks',
    walks_50: '50 Walks',
    walks_100: '100 Walks',
    first_group_walk: 'Erster Gruppen-Walk',
    group_walks_10: '10 Gruppen-Walks',
    group_walks_50: '50 Gruppen-Walks',
    group_founder: 'Gruppe gegründet',
    inviter: 'Erste Einladung',
    week_streak_4: '4 Wochen in Folge',
    challenge_done: 'Mitmach-Aktion geschafft',
    places_3: '3 verschiedene Orte',
    places_10: '10 verschiedene Orte',
    region: 'Wappen {{label}}',
  },
} as const satisfies Record<string, Record<string, string>>;

export type BadgeNameLocale = keyof typeof BADGE_NAMES;

/** Name eines Abzeichens (auch regionale Wappen „region:<Landkreis>“) – für Server-Ausgaben ohne i18next. */
export function badgeNameFor(key: string, label: string | null | undefined, locale: BadgeNameLocale = 'de'): string {
  const names: Record<string, string> = BADGE_NAMES[locale] ?? BADGE_NAMES.de;
  if (key.startsWith(REGION_BADGE_PREFIX)) {
    return names.region.replace('{{label}}', label ?? key.slice(REGION_BADGE_PREFIX.length));
  }
  return names[key] ?? key;
}
