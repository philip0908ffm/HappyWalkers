/** Gemeinsame Konstanten für Server, Weboberfläche und spätere Mobil-App. */

export const API_PREFIX = '/api/v1';

/** Tempo in Alltagssprache. Richtwerte in km/h dienen nur der Einordnung. */
export const TEMPOS = ['gemuetlich', 'zuegig', 'flott'] as const;
export type Tempo = (typeof TEMPOS)[number];
export const TEMPO_KMH: Record<Tempo, [number, number]> = {
  gemuetlich: [3.5, 4.5],
  zuegig: [4.5, 5.5],
  flott: [5.5, 7],
};

/** Beitrittsregel einer Gruppe. */
export const JOIN_POLICIES = ['open', 'request', 'invite'] as const;
export type JoinPolicy = (typeof JOIN_POLICIES)[number];

export const GROUP_ROLES = ['founder', 'moderator', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const MEMBER_STATUSES = ['active', 'pending', 'banned'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Sichtbarkeit von Beiträgen und Fotos. Standard: nur die eigene Gruppe. */
export const VISIBILITIES = ['private', 'group', 'followers', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const DEFAULT_PHOTO_VISIBILITY: Visibility = 'group';

/** Profil-Sichtbarkeit. Standard: privat. */
export const PROFILE_VISIBILITIES = ['private', 'followers', 'public'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

/** Art eines verabredeten Walks. */
export const WALK_KINDS = ['group', 'partner', 'distance'] as const;
export type WalkKind = (typeof WALK_KINDS)[number];

export const ACTIVITY_SOURCES = ['manual', 'gpx', 'group'] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export const SEARCH_RADII_KM = [5, 15, 30, 50] as const;

export const ANREDEN = ['sie', 'du'] as const;
export type Anrede = (typeof ANREDEN)[number];

export const FONT_SCALES = ['normal', 'gross', 'sehr-gross'] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export const LOCALES = ['de'] as const; // vorbereitet: 'tr', 'ru'
export type Locale = (typeof LOCALES)[number];

export const CHALLENGE_TYPES = ['single_distance', 'walk_count', 'total_distance'] as const;
export type ChallengeType = (typeof CHALLENGE_TYPES)[number];

export const CHALLENGE_SCOPES = ['everyone', 'city', 'group'] as const;
export type ChallengeScope = (typeof CHALLENGE_SCOPES)[number];

export const REPORT_TARGETS = ['user', 'post', 'comment', 'group', 'photo', 'walk'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

/** Premium: klar angezeigter Preis, monatlich kündbar, kein Probeabo. */
export const PREMIUM = {
  priceCents: 399,
  currency: 'EUR',
  interval: 'month',
} as const;

/** Grenzwerte für Eingaben (Plausibilität). */
export const LIMITS = {
  maxActivityKm: 100,
  maxActivityMinutes: 24 * 60,
  maxUploadBytes: 10 * 1024 * 1024,
  maxGpxBytes: 5 * 1024 * 1024,
  maxTextLength: 2000,
  maxCommentLength: 1000,
} as const;
