import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { badRequest, notFound, parse, zId } from '../lib/http.js';
import { personRefs, type PersonRef } from '../lib/people.js';
import { me, requireAdmin } from '../middleware/auth.js';
import { deleteStoredFiles } from '../services/storage.js';

/**
 * Verwaltung (nur Rolle „admin“): Meldungen sichten, schließen, gemeldete Inhalte entfernen.
 * Personen (Liste, Sperren, Rolle) laufen über die Endpunkte des Better-Auth-Admin-Plugins
 * unter /api/auth/admin/* – siehe docs/API.md.
 *
 * Datensparsamkeit: Personen erscheinen hier nur als PersonRef (keine E-Mail, kein Telefon).
 */
export const router = Router();
router.use(requireAdmin);

const REMOVABLE = ['post', 'comment', 'photo'] as const;
type Removable = (typeof REMOVABLE)[number];
const isRemovable = (t: string): t is Removable => (REMOVABLE as readonly string[]).includes(t);

const EXCERPT_LENGTH = 200;
const excerpt = (text: string | null | undefined) => {
  const v = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!v) return null;
  return v.length > EXCERPT_LENGTH ? `${v.slice(0, EXCERPT_LENGTH - 1)}…` : v;
};

interface TargetPreview {
  type: string;
  id: string;
  /** false, wenn das Ziel inzwischen gelöscht wurde */
  exists: boolean;
  excerpt: string | null;
  authorId: string | null;
}

/** Vorschau der gemeldeten Ziele gesammelt laden (eine Abfrage je Zieltyp, kein N+1). */
async function loadTargets(rows: { targetType: string; targetId: string }[]): Promise<Map<string, TargetPreview>> {
  const byType = new Map<string, string[]>();
  for (const r of rows) (byType.get(r.targetType) ?? byType.set(r.targetType, []).get(r.targetType)!).push(r.targetId);
  const out = new Map<string, TargetPreview>();
  const put = (type: string, id: string, ex: string | null, authorId: string | null) =>
    out.set(`${type}:${id}`, { type, id, exists: true, excerpt: ex, authorId });

  const ids = (t: string) => [...new Set(byType.get(t) ?? [])];
  if (ids('post').length) {
    const r = await db.select({ id: s.posts.id, text: s.posts.text, authorId: s.posts.authorId }).from(s.posts).where(inArray(s.posts.id, ids('post')));
    for (const x of r) put('post', x.id, excerpt(x.text), x.authorId);
  }
  if (ids('comment').length) {
    const r = await db
      .select({ id: s.comments.id, text: s.comments.text, authorId: s.comments.authorId })
      .from(s.comments)
      .where(and(inArray(s.comments.id, ids('comment')), isNull(s.comments.deletedAt)));
    for (const x of r) put('comment', x.id, excerpt(x.text), x.authorId);
  }
  if (ids('photo').length) {
    const r = await db.select({ id: s.photos.id, altText: s.photos.altText, ownerId: s.photos.ownerId }).from(s.photos).where(inArray(s.photos.id, ids('photo')));
    for (const x of r) put('photo', x.id, excerpt(x.altText), x.ownerId);
  }
  if (ids('group').length) {
    const r = await db.select({ id: s.groups.id, name: s.groups.name, createdBy: s.groups.createdBy }).from(s.groups).where(inArray(s.groups.id, ids('group')));
    for (const x of r) put('group', x.id, excerpt(x.name), x.createdBy);
  }
  if (ids('walk').length) {
    const r = await db.select({ id: s.walks.id, title: s.walks.title, createdBy: s.walks.createdBy }).from(s.walks).where(inArray(s.walks.id, ids('walk')));
    for (const x of r) put('walk', x.id, excerpt(x.title), x.createdBy);
  }
  if (ids('user').length) {
    const r = await db.select({ id: s.user.id }).from(s.user).where(inArray(s.user.id, ids('user')));
    for (const x of r) put('user', x.id, null, x.id);
  }
  for (const r of rows) {
    const key = `${r.targetType}:${r.targetId}`;
    if (!out.has(key)) out.set(key, { type: r.targetType, id: r.targetId, exists: false, excerpt: null, authorId: null });
  }
  return out;
}

const listSchema = z.object({
  status: z.enum(['open', 'closed']).default('open'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}
function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso ?? '');
  if (!id || Number.isNaN(createdAt.getTime())) throw badRequest('invalid_input');
  return { createdAt, id };
}

/** Meldungen mit Ziel-Vorschau, neueste zuerst. */
router.get('/reports', async (req, res) => {
  const q = parse(listSchema, req.query);
  const conds = [eq(s.reports.status, q.status)];
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    conds.push(or(lt(s.reports.createdAt, c.createdAt), and(eq(s.reports.createdAt, c.createdAt), lt(s.reports.id, c.id)))!);
  }
  const rows = await db
    .select()
    .from(s.reports)
    .where(and(...conds))
    .orderBy(desc(s.reports.createdAt), desc(s.reports.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const targets = await loadTargets(page);
  // mit viewerId: Profilbild nur, wenn die Admin-Person es auch sonst sehen dürfte
  const people = await personRefs([...page.map((r) => r.reporterId), ...[...targets.values()].map((t) => t.authorId)], me(req).id);
  const ref = (id: string | null): PersonRef | null => (id ? (people.get(id) ?? null) : null);
  res.json({
    reports: page.map((r) => {
      const t = targets.get(`${r.targetType}:${r.targetId}`)!;
      return {
        id: r.id,
        status: r.status,
        reason: r.reason,
        createdAt: r.createdAt,
        reporter: ref(r.reporterId),
        target: {
          type: t.type,
          id: t.id,
          exists: t.exists,
          excerpt: t.excerpt,
          author: ref(t.authorId),
          removable: t.exists && isRemovable(t.type),
        },
      };
    }),
    nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id) : null,
  });
});

async function requireReport(id: string) {
  const [r] = await db.select().from(s.reports).where(eq(s.reports.id, id)).limit(1);
  if (!r) throw notFound('report_not_found');
  return r;
}

/** Meldung schließen (idempotent). */
router.post('/reports/:id/close', async (req, res) => {
  const r = await requireReport(parse(zId, req.params.id));
  if (r.status !== 'closed') await db.update(s.reports).set({ status: 'closed' }).where(eq(s.reports.id, r.id));
  res.json({ ok: true });
});

/** Alle offenen Meldungen zu diesen Zielen schließen. */
async function closeReportsFor(type: string, ids: string[]) {
  if (!ids.length) return;
  await db
    .update(s.reports)
    .set({ status: 'closed' })
    .where(and(eq(s.reports.targetType, type), inArray(s.reports.targetId, ids), eq(s.reports.status, 'open')));
}

/**
 * Gemeldeten Beitrag/Kommentar/Foto löschen (inkl. Bilddateien) und die Meldung schließen.
 * Idempotent: ist der Inhalt schon weg, wird nur geschlossen. Weitere offene Meldungen zum selben
 * Inhalt (und zu Fotos/Kommentaren eines gelöschten Beitrags) werden mit geschlossen.
 */
router.post('/reports/:id/remove-content', async (req, res) => {
  const adminId = me(req).id;
  const r = await requireReport(parse(zId, req.params.id));
  if (!isRemovable(r.targetType)) throw badRequest('content_not_removable');
  let removed = false;

  if (r.targetType === 'post') {
    const [post] = await db.select({ id: s.posts.id }).from(s.posts).where(eq(s.posts.id, r.targetId)).limit(1);
    if (post) {
      const photos = await db.select({ id: s.photos.id, key: s.photos.storageKey }).from(s.photos).where(eq(s.photos.postId, post.id));
      const comments = await db.select({ id: s.comments.id }).from(s.comments).where(eq(s.comments.postId, post.id));
      await db.delete(s.posts).where(eq(s.posts.id, post.id)); // Fotos, Herzen, Kommentare per Kaskade
      await deleteStoredFiles(photos.map((p) => p.key));
      await closeReportsFor('photo', photos.map((p) => p.id));
      await closeReportsFor('comment', comments.map((c) => c.id));
      removed = true;
    }
  } else if (r.targetType === 'comment') {
    const [c] = await db
      .update(s.comments)
      .set({ deletedAt: new Date(), deletedBy: adminId })
      .where(and(eq(s.comments.id, r.targetId), isNull(s.comments.deletedAt)))
      .returning({ id: s.comments.id });
    if (c) {
      await db
        .delete(s.notifications)
        .where(and(eq(s.notifications.type, 'comment'), sql`${s.notifications.data}->>'commentId' = ${c.id}`));
      removed = true;
    }
  } else {
    const [photo] = await db.delete(s.photos).where(eq(s.photos.id, r.targetId)).returning({ key: s.photos.storageKey });
    if (photo) {
      await deleteStoredFiles([photo.key]);
      removed = true;
    }
  }

  await closeReportsFor(r.targetType, [r.targetId]);
  if (r.status !== 'closed') await db.update(s.reports).set({ status: 'closed' }).where(eq(s.reports.id, r.id));
  res.json({ ok: true, removed });
});
