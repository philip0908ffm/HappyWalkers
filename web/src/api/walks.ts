/**
 * Abfragen für Gruppen, Walks und Einladungen (Paket A) – gemeinsame Abfrage-Schlüssel,
 * damit nach jeder Aktion die richtigen Daten neu geladen werden.
 */
import { api } from './client';
import type {
  GroupDetail,
  GroupMember,
  GroupSearchResult,
  GroupTemplate,
  InviteInfo,
  InvitePreview,
  MyGroup,
  PosterData,
  SearchLocation,
  WalkDetail,
  WalkSearchResult,
} from './types-walks';

export const qk = {
  myGroups: ['me', 'groups'] as const,
  groups: ['groups'] as const,
  group: (id: string) => ['groups', id] as const,
  members: (id: string) => ['groups', id, 'members'] as const,
  invite: (id: string) => ['groups', id, 'invite'] as const,
  walks: ['walks'] as const,
  walk: (id: string) => ['walks', id] as const,
  feed: ['feed'] as const,
};

/** Baut die Ortsangabe für Suchanfragen (`postalCode` oder `lat`/`lon`, sonst Profil-PLZ). */
export function locationParams(loc: SearchLocation, p = new URLSearchParams()): URLSearchParams {
  if (loc.type === 'postal') p.set('postalCode', loc.postalCode);
  if (loc.type === 'coords') {
    p.set('lat', loc.lat.toFixed(4));
    p.set('lon', loc.lon.toFixed(4));
  }
  return p;
}

export const walksApi = {
  search: (params: URLSearchParams) => api.get<WalkSearchResult>(`/walks?${params}`),
  get: (id: string) => api.get<{ walk: WalkDetail }>(`/walks/${id}`).then((r) => r.walk),
  rsvp: (id: string, status: 'yes' | 'no') =>
    api.put<{ myRsvp: 'yes' | null; participantCount: number }>(`/walks/${id}/rsvp`, { status }),
  cancel: (id: string) => api.del<{ ok: true }>(`/walks/${id}`),
  confirm: (id: string, body: { distanceKm: number; durationMinutes: number; attendeeIds?: string[] }) =>
    api.post<{ confirmedCount: number }>(`/walks/${id}/confirm`, body),
};

export const groupsApi = {
  mine: () => api.get<{ groups: MyGroup[] }>('/me/groups').then((r) => r.groups),
  search: (params: URLSearchParams) => api.get<GroupSearchResult>(`/groups?${params}`),
  get: (id: string) => api.get<{ group: GroupDetail }>(`/groups/${id}`).then((r) => r.group),
  templates: () => api.get<{ templates: GroupTemplate[] }>('/groups/templates').then((r) => r.templates),
  join: (id: string, message?: string) =>
    api.post<{ membership: { role: string; status: string } }>(`/groups/${id}/join`, message ? { message } : {}),
  leave: (id: string) => api.post<{ ok: true }>(`/groups/${id}/leave`),
  members: (id: string) => api.get<{ members: GroupMember[] }>(`/groups/${id}/members`).then((r) => r.members),
  invite: (id: string) => api.get<InviteInfo>(`/groups/${id}/invite`),
  poster: (id: string) => api.get<PosterData>(`/groups/${id}/poster`),
  joinByCode: (code: string) =>
    api.post<{ groupId: string; membership: { role: string; status: string } }>('/groups/join-by-code', { code }),
};

export const invitesApi = {
  get: (code: string) => api.get<InvitePreview>(`/invites/${encodeURIComponent(code)}`),
  accept: (code: string) =>
    api.post<{ groupId: string; membership: { role: string; status: string } }>(
      `/invites/${encodeURIComponent(code)}/accept`,
    ),
};

/** Gruppenleitung: Gründerin oder Moderatorin */
export const isLead = (role: string | undefined | null) => role === 'founder' || role === 'moderator';
