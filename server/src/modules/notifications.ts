import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { notifications } from '../db/schema.js';
import { parse, zId } from '../lib/http.js';
import { blockedIds, personRefs } from '../lib/people.js';
import { me, requireUser } from '../middleware/auth.js';

/**
 * Modul „notifications“ (Paket C): In-App-Benachrichtigungen. Eingehängt unter `/api/v1/notifications`.
 * Enthält `data.actorId`, wird die auslösende Person als `actor` (PersonRef) mitgeliefert;
 * Hinweise von blockierten Personen werden ausgeblendet.
 */
export const router = Router();
router.use(requireUser);

async function unreadCount(userId: string) {
  const [c] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(c?.n ?? 0);
}

router.get('/', async (req, res) => {
  const userId = me(req).id;
  const [rows, blocked, unread] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(50),
    blockedIds(userId),
    unreadCount(userId),
  ]);
  const actorOf = (d: Record<string, unknown>) => (typeof d?.actorId === 'string' ? d.actorId : null);
  const visible = rows.filter((n) => {
    const a = actorOf(n.data);
    return !a || !blocked.has(a);
  });
  const people = await personRefs(
    visible.map((n) => actorOf(n.data)),
    userId,
  );
  res.json({
    notifications: visible.map((n) => {
      const a = actorOf(n.data);
      return { id: n.id, type: n.type, data: n.data, actor: a ? (people.get(a) ?? null) : null, readAt: n.readAt, createdAt: n.createdAt };
    }),
    unread,
  });
});

router.get('/unread-count', async (req, res) => {
  res.json({ unread: await unreadCount(me(req).id) });
});

router.post('/read-all', async (req, res) => {
  const userId = me(req).id;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  res.json({ ok: true });
});

/** einzelne Benachrichtigung als gelesen markieren (idempotent) */
router.post('/:id/read', async (req, res) => {
  const userId = me(req).id;
  const id = parse(zId, req.params.id);
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)));
  res.json({ ok: true });
});
