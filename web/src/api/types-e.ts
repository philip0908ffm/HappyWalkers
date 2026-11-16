/**
 * Antworttypen für Paket E (Oberfläche) – abgeleitet aus docs/API.md,
 * Abschnitte „Paket B“, „Paket C“ und „Ländliche Regionen“ (Paket A).
 */
import type { BadgeKind, Tempo, Visibility } from '@gehmeinsam/shared';
import type { Place } from './types';

export type { Visibility };

export interface PersonRef {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AwardResult {
  pointsAwarded: number;
  newBadges: string[];
  completedChallenges: string[];
}

/** [lon, lat] wie im API-Vertrag */
export type RoutePoint = [number, number];

/* ---------- Paket B: Eintragen ---------- */

export interface Activity {
  id: string;
  startedAt: string;
  durationMinutes: number;
  distanceKm: number;
  route: RoutePoint[] | null;
  source: 'manual' | 'gpx' | 'group';
  walkId: string | null;
  title: string | null;
  note: string | null;
  city: string | null;
  district: string | null;
  visibility: Visibility;
  createdAt: string;
  speedKmh: number;
}

export interface ActivitiesPage {
  activities: Activity[];
  nextCursor: string | null;
}

export interface CreateActivityResult {
  activity: Activity;
  award: AwardResult;
  post: { id: string } | null;
}

export interface GpxPreview {
  startedAt: string;
  durationMinutes: number;
  distanceKm: number;
  route: RoutePoint[];
}

/* ---------- Paket B: Abzeichen ---------- */

export interface BadgeEarned {
  key: string;
  label: string | null;
  kind: BadgeKind;
  tier: 1 | 2 | 3;
  awardedAt: string;
  shareUrl: string | null;
}

export interface BadgeAvailable {
  key: string;
  kind: BadgeKind;
  tier: 1 | 2 | 3;
  earned: boolean;
  progress: { current: number; target: number } | null;
}

export interface BadgesOverview {
  points: number;
  walksCount: number;
  totalKm: number;
  groupWalksCount: number;
  earned: BadgeEarned[];
  available: BadgeAvailable[];
}

export interface SharedBadge {
  displayName: string;
  badge: { key: string; label: string | null; kind: BadgeKind; tier: 1 | 2 | 3; awardedAt: string };
}

/* ---------- Paket B: Mitmach-Aktionen (Challenges) ---------- */

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  summary: string;
  type: 'single_distance' | 'walk_count' | 'total_distance';
  target: number;
  unit: 'km' | 'walks';
  scope: 'everyone' | 'city' | 'group';
  group: { id: string; name: string } | null;
  city: string | null;
  startsAt: string;
  endsAt: string;
  points: number;
  participantCount: number;
  joined: boolean;
  progress: number;
  completedAt: string | null;
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  progress: number;
  isMe: boolean;
}

/* ---------- Paket B: Premium ---------- */

export interface Subscription {
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  priceCents?: number;
}

export interface PremiumStatus {
  premium: boolean;
  subscription: Subscription | null;
  price: { priceCents: number; currency: string; interval: string };
  features: string[];
}

export interface PremiumStats {
  totals: { walks: number; km: number; minutes: number; avgSpeedKmh: number };
  series: { label: string; start: string; walks: number; km: number; avgSpeedKmh: number }[];
  speedTrend: { label: string; avgSpeedKmh: number }[];
}

export interface Goal {
  id: string;
  period: 'week' | 'month';
  metric: 'km' | 'walks';
  target: number;
  progress: number;
}

export interface YearReview {
  year: number;
  walks: number;
  km: number;
  minutes: number;
  groupWalks: number;
  badges: BadgeEarned[];
  bestMonth: string | number | { month: number | string; km?: number; walks?: number } | null;
  longestWalk: { distanceKm: number; startedAt?: string } | number | null;
  places: string[];
}

/* ---------- Paket C: Soziales ---------- */

export interface Photo {
  id: string;
  url: string;
  width: number;
  height: number;
  altText: string;
  visibility: Visibility;
}

export interface Post {
  id: string;
  author: PersonRef;
  group: { id: string; name: string } | null;
  walk: { id: string; title: string; startsAt: string } | null;
  activity: { id: string; distanceKm: number; durationMinutes: number; startedAt: string; route: RoutePoint[] | null } | null;
  text: string;
  visibility: Visibility;
  photos: Photo[];
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  createdAt: string;
  canDelete: boolean;
}

export interface PublicProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  bio: string | null;
  canSeeDetails: boolean;
  followStatus: 'none' | 'pending' | 'accepted';
  followsMe: boolean;
  isBlocked: boolean;
  stats: { walks: number; km: number } | null;
  badges: BadgeEarned[] | null;
  sharedGroups: { id: string; name: string }[];
}

export interface Follows {
  following: PersonRef[];
  followers: PersonRef[];
  requests: PersonRef[];
}

export interface AppNotification {
  id: string;
  type: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

/* ---------- Paket A: Walks / Gruppen (nur benötigte Felder) ---------- */

export interface WalkSummaryE {
  id: string;
  kind: 'group' | 'partner' | 'distance';
  title: string;
  startsAt: string;
  durationMinutes: number;
  distanceKm: number | null;
  tempo: Tempo;
  city: string | null;
  district: string | null;
  participantCount: number;
  maxParticipants: number | null;
  status: 'planned' | 'cancelled';
  myRsvp: 'yes' | null;
}

export interface GroupSummaryE {
  id: string;
  name: string;
  city: string | null;
  district: string | null;
  distanceKm: number | null;
  memberCount: number;
  defaultTempo: Tempo;
  womenOnly: boolean;
  nextWalk: { id: string; title: string; startsAt: string } | null;
}

export interface MyGroup {
  id: string;
  name: string;
  city: string | null;
  role: string;
  status: string;
}

/* ---------- Ländliche Regionen ---------- */

export interface Interest {
  postalCode: string;
  city: string;
  radiusKm: number;
  createdAt: string;
}

export interface RuralOverview {
  center: Place;
  groupsInRadius: number;
  walksInRadius: number;
  nearestGroups: GroupSummaryE[];
  nearestTown: { city: string; distanceKm: number } | null;
  partnersNearby: number;
  distanceWalks: WalkSummaryE[];
  interest: Interest | null;
  radiusOptions: number[];
}

export interface PartnerOffer {
  id: string;
  person: PersonRef;
  city: string | null;
  distanceKm: number;
  tempo: Tempo;
  availability: string;
  note: string;
  isMine: boolean;
}

export interface MyPartnerOffer {
  id?: string;
  postalCode: string;
  tempo: Tempo;
  availability: string;
  note: string;
  active: boolean;
}

export interface PartnerRequest {
  id: string;
  from: PersonRef;
  to: PersonRef;
  message: string;
  status: 'pending' | 'accepted' | 'declined' | string;
  walkId: string | null;
  createdAt: string;
}
