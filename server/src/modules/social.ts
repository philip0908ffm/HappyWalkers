import { maskRouteForOthers } from '../lib/geo.js';
import { badgeDefinition, LIMITS, REPORT_TARGETS, VISIBILITIES } from '@gehmeinsam/shared';
import { and, asc, count, desc, eq, inArray, isNull, notInArray, or, sql, sum, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import {
  canSeeContent,
  canSeeMeetingPoint,
  getMembership,
  isActiveMember,
  isBlockedEitherWay,
  isGroupLead,
  requireActiveMember,
  requireGroup,
} from '../lib/access.js';
import { badRequest, conflict, forbidden, notFound, parse, zId, zText } from '../lib/http.js';
import {
  avatarUrlFor,
  canSeeAvatar,
  canSeeWith,
  loadViewerContext,
  personRefs,
  type PersonRef,
  type ViewerContext,
} from '../lib/people.js';
import { me, requireUser } from '../middleware/auth.js';
import { deleteStoredFiles } from '../services/storage.js';
import { notify } from '../services/notify.js';

/**
 * Modul „social“ (Paket C): Feed, Beiträge, Herzen, Kommentare, Personen, Folgen, Blockieren, Melden.
 * Eingehängt unter `/api/v1/` – Endpunkte siehe docs/API.md.
 */
export const router = Router();

const paths = ['/feed', '/posts', '/comments', '/users', '/follows', '/blocks', '/reports'];
router.use(paths, requireUser);

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen                                                     */
/* ------------------------------------------------------------------ */

type PostRow = typeof s.posts.$inferSelect;

export function photoDto(p: typeof s.photos.$inferSelect) {
  return { id: p.id, url: `/api/v1/photos/${p.id}`, width: p.width, height: p.height, altText: p.altText, visibility: p.visibility };
}

const postItem = (p: PostRow) => ({ ownerId: p.authorId, visibility: p.visibility, groupId: p.groupId });

/**
 * Beiträge für die Ausgabe aufbereiten. Alle Zusatzdaten (Personen, Gruppen, Walks, Aktivitäten,
 * Fotos, Herzen, Kommentar-Zähler) werden gesammelt geladen – keine Abfrage je Beitrag.
 */
async function serializePosts(rows: PostRow[], ctx: ViewerContext) {
  if (!rows.length) return [];
  const ids = rows.map((p) => p.id);
  const groupIds = [...new Set(rows.map((p) => p.groupId).filter((x): x is string => !!x))];
  const walkIds = [...new Set(rows.map((p) => p.walkId).filter((x): x is string => !!x))];
  const activityIds = [...new Set(rows.map((p) => p.activityId).filter((x): x is string => !!x))];
  const blocked = [...ctx.blocked];

  const [people, groupRows, walkRows, activityRows, photoRows, likeCounts, myLikes, commentCounts] = await Promise.all([
    personRefs(
      rows.map((p) => p.authorId),
      ctx.userId,
    ),
    groupIds.length ? db.select({ id: s.groups.id, name: s.groups.name }).from(s.groups).where(inArray(s.groups.id, groupIds)) : [],
    walkIds.length
      ? db.select({ id: s.walks.id, title: s.walks.title, startsAt: s.walks.startsAt }).from(s.walks).where(inArray(s.walks.id, walkIds))
      : [],
    activityIds.length
      ? db
          .select({
            id: s.activities.id,
            userId: s.activities.userId,
            distanceKm: s.activities.distanceKm,
            durationMinutes: s.activities.durationMinutes,
            startedAt: s.activities.startedAt,
            route: s.activities.route,
            visibility: s.activities.visibility,
          })
          .from(s.activities)
          .where(inArray(s.activities.id, activityIds))
      : [],
    db.select().from(s.photos).where(inArray(s.photos.postId, ids)).orderBy(asc(s.photos.createdAt)),
    db.select({ postId: s.likes.postId, n: count() }).from(s.likes).where(inArray(s.likes.postId, ids)).groupBy(s.likes.postId),
    db
      .select({ postId: s.likes.postId })
      .from(s.likes)
      .where(and(inArray(s.likes.postId, ids), eq(s.likes.userId, ctx.userId))),
    db
      .select({ postId: s.comments.postId, n: count() })
      .from(s.comments)
      .where(
        and(
          inArray(s.comments.postId, ids),
          isNull(s.comments.deletedAt),
          blocked.length ? notInArray(s.comments.authorId, blocked) : undefined,
        ),
      )
      .groupBy(s.comments.postId),
  ]);

  const groupMap = new Map(groupRows.map((g) => [g.id, g]));
  const walkMap = new Map(walkRows.map((w) => [w.id, w]));
  const activityMap = new Map(activityRows.map((a) => [a.id, a]));
  const likeMap = new Map(likeCounts.map((l) => [l.postId, Number(l.n)]));
  const liked = new Set(myLikes.map((l) => l.postId));
  const commentMap = new Map(commentCounts.map((c) => [c.postId, Number(c.n)]));
  const photosByPost = new Map<string, ReturnType<typeof photoDto>[]>();
  for (const ph of photoRows) {
    // Fotos haben eine eigene Sichtbarkeit – nur zeigen, was die Person sehen darf
    if (!canSeeWith(ctx, { ownerId: ph.ownerId, visibility: ph.visibility, groupId: ph.groupId })) continue;
    const list = photosByPost.get(ph.postId!) ?? [];
    list.push(photoDto(ph));
    photosByPost.set(ph.postId!, list);
  }

  return rows.map((p) => {
    const a = p.activityId ? activityMap.get(p.activityId) : undefined;
    // Route (kann Rückschlüsse auf den Wohnort zulassen) nur nach Sichtbarkeit der Aktivität
    const showRoute = a ? canSeeWith(ctx, { ownerId: a.userId, visibility: a.visibility, groupId: p.groupId }) : false;
    const g = p.groupId ? groupMap.get(p.groupId) : undefined;
    const w = p.walkId ? walkMap.get(p.walkId) : undefined;
    return {
      id: p.id,
      author: people.get(p.authorId)!,
      group: g ? { id: g.id, name: g.name } : null,
      walk: w ? { id: w.id, title: w.title, startsAt: w.startsAt } : null,
      activity: a
        ? { id: a.id, distanceKm: a.distanceKm, durationMinutes: a.durationMinutes, startedAt: a.startedAt, route: showRoute ? (a.userId === ctx.userId ? (a.route ?? null) : maskRouteForOthers(a.route)) : null }
        : null,
      text: p.text,
      visibility: p.visibility,
      photos: photosByPost.get(p.id) ?? [],
      likeCount: likeMap.get(p.id) ?? 0,
      likedByMe: liked.has(p.id),
      commentCount: commentMap.get(p.id) ?? 0,
      createdAt: p.createdAt,
      canDelete: p.authorId === ctx.userId || (!!p.groupId && ctx.leadGroups.has(p.groupId)),
    };
  });
}

/** SQL-Bedingung „Beitrag ist für ctx sichtbar“ – entspricht canSeeContent (lib/access.ts). */
function visiblePostSql(ctx: ViewerContext): SQL {
  const following = [...ctx.following];
  const groups = [...ctx.activeGroups];
  const blocked = [...ctx.blocked];
  const allowed: SQL[] = [eq(s.posts.visibility, 'public')];
  if (following.length) {
    allowed.push(and(eq(s.posts.visibility, 'followers'), inArray(s.posts.authorId, following))!);
    allowed.push(and(eq(s.posts.visibility, 'group'), isNull(s.posts.groupId), inArray(s.posts.authorId, following))!);
  }
  if (groups.length) allowed.push(and(eq(s.posts.visibility, 'group'), inArray(s.posts.groupId, groups))!);
  const others = blocked.length ? and(notInArray(s.posts.authorId, blocked), or(...allowed))! : or(...allowed)!;
  return or(eq(s.posts.authorId, ctx.userId), others)!;
}

/** Zeitstempel auf Millisekunden (JS-Genauigkeit), damit der Cursor exakt passt. */
const postTime = sql`date_trunc('milliseconds', ${s.posts.createdAt})`;

function encodeCursor(p: { createdAt: Date; id: string }) {
  return Buffer.from(`${p.createdAt.toISOString()}|${p.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: string } {
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const d = new Date(at ?? '');
  if (!id || Number.isNaN(d.getTime())) throw badRequest('invalid_input', [{ field: 'cursor', code: 'invalid', message: 'cursor' }]);
  return { at: d, id };
}

/** Darf die Person diesen Walk (und damit seinen Feed) sehen? */
async function canSeeWalk(walk: typeof s.walks.$inferSelect, userId: string): Promise<boolean> {
  if (walk.createdBy && walk.createdBy !== userId && (await isBlockedEitherWay(walk.createdBy, userId))) return false;
  if (walk.kind === 'partner') return canSeeMeetingPoint(walk, userId);
  if (walk.groupId) {
    const [g] = await db.select({ joinPolicy: s.groups.joinPolicy }).from(s.groups).where(eq(s.groups.id, walk.groupId)).limit(1);
    if (!g) return false;
    if (g.joinPolicy === 'invite') return isActiveMember(await getMembership(walk.groupId, userId));
  }
  return true;
}

async function requireVisibleWalk(walkId: string, userId: string) {
  const [w] = await db.select().from(s.walks).where(eq(s.walks.id, walkId)).limit(1);
  if (!w || !(await canSeeWalk(w, userId))) throw notFound('walk_not_found');
  return w;
}

/** Beitrag laden, den die Person sehen darf – sonst 404 (kein Hinweis, ob es ihn gibt). */
async function requireVisiblePost(postId: string, userId: string) {
  const [p] = await db.select().from(s.posts).where(eq(s.posts.id, postId)).limit(1);
  if (!p || !(await canSeeContent(postItem(p), userId))) throw notFound('post_not_found');
  return p;
}

/** Person laden; existiert nicht oder hat die betrachtende Person blockiert → 404 user_not_found. */
async function requireUserVisible(targetId: string, viewerId: string) {
  const [u] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.id, targetId)).limit(1);
  if (!u) throw notFound('user_not_found');
  if (targetId === viewerId) return { blockedByMe: false };
  const rows = await db
    .select({ blocker: s.blocks.blockerId })
    .from(s.blocks)
    .where(
      or(
        and(eq(s.blocks.blockerId, viewerId), eq(s.blocks.blockedId, targetId)),
        and(eq(s.blocks.blockerId, targetId), eq(s.blocks.blockedId, viewerId)),
      ),
    );
  if (rows.some((r) => r.blocker === targetId)) throw notFound('user_not_found');
  return { blockedByMe: rows.length > 0 };
}

const toList = (m: Map<string, PersonRef>, ids: string[]) => ids.map((id) => m.get(id)!).filter(Boolean);

/* ------------------------------------------------------------------ */
/* Feed                                                                */
/* ------------------------------------------------------------------ */

const feedQuery = z.object({
  groupId: zId.optional(),
  walkId: zId.optional(),
  userId: zId.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get('/feed', async (req, res) => {
  const q = parse(feedQuery, req.query);
  const userId = me(req).id;
  const ctx = await loadViewerContext(userId);
  const conds: (SQL | undefined)[] = [visiblePostSql(ctx)];

  if (q.groupId) {
    await requireGroup(q.groupId);
    if (!ctx.activeGroups.has(q.groupId)) throw forbidden('not_group_member');
    conds.push(eq(s.posts.groupId, q.groupId));
  }
  if (q.walkId) {
    await requireVisibleWalk(q.walkId, userId);
    conds.push(eq(s.posts.walkId, q.walkId));
  }
  if (q.userId) {
    await requireUserVisible(q.userId, userId);
    if (ctx.blocked.has(q.userId)) throw notFound('user_not_found');
    conds.push(eq(s.posts.authorId, q.userId));
  }
  if (!q.groupId && !q.walkId && !q.userId) {
    // Standard-Feed: eigene + Gruppen mit aktiver Mitgliedschaft + bestätigte Kontakte
    const scope: SQL[] = [eq(s.posts.authorId, userId)];
    if (ctx.activeGroups.size) scope.push(inArray(s.posts.groupId, [...ctx.activeGroups]));
    if (ctx.following.size)
      scope.push(and(inArray(s.posts.authorId, [...ctx.following]), inArray(s.posts.visibility, ['followers', 'public']))!);
    conds.push(or(...scope));
  }
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    conds.push(or(sql`${postTime} < ${c.at.toISOString()}::timestamptz`, and(sql`${postTime} = ${c.at.toISOString()}::timestamptz`, sql`${s.posts.id} < ${c.id}`)));
  }

  const rows = await db
    .select()
    .from(s.posts)
    .where(and(...conds))
    .orderBy(desc(postTime), desc(s.posts.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  res.json({
    posts: await serializePosts(page, ctx),
    nextCursor: rows.length > q.limit && last ? encodeCursor(last) : null,
  });
});

/* ------------------------------------------------------------------ */
/* Beiträge                                                            */
/* ------------------------------------------------------------------ */

const postSchema = z.object({
  text: zText(LIMITS.maxTextLength).default(''),
  visibility: z.enum(VISIBILITIES).default('group'),
  groupId: zId.optional(),
  walkId: zId.optional(),
  activityId: zId.optional(),
  /** zuvor hochgeladene eigene Fotos (POST /photos ohne postId) an den Beitrag hängen */
  photoIds: z.array(zId).max(10).optional(),
});

router.post('/posts', async (req, res) => {
  const body = parse(postSchema, req.body);
  const userId = me(req).id;
  if (!body.text && !body.activityId && !body.photoIds?.length) {
    throw badRequest('invalid_input', [{ field: 'text', code: 'too_small', message: 'text' }]);
  }
  let groupId = body.groupId ?? null;
  if (body.walkId) {
    const w = await requireVisibleWalk(body.walkId, userId);
    if (w.groupId) {
      if (groupId && groupId !== w.groupId) throw badRequest('invalid_input', [{ field: 'groupId', code: 'mismatch', message: 'groupId' }]);
      groupId = w.groupId;
    }
  }
  if (groupId) {
    await requireGroup(groupId);
    await requireActiveMember(groupId, userId);
  }
  if (body.activityId) {
    const [a] = await db
      .select({ id: s.activities.id })
      .from(s.activities)
      .where(and(eq(s.activities.id, body.activityId), eq(s.activities.userId, userId)))
      .limit(1);
    if (!a) throw notFound('activity_not_found');
  }
  let photoRows: (typeof s.photos.$inferSelect)[] = [];
  if (body.photoIds?.length) {
    photoRows = await db
      .select()
      .from(s.photos)
      .where(and(inArray(s.photos.id, body.photoIds), eq(s.photos.ownerId, userId), isNull(s.photos.postId)));
    if (photoRows.length !== new Set(body.photoIds).size) throw notFound('photo_not_found');
  }

  const post = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(s.posts)
      .values({
        authorId: userId,
        groupId,
        walkId: body.walkId ?? null,
        activityId: body.activityId ?? null,
        text: body.text,
        visibility: body.visibility,
        createdAt: new Date(),
      })
      .returning();
    for (const ph of photoRows) {
      await tx
        .update(s.photos)
        .set({ postId: p.id, groupId: ph.groupId ?? groupId })
        .where(eq(s.photos.id, ph.id));
    }
    return p;
  });
  const ctx = await loadViewerContext(userId);
  const [dto] = await serializePosts([post], ctx);
  res.status(201).json({ post: dto });
});

router.delete('/posts/:id', async (req, res) => {
  const userId = me(req).id;
  const post = await requireVisiblePost(parse(zId, req.params.id), userId);
  const allowed = post.authorId === userId || (post.groupId && isGroupLead(await getMembership(post.groupId, userId)));
  if (!allowed) throw forbidden();
  const keys = await db.select({ key: s.photos.storageKey }).from(s.photos).where(eq(s.photos.postId, post.id));
  await db.delete(s.posts).where(eq(s.posts.id, post.id)); // Fotos, Herzen, Kommentare per Kaskade
  await deleteStoredFiles(keys.map((k) => k.key));
  res.json({ ok: true });
});

/* Herzen ------------------------------------------------------------- */

async function likeState(postId: string, userId: string) {
  const [[c], mine] = await Promise.all([
    db.select({ n: count() }).from(s.likes).where(eq(s.likes.postId, postId)),
    db
      .select({ u: s.likes.userId })
      .from(s.likes)
      .where(and(eq(s.likes.postId, postId), eq(s.likes.userId, userId)))
      .limit(1),
  ]);
  return { likeCount: Number(c?.n ?? 0), likedByMe: mine.length > 0 };
}

router.put('/posts/:id/like', async (req, res) => {
  const userId = me(req).id;
  const post = await requireVisiblePost(parse(zId, req.params.id), userId);
  const inserted = await db.insert(s.likes).values({ postId: post.id, userId }).onConflictDoNothing().returning();
  if (inserted.length && post.authorId !== userId) {
    // Herz weg und wieder dran → kein zweiter Hinweis
    const [seen] = await db
      .select({ id: s.notifications.id })
      .from(s.notifications)
      .where(
        and(
          eq(s.notifications.userId, post.authorId),
          eq(s.notifications.type, 'like'),
          sql`${s.notifications.data}->>'postId' = ${post.id}`,
          sql`${s.notifications.data}->>'actorId' = ${userId}`,
        ),
      )
      .limit(1);
    if (!seen) await notify(post.authorId, 'like', { postId: post.id, actorId: userId });
  }
  res.json(await likeState(post.id, userId));
});

router.delete('/posts/:id/like', async (req, res) => {
  const userId = me(req).id;
  const post = await requireVisiblePost(parse(zId, req.params.id), userId);
  await db.delete(s.likes).where(and(eq(s.likes.postId, post.id), eq(s.likes.userId, userId)));
  res.json(await likeState(post.id, userId));
});

/* Kommentare --------------------------------------------------------- */

router.get('/posts/:id/comments', async (req, res) => {
  const userId = me(req).id;
  const post = await requireVisiblePost(parse(zId, req.params.id), userId);
  const ctx = await loadViewerContext(userId);
  const blocked = [...ctx.blocked];
  const rows = await db
    .select()
    .from(s.comments)
    .where(
      and(eq(s.comments.postId, post.id), isNull(s.comments.deletedAt), blocked.length ? notInArray(s.comments.authorId, blocked) : undefined),
    )
    .orderBy(asc(s.comments.createdAt), asc(s.comments.id));
  const people = await personRefs(
    rows.map((c) => c.authorId),
    userId,
  );
  const isLead = !!post.groupId && ctx.leadGroups.has(post.groupId);
  res.json({
    comments: rows.map((c) => ({
      id: c.id,
      author: people.get(c.authorId)!,
      text: c.text,
      createdAt: c.createdAt,
      canDelete: c.authorId === userId || isLead,
    })),
  });
});

const commentSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.maxCommentLength)
    // Steuerzeichen (außer Zeilenumbruch/Tab) entfernen – Ausgabe ist reiner Text
    .transform((t) => t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')),
});

router.post('/posts/:id/comments', async (req, res) => {
  const userId = me(req).id;
  const body = parse(commentSchema, req.body);
  const post = await requireVisiblePost(parse(zId, req.params.id), userId);
  const [c] = await db.insert(s.comments).values({ postId: post.id, authorId: userId, text: body.text }).returning();
  if (post.authorId !== userId) await notify(post.authorId, 'comment', { postId: post.id, commentId: c.id, actorId: userId });
  const people = await personRefs([userId], userId);
  res.status(201).json({ comment: { id: c.id, author: people.get(userId)!, text: c.text, createdAt: c.createdAt, canDelete: true } });
});

/** Löschen durch Autorin oder Gruppenleitung – ohne Benachrichtigung, der Kommentar verschwindet einfach. */
router.delete('/comments/:id', async (req, res) => {
  const userId = me(req).id;
  const id = parse(zId, req.params.id);
  const [row] = await db
    .select({ comment: s.comments, post: s.posts })
    .from(s.comments)
    .innerJoin(s.posts, eq(s.posts.id, s.comments.postId))
    .where(and(eq(s.comments.id, id), isNull(s.comments.deletedAt)))
    .limit(1);
  if (!row || !(await canSeeContent(postItem(row.post), userId))) throw notFound('comment_not_found');
  if (row.comment.authorId !== userId && (await isBlockedEitherWay(row.comment.authorId, userId))) throw notFound('comment_not_found');
  const allowed =
    row.comment.authorId === userId || (row.post.groupId && isGroupLead(await getMembership(row.post.groupId, userId)));
  if (!allowed) throw forbidden();
  await db.update(s.comments).set({ deletedAt: new Date(), deletedBy: userId }).where(eq(s.comments.id, id));
  // Hinweis „neuer Kommentar“ bei der Beitragsautorin verschwindet mit
  await db
    .delete(s.notifications)
    .where(and(eq(s.notifications.type, 'comment'), sql`${s.notifications.data}->>'commentId' = ${id}`));
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Personen                                                            */
/* ------------------------------------------------------------------ */

router.get('/users/:id', async (req, res) => {
  const viewerId = me(req).id;
  const targetId = parse(zId, req.params.id);
  const { blockedByMe } = await requireUserVisible(targetId, viewerId);
  const [row] = await db
    .select({ name: s.user.name, p: s.profile })
    .from(s.user)
    .leftJoin(s.profile, eq(s.profile.userId, s.user.id))
    .where(eq(s.user.id, targetId))
    .limit(1);
  const p = row.p;
  const displayName = p?.displayName || row.name || '';

  if (blockedByMe) {
    // Die blockierende Person sieht nur, dass sie blockiert hat (zum Aufheben)
    res.json({
      profile: {
        id: targetId,
        displayName,
        avatarUrl: null,
        city: null,
        bio: null,
        canSeeDetails: false,
        followStatus: 'none',
        followsMe: false,
        isBlocked: true,
        stats: null,
        badges: null,
        sharedGroups: [],
      },
    });
    return;
  }

  const isSelf = viewerId === targetId;
  const [outgoing, incoming] = await Promise.all([
    db
      .select({ status: s.follows.status })
      .from(s.follows)
      .where(and(eq(s.follows.followerId, viewerId), eq(s.follows.followeeId, targetId)))
      .limit(1),
    db
      .select({ status: s.follows.status })
      .from(s.follows)
      .where(and(eq(s.follows.followerId, targetId), eq(s.follows.followeeId, viewerId)))
      .limit(1),
  ]);
  const followStatus = isSelf ? 'none' : ((outgoing[0]?.status as 'pending' | 'accepted' | undefined) ?? 'none');
  const visibility = p?.profileVisibility ?? 'private';
  const canSeeDetails =
    isSelf || visibility === 'public' || (visibility === 'followers' && followStatus === 'accepted');

  const sharedGroups = isSelf
    ? []
    : await (async () => {
        const mine = await db
          .select({ groupId: s.groupMembers.groupId })
          .from(s.groupMembers)
          .where(and(eq(s.groupMembers.userId, viewerId), eq(s.groupMembers.status, 'active')));
        if (!mine.length) return [];
        return db
          .select({ id: s.groups.id, name: s.groups.name })
          .from(s.groupMembers)
          .innerJoin(s.groups, eq(s.groups.id, s.groupMembers.groupId))
          .where(
            and(
              eq(s.groupMembers.userId, targetId),
              eq(s.groupMembers.status, 'active'),
              inArray(
                s.groupMembers.groupId,
                mine.map((m) => m.groupId),
              ),
            ),
          )
          .orderBy(asc(s.groups.name));
      })();

  let stats: { walks: number; km: number } | null = null;
  let badges: unknown[] | null = null;
  if (canSeeDetails) {
    const [[st], badgeRows] = await Promise.all([
      db
        .select({ walks: count(), km: sum(s.activities.distanceKm) })
        .from(s.activities)
        .where(eq(s.activities.userId, targetId)),
      db.select().from(s.userBadges).where(eq(s.userBadges.userId, targetId)).orderBy(desc(s.userBadges.awardedAt)),
    ]);
    stats = { walks: Number(st?.walks ?? 0), km: Math.round(Number(st?.km ?? 0) * 10) / 10 };
    badges = badgeRows.map((b) => {
      const def = badgeDefinition(b.badgeKey);
      return {
        key: b.badgeKey,
        label: b.label,
        kind: def?.kind ?? 'social',
        tier: def?.tier ?? 1,
        awardedAt: b.awardedAt,
        shareUrl: isSelf && b.shareToken ? `${config.APP_URL}/abzeichen/geteilt/${b.shareToken}` : null,
      };
    });
  }

  const avatarVisible = await canSeeAvatar(viewerId, targetId);
  res.json({
    profile: {
      id: targetId,
      displayName,
      avatarUrl: avatarVisible ? avatarUrlFor(targetId, p?.avatarPath) : null,
      city: canSeeDetails ? (p?.city ?? null) : null,
      bio: canSeeDetails ? (p?.bio ?? null) : null,
      canSeeDetails,
      followStatus,
      followsMe: incoming[0]?.status === 'accepted',
      isBlocked: false,
      stats,
      badges,
      sharedGroups,
    },
  });
});

/* Folgen ------------------------------------------------------------- */

router.post('/users/:id/follow', async (req, res) => {
  const viewerId = me(req).id;
  const targetId = parse(zId, req.params.id);
  if (targetId === viewerId) throw badRequest('cannot_follow_self');
  const { blockedByMe } = await requireUserVisible(targetId, viewerId);
  if (blockedByMe) throw conflict('blocked');
  const inserted = await db
    .insert(s.follows)
    .values({ followerId: viewerId, followeeId: targetId, status: 'pending' })
    .onConflictDoNothing()
    .returning();
  if (inserted.length) await notify(targetId, 'follow_request', { actorId: viewerId });
  const [f] = await db
    .select({ status: s.follows.status })
    .from(s.follows)
    .where(and(eq(s.follows.followerId, viewerId), eq(s.follows.followeeId, targetId)))
    .limit(1);
  res.json({ followStatus: f?.status ?? 'pending' });
});

router.delete('/users/:id/follow', async (req, res) => {
  const viewerId = me(req).id;
  const targetId = parse(zId, req.params.id);
  await db.delete(s.follows).where(and(eq(s.follows.followerId, viewerId), eq(s.follows.followeeId, targetId)));
  // offene Anfrage zurückgezogen → Hinweis bei der anderen Person entfernen
  await db
    .delete(s.notifications)
    .where(
      and(
        eq(s.notifications.userId, targetId),
        eq(s.notifications.type, 'follow_request'),
        sql`${s.notifications.data}->>'actorId' = ${viewerId}`,
      ),
    );
  res.json({ ok: true, followStatus: 'none' });
});

router.get('/follows', async (req, res) => {
  const userId = me(req).id;
  const rows = await db
    .select()
    .from(s.follows)
    .where(or(eq(s.follows.followerId, userId), eq(s.follows.followeeId, userId)))
    .orderBy(desc(s.follows.createdAt));
  const following = rows.filter((r) => r.followerId === userId && r.status === 'accepted').map((r) => r.followeeId);
  const sent = rows.filter((r) => r.followerId === userId && r.status === 'pending').map((r) => r.followeeId);
  const followers = rows.filter((r) => r.followeeId === userId && r.status === 'accepted').map((r) => r.followerId);
  const requests = rows.filter((r) => r.followeeId === userId && r.status === 'pending').map((r) => r.followerId);
  const people = await personRefs([...following, ...sent, ...followers, ...requests], userId);
  res.json({
    following: toList(people, following),
    followers: toList(people, followers),
    requests: toList(people, requests),
    sentRequests: toList(people, sent),
  });
});

router.post('/follows/requests/:userId/accept', async (req, res) => {
  const userId = me(req).id;
  const fromId = parse(zId, req.params.userId);
  const [f] = await db
    .select()
    .from(s.follows)
    .where(and(eq(s.follows.followerId, fromId), eq(s.follows.followeeId, userId)))
    .limit(1);
  if (!f) throw notFound('user_not_found');
  if (f.status !== 'accepted') {
    await db
      .update(s.follows)
      .set({ status: 'accepted' })
      .where(and(eq(s.follows.followerId, fromId), eq(s.follows.followeeId, userId)));
    await notify(fromId, 'follow_accepted', { actorId: userId });
  }
  res.json({ ok: true });
});

/** Ablehnen: die anfragende Person wird nicht benachrichtigt. */
router.post('/follows/requests/:userId/decline', async (req, res) => {
  const userId = me(req).id;
  const fromId = parse(zId, req.params.userId);
  await db
    .delete(s.follows)
    .where(and(eq(s.follows.followerId, fromId), eq(s.follows.followeeId, userId), eq(s.follows.status, 'pending')));
  res.json({ ok: true });
});

router.delete('/follows/followers/:userId', async (req, res) => {
  const userId = me(req).id;
  const fromId = parse(zId, req.params.userId);
  await db.delete(s.follows).where(and(eq(s.follows.followerId, fromId), eq(s.follows.followeeId, userId)));
  res.json({ ok: true });
});

/* Blockieren --------------------------------------------------------- */

router.post('/users/:id/block', async (req, res) => {
  const userId = me(req).id;
  const targetId = parse(zId, req.params.id);
  if (targetId === userId) throw badRequest('invalid_input', [{ field: 'id', code: 'self', message: 'id' }]);
  const [u] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.id, targetId)).limit(1);
  if (!u) throw notFound('user_not_found');
  await db.transaction(async (tx) => {
    await tx.insert(s.blocks).values({ blockerId: userId, blockedId: targetId }).onConflictDoNothing();
    await tx
      .delete(s.follows)
      .where(
        or(
          and(eq(s.follows.followerId, userId), eq(s.follows.followeeId, targetId)),
          and(eq(s.follows.followerId, targetId), eq(s.follows.followeeId, userId)),
        ),
      );
  });
  res.json({ ok: true });
});

router.delete('/users/:id/block', async (req, res) => {
  const userId = me(req).id;
  const targetId = parse(zId, req.params.id);
  await db.delete(s.blocks).where(and(eq(s.blocks.blockerId, userId), eq(s.blocks.blockedId, targetId)));
  res.json({ ok: true });
});

router.get('/blocks', async (req, res) => {
  const userId = me(req).id;
  const rows = await db
    .select({ id: s.blocks.blockedId })
    .from(s.blocks)
    .where(eq(s.blocks.blockerId, userId))
    .orderBy(desc(s.blocks.createdAt));
  const ids = rows.map((r) => r.id);
  // Profilbilder blockierter Personen werden nicht gezeigt
  const people = await personRefs(ids, userId);
  res.json({ blocked: toList(people, ids) });
});

/* Melden ------------------------------------------------------------- */

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: zId,
  reason: z.string().trim().min(1).max(1000),
});

const reportTargets = {
  user: { table: s.user, id: s.user.id, code: 'user_not_found' },
  post: { table: s.posts, id: s.posts.id, code: 'post_not_found' },
  comment: { table: s.comments, id: s.comments.id, code: 'comment_not_found' },
  group: { table: s.groups, id: s.groups.id, code: 'group_not_found' },
  photo: { table: s.photos, id: s.photos.id, code: 'photo_not_found' },
  walk: { table: s.walks, id: s.walks.id, code: 'walk_not_found' },
} as const;

router.post('/reports', async (req, res) => {
  const userId = me(req).id;
  const body = parse(reportSchema, req.body);
  const t = reportTargets[body.targetType];
  const [found] = await db.select({ id: t.id }).from(t.table).where(eq(t.id, body.targetId)).limit(1);
  if (!found) throw notFound(t.code);
  await db
    .insert(s.reports)
    .values({ reporterId: userId, targetType: body.targetType, targetId: body.targetId, reason: body.reason })
    .onConflictDoNothing();
  res.json({ ok: true });
});
