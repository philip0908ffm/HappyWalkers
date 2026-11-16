/**
 * Spielelemente: Punkte, Abzeichen, Fortschritt in Challenges.
 * Zuständig: Jonas (Paket B). Wird von activities und walks (Bestätigung) aufgerufen.
 */
export interface AwardResult {
  pointsAwarded: number;
  newBadges: string[];
  completedChallenges: string[];
}

/**
 * Nach jedem neu erfassten Walk (manuell, GPX oder bestätigter Gruppen-Walk) aufrufen.
 * Muss idempotent sein (doppelter Aufruf vergibt nichts doppelt).
 */
export async function onActivityRecorded(_userId: string, _activityId: string): Promise<AwardResult> {
  return { pointsAwarded: 0, newBadges: [], completedChallenges: [] };
}

/** Nach dem Löschen eines Walks: Challenge-Fortschritt neu berechnen. */
export async function onActivityDeleted(_userId: string): Promise<void> {}

/** Einzelnes Abzeichen vergeben (idempotent). Gibt true zurück, wenn es neu ist. */
export async function awardBadge(_userId: string, _badgeKey: string, _label?: string): Promise<boolean> {
  return false;
}
