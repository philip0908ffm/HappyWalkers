/** Punkteregeln – einfach und nachvollziehbar. */
export const POINTS = {
  /** pro eingetragenem Walk */
  activity: 10,
  /** zusätzlich je angefangenem Kilometer */
  perKm: 2,
  /** Teilnahme an einem bestätigten Gruppen-Walk */
  groupWalk: 15,
  /** abgeschlossene Challenge (Standard, Challenge kann eigenen Wert haben) */
  challenge: 50,
  /** neues Abzeichen */
  badge: 20,
} as const;

export function pointsForActivity(distanceKm: number, isGroupWalk: boolean): number {
  return POINTS.activity + Math.ceil(Math.max(0, distanceKm)) * POINTS.perKm + (isGroupWalk ? POINTS.groupWalk : 0);
}
