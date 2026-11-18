/**
 * Datenbankschema der Plattform (PostgreSQL / Neon) mit Drizzle ORM.
 *
 * Teil 1: Tabellen von Better Auth (user, session, account, verification).
 * Teil 2: Fachliche Tabellen. IDs sind Text-UUIDs, Zeitstempel mit Zeitzone.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ */
/* Better Auth                                                         */
/* ------------------------------------------------------------------ */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  phoneNumber: text('phone_number').unique(),
  phoneNumberVerified: boolean('phone_number_verified'),
  /** Admin-Plugin von Better Auth: 'user' | 'admin' */
  role: text('role').notNull().default('user'),
  banned: boolean('banned').notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  /** vom Admin-Plugin verlangt; Anmelden als andere Person ist abgeschaltet (bleibt immer leer) */
  impersonatedBy: text('impersonated_by'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Profil und Einstellungen                                            */
/* ------------------------------------------------------------------ */

/**
 * Profil. Öffentlich sichtbar ist höchstens: displayName, Ort (Stadt), Avatar, Abzeichen.
 * birthYear wird NIE an andere Personen ausgeliefert.
 */
export const profile = pgTable('profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** Vorname oder Spitzname – wird in Ranglisten gezeigt. */
  displayName: text('display_name').notNull().default(''),
  bio: text('bio'),
  postalCode: text('postal_code'),
  city: text('city'),
  district: text('district'),
  /** ungefähre Koordinaten (PLZ-Mittelpunkt), nie exakter Wohnort */
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),
  birthYear: integer('birth_year'),
  /** freiwillige Angabe, nur für „nur Frauen“-Gruppen genutzt: 'woman' | 'man' | 'diverse' | null */
  gender: text('gender'),
  avatarPath: text('avatar_path'),
  profileVisibility: text('profile_visibility').notNull().default('private'),
  /** in Ranglisten: 'display' (Vor-/Spitzname) oder 'hidden' (anonym) */
  leaderboardMode: text('leaderboard_mode').notNull().default('display'),
  anrede: text('anrede').notNull().default('sie'),
  locale: text('locale').notNull().default('de'),
  fontScale: text('font_scale').notNull().default('normal'),
  emailNotifications: boolean('email_notifications').notNull().default(true),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* Gruppen                                                             */
/* ------------------------------------------------------------------ */

export const groups = pgTable(
  'groups',
  {
    id: id(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    /** angeheftete Gruppenregeln */
    rules: text('rules').notNull().default(''),
    joinPolicy: text('join_policy').notNull().default('open'),
    womenOnly: boolean('women_only').notNull().default(false),
    postalCode: text('postal_code').notNull(),
    city: text('city').notNull(),
    district: text('district'),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    photoPath: text('photo_path'),
    /** Einladungscode, z. B. „WALK-4K7P“ */
    inviteCode: text('invite_code').notNull().unique(),
    defaultTempo: text('default_tempo').notNull().default('zuegig'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('groups_geo_idx').on(t.lat, t.lon)],
);

export const groupMembers = pgTable(
  'group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    status: text('status').notNull().default('active'),
    /** optionale Nachricht bei Beitrittsanfrage */
    requestMessage: text('request_message'),
    invitedBy: text('invited_by'),
    joinedAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index('group_members_user_idx').on(t.userId)],
);

/** Einladungen per E-Mail-Link (Token) – führen nach Registrierung direkt in die Gruppe. */
export const groupInvites = pgTable('group_invites', {
  id: id(),
  groupId: text('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  email: text('email'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  usedBy: text('used_by'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Walks (verabredete Termine)                                         */
/* ------------------------------------------------------------------ */

/** Wiederkehrende Termine („jeden Dienstag, 10 Uhr“). */
export const walkSeries = pgTable('walk_series', {
  id: id(),
  groupId: text('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  /** 0 = Sonntag … 6 = Samstag */
  weekday: integer('weekday').notNull(),
  /** „10:00“ (Ortszeit Europe/Berlin) */
  timeOfDay: text('time_of_day').notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(60),
  distanceKm: real('distance_km'),
  tempo: text('tempo').notNull().default('zuegig'),
  meetingPointName: text('meeting_point_name').notNull(),
  meetingAddress: text('meeting_address').notNull(),
  meetingDescription: text('meeting_description').notNull().default(''),
  meetingLat: doublePrecision('meeting_lat'),
  meetingLon: doublePrecision('meeting_lon'),
  /** höchstens so viele Zusagen je Termin (null = unbegrenzt) */
  maxParticipants: integer('max_participants'),
  active: boolean('active').notNull().default(true),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const walks = pgTable(
  'walks',
  {
    id: id(),
    /** 'group' | 'partner' (1:1) | 'distance' (Gemeinsam auf Distanz) */
    kind: text('kind').notNull().default('group'),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    seriesId: text('series_id').references(() => walkSeries.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(60),
    distanceKm: real('distance_km'),
    tempo: text('tempo').notNull().default('zuegig'),
    /** Treffpunkt – nur für bestätigte Mitglieder/Teilnehmende sichtbar */
    meetingPointName: text('meeting_point_name').notNull().default(''),
    meetingAddress: text('meeting_address').notNull().default(''),
    meetingDescription: text('meeting_description').notNull().default(''),
    meetingLat: doublePrecision('meeting_lat'),
    meetingLon: doublePrecision('meeting_lon'),
    /** ungefährer Ort für Suche/Liste (PLZ-Mittelpunkt bzw. Stadt) */
    postalCode: text('postal_code'),
    city: text('city'),
    district: text('district'),
    lat: doublePrecision('lat'),
    lon: doublePrecision('lon'),
    maxParticipants: integer('max_participants'),
    status: text('status').notNull().default('planned'), // planned | cancelled
    /** Bestätigung durch die Gruppenleitung → zählt für alle Zusagenden */
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: text('confirmed_by'),
    confirmedDistanceKm: real('confirmed_distance_km'),
    confirmedDurationMinutes: integer('confirmed_duration_minutes'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('walks_starts_idx').on(t.startsAt),
    index('walks_geo_idx').on(t.lat, t.lon),
    index('walks_group_idx').on(t.groupId),
    uniqueIndex('walks_series_start_uq').on(t.seriesId, t.startsAt),
  ],
);

export const walkRsvps = pgTable(
  'walk_rsvps',
  {
    walkId: text('walk_id')
      .notNull()
      .references(() => walks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('yes'), // yes | no | invited
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.walkId, t.userId] })],
);

/* ------------------------------------------------------------------ */
/* Eingetragene Walks (Aktivitäten)                                    */
/* ------------------------------------------------------------------ */

export const activities = pgTable(
  'activities',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Datum + Startzeit */
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    distanceKm: real('distance_km').notNull(),
    /** GeoJSON LineString-Koordinaten [[lon, lat], ...] (optional) */
    route: jsonb('route').$type<[number, number][]>(),
    source: text('source').notNull().default('manual'), // manual | gpx | group
    walkId: text('walk_id').references(() => walks.id, { onDelete: 'set null' }),
    title: text('title'),
    note: text('note'),
    /** Ort für regionale Wappen */
    city: text('city'),
    district: text('district'),
    visibility: text('visibility').notNull().default('group'),
    createdAt: createdAt(),
  },
  (t) => [
    index('activities_user_idx').on(t.userId, t.startedAt),
    uniqueIndex('activities_user_walk_uq').on(t.userId, t.walkId),
  ],
);

/* ------------------------------------------------------------------ */
/* Soziales                                                            */
/* ------------------------------------------------------------------ */

/** Beitrag im Feed: optional mit Walk-Eintrag, Fotos, Gruppe oder „Gemeinsam auf Distanz“-Termin. */
export const posts = pgTable(
  'posts',
  {
    id: id(),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    walkId: text('walk_id').references(() => walks.id, { onDelete: 'cascade' }),
    activityId: text('activity_id').references(() => activities.id, { onDelete: 'cascade' }),
    text: text('text').notNull().default(''),
    visibility: text('visibility').notNull().default('group'),
    createdAt: createdAt(),
  },
  (t) => [
    index('posts_group_idx').on(t.groupId, t.createdAt),
    index('posts_author_idx').on(t.authorId),
    index('posts_walk_idx').on(t.walkId, t.createdAt),
    index('posts_created_idx').on(t.createdAt),
  ],
);

export const photos = pgTable(
  'photos',
  {
    id: id(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    postId: text('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    /** relativer Speicherpfad (nie direkt öffentlich) */
    storageKey: text('storage_key').notNull(),
    width: integer('width'),
    height: integer('height'),
    altText: text('alt_text').notNull().default(''),
    visibility: text('visibility').notNull().default('group'),
    createdAt: createdAt(),
  },
  (t) => [index('photos_post_idx').on(t.postId), index('photos_owner_idx').on(t.ownerId)],
);

export const likes = pgTable(
  'likes',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const comments = pgTable(
  'comments',
  {
    id: id(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: text('deleted_by'),
    createdAt: createdAt(),
  },
  (t) => [index('comments_post_idx').on(t.postId, t.createdAt)],
);

/** Folgen erst nach Bestätigung: status 'pending' | 'accepted'. */
export const follows = pgTable(
  'follows',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    followeeId: text('followee_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] }), index('follows_followee_idx').on(t.followeeId, t.status)],
);

export const blocks = pgTable(
  'blocks',
  {
    blockerId: text('blocker_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index('blocks_blocked_idx').on(t.blockedId)],
);

/** Meldungen. Je Person und Ziel nur eine Meldung (doppeltes Melden ist idempotent). */
export const reports = pgTable(
  'reports',
  {
    id: id(),
    reporterId: text('reporter_id').references(() => user.id, { onDelete: 'set null' }),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('reports_reporter_target_uq').on(t.reporterId, t.targetType, t.targetId)],
);

/* ------------------------------------------------------------------ */
/* Spielelemente                                                       */
/* ------------------------------------------------------------------ */

export const challenges = pgTable('challenges', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  /** Erklärung in einem Satz */
  summary: text('summary').notNull(),
  type: text('type').notNull(), // single_distance | walk_count | total_distance
  target: real('target').notNull(),
  scope: text('scope').notNull().default('everyone'), // everyone | city | group
  groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
  city: text('city'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  points: integer('points').notNull().default(50),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const challengeParticipants = pgTable(
  'challenge_participants',
  {
    challengeId: text('challenge_id')
      .notNull()
      .references(() => challenges.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    progress: real('progress').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.challengeId, t.userId] })],
);

export const userBadges = pgTable(
  'user_badges',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    badgeKey: text('badge_key').notNull(),
    /** z. B. Name des Landkreises bei regionalen Wappen */
    label: text('label'),
    awardedAt: createdAt(),
    /** öffentlicher Teil-Link (zufälliges Token), null = nicht geteilt */
    shareToken: text('share_token').unique(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeKey] })],
);

/** Punktebuch. (userId, reason, ref) eindeutig → keine doppelte Vergabe. */
export const pointsLedger = pgTable(
  'points_ledger',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(), // activity | group_walk | challenge | badge
    ref: text('ref').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('points_unique_ref').on(t.userId, t.reason, t.ref)],
);

/* ------------------------------------------------------------------ */
/* Ländliche Regionen                                                  */
/* ------------------------------------------------------------------ */

/** „Interesse anmelden“: E-Mail, sobald sich jemand in der Nähe einträgt. */
export const interestAlerts = pgTable('interest_alerts', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
    .unique(),
  postalCode: text('postal_code').notNull(),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
  radiusKm: integer('radius_km').notNull().default(15),
  lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
  createdAt: createdAt(),
});

/** „Gehpartner“-Gesuche (1:1-Verabredung). */
export const partnerOffers = pgTable('partner_offers', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
    .unique(),
  postalCode: text('postal_code').notNull(),
  city: text('city').notNull(),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
  tempo: text('tempo').notNull().default('zuegig'),
  /** Freitext, z. B. „vormittags unter der Woche“ */
  availability: text('availability').notNull().default(''),
  note: text('note').notNull().default(''),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Anfrage an ein Gehpartner-Gesuch. Je Paar (Gesuch, Absenderin) nur eine Anfrage (idempotent). */
export const partnerRequests = pgTable(
  'partner_requests',
  {
    id: id(),
    offerId: text('offer_id')
      .notNull()
      .references(() => partnerOffers.id, { onDelete: 'cascade' }),
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    message: text('message').notNull().default(''),
    status: text('status').notNull().default('pending'), // pending | accepted | declined
    walkId: text('walk_id').references(() => walks.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('partner_requests_pair_uq').on(t.offerId, t.fromUserId)],
);

/* ------------------------------------------------------------------ */
/* Premium                                                             */
/* ------------------------------------------------------------------ */

export const subscriptions = pgTable('subscriptions', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // active (auch gekündigt bis Laufzeitende, siehe cancelAtPeriodEnd) | expired
  provider: text('provider').notNull().default('dev'),
  providerRef: text('provider_ref'),
  priceCents: integer('price_cents').notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const goals = pgTable(
  'goals',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    period: text('period').notNull(), // week | month
    metric: text('metric').notNull(), // km | walks
    target: real('target').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('goals_user_period_metric').on(t.userId, t.period, t.metric)],
);

/* ------------------------------------------------------------------ */
/* Benachrichtigungen (in der App)                                     */
/* ------------------------------------------------------------------ */

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);
