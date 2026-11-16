import { BADGE_NAMES } from '@gehmeinsam/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * Mehrsprachigkeit (i18next).
 * - Jede Funktion hat eine eigene Datei („Namespace“): locales/<sprache>/<bereich>.json
 * - „Sie“ ist Standard (Sprache „de“). „Du“ ist die Pseudo-Sprache „du“ und enthält NUR Texte,
 *   die sich unterscheiden (locales/du/<bereich>.json); alles andere fällt auf „de“ zurück.
 * - Neue Sprachen (z. B. tr, ru): Ordner anlegen, in SUPPORTED eintragen.
 */
const files = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<string, { default: Record<string, unknown> }>;

const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, mod] of Object.entries(files)) {
  const m = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!m) continue;
  const [, lng, ns] = m;
  (resources[lng] ??= {})[ns] = mod.default;
}

// Abzeichen-Namen kommen aus EINER Quelle (shared/src/badge-names.ts) – dieselben wie auf Urkunde und Teil-Bild.
for (const [lng, names] of Object.entries(BADGE_NAMES)) {
  const badges = ((resources[lng] ??= {}).badges ??= {});
  badges.names = names;
}

export const SUPPORTED_LOCALES = ['de'] as const;
export const namespaces = Object.keys(resources.de ?? {});

export function languageFor(locale: string, anrede: string): string {
  if (locale === 'de' && anrede === 'du') return 'du';
  return locale;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: 'de',
  fallbackLng: { du: ['de'], default: ['de'] },
  ns: namespaces,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
