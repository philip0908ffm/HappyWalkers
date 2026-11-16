/** Antworttypen der API (siehe docs/API.md). */
import type { Tempo } from '@gehmeinsam/shared';

export interface Me {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string;
  bio: string | null;
  postalCode: string | null;
  city: string | null;
  district: string | null;
  birthYear: number | null;
  gender: 'woman' | 'man' | 'diverse' | null;
  avatarUrl: string | null;
  onboarded: boolean;
  premium: boolean;
  subscription: { status: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; priceCents: number } | null;
  settings: {
    anrede: 'sie' | 'du';
    locale: string;
    fontScale: 'normal' | 'gross' | 'sehr-gross';
    profileVisibility: 'private' | 'followers' | 'public';
    leaderboardMode: 'display' | 'hidden';
    emailNotifications: boolean;
  };
}

export interface Place {
  postalCode: string;
  city: string;
  district: string;
  state: string;
  lat: number;
  lon: number;
}

export interface PublicConfig {
  smsLogin: boolean;
  mapTileUrl: string;
  mapAttribution: string;
  premium: { priceCents: number; currency: string; interval: string };
  billingProvider: string;
  locales: string[];
}

export type { Tempo };
