import { BADGES, REGION_BADGE_PREFIX, badgeDefinition, badgeNameFor } from '@gehmeinsam/shared';
import { and, asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { profile, userBadges } from '../db/schema.js';
import { notFound, parse } from '../lib/http.js';
import { me, requireUser } from '../middleware/auth.js';
import { badgeProgress, totalPoints, userStats } from '../services/gamification.js';

/** Modul „badges“ – Abzeichen-Vitrine, Urkunde, Teilen (Paket B, siehe docs/API.md). */
export const router = Router();

/** Name für Urkunde und Teil-Bild – dieselben Namen wie in der Oberfläche (shared/src/badge-names.ts). */
export function badgeName(key: string, label: string | null): string {
  return badgeNameFor(key, label, 'de');
}

const TIER_COLORS: Record<number, { fill: string; dark: string; name: string }> = {
  1: { fill: '#C07A3E', dark: '#7A4A20', name: 'Bronze' },
  2: { fill: '#8E9AA6', dark: '#4F5A64', name: 'Silber' },
  3: { fill: '#C9A227', dark: '#7D6310', name: 'Gold' },
};

const dateFmt = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'long', year: 'numeric' });
export const formatDateDe = (d: Date) => dateFmt.format(d);

export const shareUrlFor = (token: string | null) => (token ? `${config.APP_URL}/abzeichen/geteilt/${token}` : null);

/** Text sicher in SVG einsetzen. */
export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

export async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

type BadgeRow = typeof userBadges.$inferSelect;

export function toBadgeEarned(b: BadgeRow) {
  const def = badgeDefinition(b.badgeKey);
  return {
    key: b.badgeKey,
    label: b.label,
    kind: def?.kind ?? 'social',
    tier: def?.tier ?? 1,
    awardedAt: b.awardedAt.toISOString(),
    shareUrl: shareUrlFor(b.shareToken),
  };
}

async function displayNameOf(userId: string) {
  const [p] = await db.select({ n: profile.displayName }).from(profile).where(eq(profile.userId, userId)).limit(1);
  return p?.n ?? '';
}

const zKey = z.string().min(1).max(200);

async function loadOwnBadge(userId: string, key: string): Promise<BadgeRow> {
  const [b] = await db
    .select()
    .from(userBadges)
    .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeKey, key)))
    .limit(1);
  if (!b) throw notFound('badge_not_found');
  return b;
}

async function loadShared(token: string): Promise<BadgeRow> {
  const t = parse(z.string().min(16).max(64), token);
  const [b] = await db.select().from(userBadges).where(eq(userBadges.shareToken, t)).limit(1);
  if (!b) throw notFound('badge_not_found');
  return b;
}

/* ------------------------------------------------------------------ */
/* Öffentlich: geteiltes Abzeichen                                     */
/* ------------------------------------------------------------------ */

router.get('/shared/:token', async (req, res) => {
  const b = await loadShared(req.params.token);
  const e = toBadgeEarned(b);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    displayName: await displayNameOf(b.userId),
    badge: { key: e.key, label: e.label, kind: e.kind, tier: e.tier, awardedAt: e.awardedAt },
  });
});

router.get('/shared/:token/image.png', async (req, res) => {
  const b = await loadShared(req.params.token);
  const png = await svgToPng(badgeShareSvg(b, await displayNameOf(b.userId)));
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.send(png);
});

/* ------------------------------------------------------------------ */
/* Vitrine                                                             */
/* ------------------------------------------------------------------ */

router.get('/', requireUser, async (req, res) => {
  const userId = me(req).id;
  const [stats, points, earnedRows] = await Promise.all([
    userStats(userId),
    totalPoints(userId),
    db.select().from(userBadges).where(eq(userBadges.userId, userId)).orderBy(asc(userBadges.awardedAt)),
  ]);
  const earnedKeys = new Set(earnedRows.map((b) => b.badgeKey));
  res.json({
    points,
    walksCount: stats.walksCount,
    totalKm: stats.totalKm,
    groupWalksCount: stats.groupWalksCount,
    earned: earnedRows.map(toBadgeEarned),
    available: BADGES.map((b) => ({
      key: b.key,
      kind: b.kind,
      tier: b.tier,
      earned: earnedKeys.has(b.key),
      progress: badgeProgress(b.key, stats),
    })),
  });
});

/* ------------------------------------------------------------------ */
/* Urkunde                                                             */
/* ------------------------------------------------------------------ */

router.get('/:key/certificate.pdf', requireUser, async (req, res) => {
  const userId = me(req).id;
  const b = await loadOwnBadge(userId, parse(zKey, req.params.key));
  const pdf = await certificatePdf(await displayNameOf(userId), badgeName(b.badgeKey, b.label), b.awardedAt);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="gehmeinsam-urkunde.pdf"');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

/* ------------------------------------------------------------------ */
/* Teilen (nur auf ausdrücklichen Wunsch)                              */
/* ------------------------------------------------------------------ */

router.post('/:key/share', requireUser, async (req, res) => {
  const userId = me(req).id;
  const b = await loadOwnBadge(userId, parse(zKey, req.params.key));
  let token = b.shareToken;
  if (!token) {
    token = randomBytes(24).toString('base64url');
    await db
      .update(userBadges)
      .set({ shareToken: token })
      .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeKey, b.badgeKey)));
  }
  res.json({ shareUrl: shareUrlFor(token) });
});

router.delete('/:key/share', requireUser, async (req, res) => {
  const userId = me(req).id;
  const b = await loadOwnBadge(userId, parse(zKey, req.params.key));
  await db
    .update(userBadges)
    .set({ shareToken: null })
    .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeKey, b.badgeKey)));
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Darstellung                                                         */
/* ------------------------------------------------------------------ */

const FONT = "'DejaVu Sans', 'Atkinson Hyperlegible', Arial, sans-serif";

/** Wappen-Form (Schild) mit Stufenfarbe. */
function shieldSvg(x: number, y: number, w: number, tier: number, symbol: string): string {
  const c = TIER_COLORS[tier] ?? TIER_COLORS[1];
  const h = w * 1.2;
  const path = `M ${x} ${y} H ${x + w} V ${y + h * 0.55} Q ${x + w} ${y + h * 0.85} ${x + w / 2} ${y + h} Q ${x} ${y + h * 0.85} ${x} ${y + h * 0.55} Z`;
  return `<path d="${path}" fill="${c.fill}" stroke="${c.dark}" stroke-width="10"/>
  <text x="${x + w / 2}" y="${y + h * 0.52}" font-family="${FONT}" font-size="${w * 0.32}" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(symbol)}</text>`;
}

function badgeSymbol(key: string): string {
  if (key.startsWith(REGION_BADGE_PREFIX)) return '★';
  const m = key.match(/(\d+)/);
  if (key.startsWith('first_') && m) return `${m[1]} km`;
  if (m) return m[1];
  return '★';
}

/** Kürzt sehr lange Texte (z. B. Landkreisnamen) für eine Bildzeile. */
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function badgeShareSvg(b: BadgeRow, displayName: string): string {
  const def = badgeDefinition(b.badgeKey);
  const name = badgeName(b.badgeKey, b.label);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#FFF8EE"/>
  <rect x="20" y="20" width="1160" height="590" fill="none" stroke="#2F5D50" stroke-width="6" rx="24"/>
  ${shieldSvg(90, 135, 300, def?.tier ?? 1, badgeSymbol(b.badgeKey))}
  <text x="460" y="190" font-family="${FONT}" font-size="40" fill="#2F5D50" font-weight="700">Gehmeinsam</text>
  <text x="460" y="300" font-family="${FONT}" font-size="${name.length <= 18 ? 64 : 40}" fill="#1F2A27" font-weight="700">${escapeXml(clip(name, 32))}</text>
  <text x="460" y="390" font-family="${FONT}" font-size="40" fill="#1F2A27">${escapeXml(clip(displayName || 'Gehmeinsam-Mitglied', 30))}</text>
  <text x="460" y="450" font-family="${FONT}" font-size="34" fill="#4A5552">erreicht am ${escapeXml(formatDateDe(b.awardedAt))}</text>
</svg>`;
}

/** Urkunde: A4 hoch, große Schrift, schlichte Umrandung, schwarz auf weiß (druckfreundlich). */
export function certificatePdf(name: string, badge: string, date: Date): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margin: 72,
      info: { Title: `Urkunde – ${badge}`, Author: 'Gehmeinsam' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { width, height } = doc.page;
    doc.lineWidth(3).rect(36, 36, width - 72, height - 72).stroke('#333333');
    doc.lineWidth(1).rect(46, 46, width - 92, height - 92).stroke('#333333');

    const w = width - 144;
    doc.fillColor('#000000');
    doc.font('Helvetica-Bold').fontSize(48).text('Urkunde', 72, 150, { width: w, align: 'center' });
    doc.font('Helvetica').fontSize(20).text('Gehmeinsam – zusammen zügig gehen', 72, 220, { width: w, align: 'center' });
    doc.fontSize(22).text('Hiermit wird bestätigt, dass', 72, 320, { width: w, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(40).text(name || 'unser Mitglied', 72, 370, { width: w, align: 'center' });
    doc.font('Helvetica').fontSize(22).text('das Abzeichen', 72, 470, { width: w, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(34).text(`„${badge}“`, 72, 515, { width: w, align: 'center' });
    doc.font('Helvetica').fontSize(22).text(`erreicht hat am ${formatDateDe(date)}.`, 72, 620, { width: w, align: 'center' });
    doc.fontSize(26).text('Herzlichen Glückwunsch!', 72, 700, { width: w, align: 'center' });
    doc.end();
  });
}
