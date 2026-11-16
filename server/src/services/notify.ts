import { db } from '../db/index.js';
import { notifications } from '../db/schema.js';

/**
 * In-App-Benachrichtigung anlegen. Typen (i18n: notifications.<type>):
 * join_request, join_approved, follow_request, follow_accepted, walk_cancelled, walk_confirmed,
 * comment, like, badge, challenge_done, partner_request, partner_accepted, interest_match
 * Hinweis: Entfernte/gesperrte Mitglieder und gelöschte Kommentare werden NICHT benachrichtigt.
 */
export async function notify(userId: string, type: string, data: Record<string, unknown> = {}) {
  await db.insert(notifications).values({ userId, type, data });
}
