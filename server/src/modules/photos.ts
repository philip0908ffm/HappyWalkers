import { LIMITS, VISIBILITIES } from '@gehmeinsam/shared';
import { and, eq } from 'drizzle-orm';
import { Router, type Response } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { canSeePhoto, getMembership, isGroupLead, requireActiveMember, requireGroup } from '../lib/access.js';
import { ApiError, badRequest, forbidden, notFound, parse, zId } from '../lib/http.js';
import { avatarUrlFor, canSeeAvatar } from '../lib/people.js';
import { me, requireUser } from '../middleware/auth.js';
import { deleteStoredFiles, resolveKey, storeImage } from '../services/storage.js';
import { photoDto } from './social.js';

/**
 * Modul „photos“ (Paket C). Bilder werden IMMER neu kodiert (EXIF/GPS weg) und nur über
 * Routen mit Zugriffsprüfung ausgeliefert. Eingehängt unter `/api/v1/photos`.
 */
export const router = Router();
router.use(requireUser);

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.maxUploadBytes, files: 1, fields: 10 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES.includes(file.mimetype.toLowerCase())) cb(null, true);
    else cb(new ApiError(400, 'invalid_image'));
  },
});

function requireFile(file: Express.Multer.File | undefined): Buffer {
  if (!file?.buffer?.length) throw badRequest('invalid_input', [{ field: 'photo', code: 'required', message: 'photo' }]);
  return file.buffer;
}

/** Bild mit sicheren Headern ausliefern (nie öffentlich zwischenspeichern). */
async function sendImage(res: Response, key: string, code: string) {
  let data: Buffer;
  try {
    data = await fs.readFile(resolveKey(key));
  } catch {
    throw notFound(code);
  }
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', String(data.length));
  res.end(data);
}

/* ------------------------------------------------------------------ */
/* Profilbild (vor /:id, damit „avatar“ nicht als ID gilt)             */
/* ------------------------------------------------------------------ */

router.post('/avatar', upload.single('photo'), async (req, res) => {
  const userId = me(req).id;
  const stored = await storeImage(requireFile(req.file), { maxSize: 512, folder: 'avatars' });
  const [old] = await db.select({ path: s.profile.avatarPath }).from(s.profile).where(eq(s.profile.userId, userId)).limit(1);
  if (old) {
    await db.update(s.profile).set({ avatarPath: stored.key }).where(eq(s.profile.userId, userId));
  } else {
    await db.insert(s.profile).values({ userId, avatarPath: stored.key });
  }
  await deleteStoredFiles([old?.path]);
  res.json({ avatarUrl: avatarUrlFor(userId, stored.key) });
});

router.delete('/avatar', async (req, res) => {
  const userId = me(req).id;
  const [old] = await db.select({ path: s.profile.avatarPath }).from(s.profile).where(eq(s.profile.userId, userId)).limit(1);
  await db.update(s.profile).set({ avatarPath: null }).where(eq(s.profile.userId, userId));
  await deleteStoredFiles([old?.path]);
  res.json({ ok: true });
});

router.get('/avatar/:userId', async (req, res) => {
  const viewerId = me(req).id;
  const ownerId = parse(zId, req.params.userId);
  const [p] = await db.select({ path: s.profile.avatarPath }).from(s.profile).where(eq(s.profile.userId, ownerId)).limit(1);
  if (!p?.path || !(await canSeeAvatar(viewerId, ownerId))) throw notFound('photo_not_found');
  await sendImage(res, p.path, 'photo_not_found');
});

/* ------------------------------------------------------------------ */
/* Fotos                                                               */
/* ------------------------------------------------------------------ */

const uploadSchema = z.object({
  altText: z.string().trim().max(300).default(''),
  visibility: z.enum(VISIBILITIES).default('group'),
  postId: zId.optional(),
  groupId: zId.optional(),
});

router.post('/', upload.single('photo'), async (req, res) => {
  const userId = me(req).id;
  const body = parse(uploadSchema, {
    ...req.body,
    postId: req.body?.postId || undefined,
    groupId: req.body?.groupId || undefined,
  });
  const buffer = requireFile(req.file);
  let groupId = body.groupId ?? null;
  if (body.postId) {
    const [post] = await db
      .select({ id: s.posts.id, groupId: s.posts.groupId })
      .from(s.posts)
      .where(and(eq(s.posts.id, body.postId), eq(s.posts.authorId, userId)))
      .limit(1);
    if (!post) throw notFound('post_not_found');
    groupId ??= post.groupId;
  }
  if (groupId) {
    await requireGroup(groupId);
    await requireActiveMember(groupId, userId);
  }
  const stored = await storeImage(buffer);
  const [photo] = await db
    .insert(s.photos)
    .values({
      ownerId: userId,
      postId: body.postId ?? null,
      groupId,
      storageKey: stored.key,
      width: stored.width,
      height: stored.height,
      altText: body.altText,
      visibility: body.visibility,
    })
    .returning();
  res.status(201).json({ photo: photoDto(photo) });
});

async function requireVisiblePhoto(id: string, viewerId: string) {
  const [p] = await db.select().from(s.photos).where(eq(s.photos.id, id)).limit(1);
  if (!p || !(await canSeePhoto(p, viewerId))) {
    throw notFound('photo_not_found');
  }
  return p;
}

router.get('/:id', async (req, res) => {
  const photo = await requireVisiblePhoto(parse(zId, req.params.id), me(req).id);
  await sendImage(res, photo.storageKey, 'photo_not_found');
});

const patchSchema = z.object({
  altText: z.string().trim().max(300).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
});

router.patch('/:id', async (req, res) => {
  const userId = me(req).id;
  const body = parse(patchSchema, req.body);
  const photo = await requireVisiblePhoto(parse(zId, req.params.id), userId);
  if (photo.ownerId !== userId) throw forbidden();
  const [updated] = Object.keys(body).length
    ? await db.update(s.photos).set(body).where(eq(s.photos.id, photo.id)).returning()
    : [photo];
  res.json({ photo: photoDto(updated) });
});

router.delete('/:id', async (req, res) => {
  const userId = me(req).id;
  const photo = await requireVisiblePhoto(parse(zId, req.params.id), userId);
  const allowed = photo.ownerId === userId || (photo.groupId && isGroupLead(await getMembership(photo.groupId, userId)));
  if (!allowed) throw forbidden();
  await db.delete(s.photos).where(eq(s.photos.id, photo.id));
  await deleteStoredFiles([photo.storageKey]);
  res.json({ ok: true });
});
