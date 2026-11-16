import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import * as s from '../db/schema.js';
import { notFound, parse } from '../lib/http.js';
import { codeLookupLimiter } from '../lib/ratelimit.js';
import { me, requireUser } from '../middleware/auth.js';
import { awardBadge } from '../services/gamification.js';
import { groupPhotoUrl, isInviteCode, joinGroup, normalizeCode } from './groups.js';

/**
 * Modul „invites“ – Einladungslink `/einladung/<code oder token>`.
 *  - Code (z. B. WALK-4K7P9X): gilt für die ganze Gruppe, solange sie besteht.
 *  - Token (aus der E-Mail-Einladung): persönlich, 14 Tage gültig, einmal einlösbar.
 */
export const router = Router();

const zCodeOrToken = z.object({ codeOrToken: z.string().trim().min(4).max(100) });

async function resolveInvite(codeOrToken: string, viewerId: string | undefined) {
  if (isInviteCode(codeOrToken)) {
    const [g] = await db.select().from(s.groups).where(eq(s.groups.inviteCode, normalizeCode(codeOrToken))).limit(1);
    return g ? { group: g, inviterId: null as string | null, inviteId: null as string | null } : null;
  }
  const [inv] = await db.select().from(s.groupInvites).where(eq(s.groupInvites.token, codeOrToken)).limit(1);
  if (!inv || inv.expiresAt <= new Date()) return null;
  if (inv.usedBy && inv.usedBy !== viewerId) return null;
  const [g] = await db.select().from(s.groups).where(eq(s.groups.id, inv.groupId)).limit(1);
  return g ? { group: g, inviterId: inv.createdBy, inviteId: inv.id } : null;
}

/** Öffentlich: Vorschau der Einladung (ohne Treffpunkte, ohne Mitgliederliste). */
router.get('/:codeOrToken', codeLookupLimiter, async (req, res) => {
  const { codeOrToken } = parse(zCodeOrToken, req.params);
  const inv = await resolveInvite(codeOrToken, req.user?.id);
  if (!inv) {
    res.json({ valid: false, group: null });
    return;
  }
  const g = inv.group;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.groupMembers)
    .where(and(eq(s.groupMembers.groupId, g.id), eq(s.groupMembers.status, 'active')));
  res.json({
    valid: true,
    group: {
      id: g.id,
      name: g.name,
      city: g.city,
      description: g.description,
      memberCount: Number(n),
      womenOnly: g.womenOnly,
      photoUrl: groupPhotoUrl(g),
    },
  });
});

/**
 * Einladung annehmen. Umgeht „auf Anfrage“ und „nur auf Einladung“, nicht aber Sperre und
 * „nur Frauen“. Vergibt der einladenden Person das Abzeichen „inviter“. Idempotent.
 */
router.post('/:codeOrToken/accept', requireUser, codeLookupLimiter, async (req, res) => {
  const { codeOrToken } = parse(zCodeOrToken, req.params);
  const userId = me(req).id;
  const inv = await resolveInvite(codeOrToken, userId);
  if (!inv) throw notFound('invite_invalid');
  const { membership, newlyActive } = await joinGroup(inv.group, userId, { viaInvite: true, invitedBy: inv.inviterId });
  if (inv.inviteId) {
    await db
      .update(s.groupInvites)
      .set({ usedBy: userId })
      .where(and(eq(s.groupInvites.id, inv.inviteId), or(isNull(s.groupInvites.usedBy), eq(s.groupInvites.usedBy, userId))));
  }
  if (newlyActive && inv.inviterId && inv.inviterId !== userId) {
    await awardBadge(inv.inviterId, 'inviter');
  }
  res.json({ groupId: inv.group.id, membership });
});
