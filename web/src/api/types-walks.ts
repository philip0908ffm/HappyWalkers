/**
 * Antworttypen für Gruppen, Walks, Einladungen und Neuigkeiten (siehe docs/API.md, Paket A und C).
 * Andere Pakete dürfen diese Typen gerne mitbenutzen.
 */
import type { GroupRole, JoinPolicy, MemberStatus, Tempo, Visibility, WalkKind } from '@happywalkers/shared';
import type { Place } from './types';

export type { GroupRole, JoinPolicy, MemberStatus, Tempo, Visibility, WalkKind, Place };

export interface PersonRef {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Membership {
  role: GroupRole;
  status: MemberStatus;
}

export interface GroupSummary {
  id: string;
  name: string;
  city: string;
  district: string;
  distanceKm: number | null;
  memberCount: number;
  joinPolicy: JoinPolicy;
  womenOnly: boolean;
  defaultTempo: Tempo;
  photoUrl: string | null;
  nextWalk: { id: string; title: string; startsAt: string } | null;
  myMembership: Membership | null;
}

export interface SeriesSummary {
  id: string;
  title: string;
  /** 0 = Sonntag … 6 = Samstag (wie JavaScript `Date.getDay()`) */
  weekday: number;
  /** „HH:MM“ */
  timeOfDay: string;
  durationMinutes: number;
  tempo: Tempo;
  distanceKm: number | null;
  active: boolean;
}

export interface WalkSummary {
  id: string;
  kind: WalkKind;
  title: string;
  startsAt: string;
  durationMinutes: number;
  distanceKm: number | null;
  tempo: Tempo;
  city: string | null;
  district: string | null;
  /** UNGEFÄHRER Ort (Gruppen-/PLZ-Mittelpunkt), nie der Treffpunkt */
  lat: number | null;
  lon: number | null;
  distanceFromCenterKm: number | null;
  group: { id: string; name: string; womenOnly: boolean; joinPolicy: JoinPolicy } | null;
  participantCount: number;
  maxParticipants: number | null;
  status: 'planned' | 'cancelled';
  confirmed: boolean;
  myRsvp: 'yes' | null;
  canSeeMeetingPoint: boolean;
  seriesId: string | null;
}

export interface MeetingPoint {
  name: string | null;
  address: string | null;
  description: string | null;
  lat: number | null;
  lon: number | null;
}

export interface WalkDetail extends WalkSummary {
  description: string | null;
  meetingPoint: MeetingPoint | null;
  participants: PersonRef[] | null;
  createdBy: PersonRef | null;
  canManage: boolean;
  canConfirm: boolean;
}

export interface GroupLead extends PersonRef {
  role: 'founder' | 'moderator';
}

export interface GroupDetail extends GroupSummary {
  description: string | null;
  rules: string | null;
  leads: GroupLead[];
  upcomingWalks: WalkSummary[];
  series: SeriesSummary[];
  inviteCode: string | null;
  canManage: boolean;
  isFounder: boolean;
}

export interface GroupTemplate {
  key: string;
  name: string;
  description: string;
  rules: string;
  defaultTempo: Tempo;
  joinPolicy: JoinPolicy;
  womenOnly?: boolean;
  series: { weekday: number; timeOfDay: string; durationMinutes: number; tempo: Tempo } | null;
}

export interface GroupMember extends PersonRef {
  role: GroupRole;
  status: MemberStatus;
  joinedAt: string;
  requestMessage?: string | null;
}

export type MemberAction =
  | 'approve'
  | 'decline'
  | 'remove'
  | 'ban'
  | 'unban'
  | 'make_moderator'
  | 'remove_moderator'
  | 'make_founder';

export interface MyGroup {
  id: string;
  name: string;
  city: string;
  role: GroupRole;
  status: MemberStatus;
}

export interface GroupSearchResult {
  groups: GroupSummary[];
  center: Place | null;
  nearest: GroupSummary[];
}

export interface WalkSearchResult {
  walks: WalkSummary[];
  center: Place | null;
  nearest: WalkSummary[];
}

export interface InviteInfo {
  url: string;
  code: string;
  whatsappUrl: string;
  mailtoUrl: string;
}

export interface InvitePreview {
  valid: boolean;
  group: {
    id: string;
    name: string;
    city: string;
    description: string | null;
    memberCount: number;
    womenOnly: boolean;
    photoUrl: string | null;
  } | null;
}

export interface PosterData {
  group: { name: string; city: string; description: string | null };
  code: string;
  url: string;
  qrSvg: string;
  series: SeriesSummary[];
  nextWalks: WalkSummary[];
}

/* ---------- Paket C: Neuigkeiten (Feed) ---------- */

export interface Photo {
  id: string;
  url: string;
  width: number;
  height: number;
  altText: string | null;
  visibility: Visibility;
}

export interface Post {
  id: string;
  author: PersonRef;
  group: { id: string; name: string } | null;
  walk: { id: string; title: string; startsAt: string; kind?: string } | null;
  activity: {
    id: string;
    distanceKm: number;
    durationMinutes: number;
    startedAt: string;
    route: [number, number][] | null;
  } | null;
  text: string;
  visibility: Visibility;
  photos: Photo[];
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  createdAt: string;
  canDelete: boolean;
}

export interface Comment {
  id: string;
  author: PersonRef;
  text: string;
  createdAt: string;
  canDelete: boolean;
}

/** Ortsangabe für Suchen: PLZ, Browser-Standort oder (leer) Profil-PLZ */
export type SearchLocation =
  | { type: 'postal'; postalCode: string; label?: string }
  | { type: 'coords'; lat: number; lon: number; label?: string }
  | { type: 'profile' };
