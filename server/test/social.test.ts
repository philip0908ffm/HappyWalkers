import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { createGroup } from './fixtures/groups.js';
import { signUp } from './helpers.js';

const api = '/api/v1';

/** Zwei Personen werden bestätigte Kontakte (a folgt b). */
async function follow(a: Awaited<ReturnType<typeof signUp>>, b: Awaited<ReturnType<typeof signUp>>) {
  await a.agent.post(`${api}/users/${b.userId}/follow`).expect(200);
  await b.agent.post(`${api}/follows/requests/${a.userId}/accept`).expect(200);
}

describe('Beiträge und Feed', () => {
  it('zeigt Gruppenbeiträge nur aktiven Mitgliedern und liefert Zähler', async () => {
    const anna = await signUp({ name: 'Anna' });
    const berta = await signUp({ name: 'Berta' });
    const carla = await signUp({ name: 'Carla' });
    const g = await createGroup([
      { userId: anna.userId, role: 'founder' },
      { userId: berta.userId },
      { userId: carla.userId, status: 'pending' },
    ]);

    const created = await anna.agent
      .post(`${api}/posts`)
      .send({ text: '  Schöner Walk heute!  ', visibility: 'group', groupId: g.id })
      .expect(201);
    const post = created.body.post;
    expect(post.text).toBe('Schöner Walk heute!');
    expect(post.group).toEqual({ id: g.id, name: 'Testgruppe' });
    expect(post.author).toEqual({ id: anna.userId, displayName: 'Anna', avatarUrl: null });
    expect(post.canDelete).toBe(true);

    // Berta (Mitglied) sieht ihn im Standard-Feed und im Gruppen-Feed
    const feed = await berta.agent.get(`${api}/feed`).expect(200);
    expect(feed.body.posts.map((p: { id: string }) => p.id)).toContain(post.id);
    const gfeed = await berta.agent.get(`${api}/feed?groupId=${g.id}`).expect(200);
    expect(gfeed.body.posts[0].id).toBe(post.id);
    expect(gfeed.body.posts[0].canDelete).toBe(false);

    // Carla (Anfrage offen) nicht
    const cfeed = await carla.agent.get(`${api}/feed`).expect(200);
    expect(cfeed.body.posts.map((p: { id: string }) => p.id)).not.toContain(post.id);
    const denied = await carla.agent.get(`${api}/feed?groupId=${g.id}`).expect(403);
    expect(denied.body.error.code).toBe('not_group_member');
    await carla.agent.put(`${api}/posts/${post.id}/like`).expect(404);

    // Herz idempotent
    await berta.agent.put(`${api}/posts/${post.id}/like`).expect(200);
    const like2 = await berta.agent.put(`${api}/posts/${post.id}/like`).expect(200);
    expect(like2.body).toEqual({ likeCount: 1, likedByMe: true });
    const unlike = await berta.agent.delete(`${api}/posts/${post.id}/like`).expect(200);
    expect(unlike.body).toEqual({ likeCount: 0, likedByMe: false });
    await berta.agent.delete(`${api}/posts/${post.id}/like`).expect(200);
    await berta.agent.put(`${api}/posts/${post.id}/like`).expect(200);

    await berta.agent.post(`${api}/posts/${post.id}/comments`).send({ text: 'Toll!' }).expect(201);
    const after = await anna.agent.get(`${api}/feed?groupId=${g.id}`).expect(200);
    expect(after.body.posts[0]).toMatchObject({ likeCount: 1, likedByMe: false, commentCount: 1 });

    // nur ein Hinweis, auch wenn das Herz entfernt und neu gesetzt wurde
    const likes = await db
      .select()
      .from(s.notifications)
      .where(and(eq(s.notifications.userId, anna.userId), eq(s.notifications.type, 'like')));
    expect(likes.length).toBe(1);
  });

  it('Feed: Kontakte, Sichtbarkeit privat/öffentlich, Seiten mit Cursor', async () => {
    const dora = await signUp({ name: 'Dora' });
    const emil = await signUp({ name: 'Emil', gender: 'man' });
    const fremd = await signUp({ name: 'Fremd' });
    await follow(emil, dora); // Emil folgt Dora (bestätigt)

    const pub = (await dora.agent.post(`${api}/posts`).send({ text: 'öffentlich', visibility: 'public' }).expect(201)).body.post;
    const fol = (await dora.agent.post(`${api}/posts`).send({ text: 'Kontakte', visibility: 'followers' }).expect(201)).body.post;
    const priv = (await dora.agent.post(`${api}/posts`).send({ text: 'privat', visibility: 'private' }).expect(201)).body.post;

    const emilFeed = await emil.agent.get(`${api}/feed`).expect(200);
    const ids = emilFeed.body.posts.map((p: { id: string }) => p.id);
    expect(ids).toEqual(expect.arrayContaining([pub.id, fol.id]));
    expect(ids).not.toContain(priv.id);

    // Fremde Person: Standard-Feed leer, im Personen-Feed nur Öffentliches
    const fremdFeed = await fremd.agent.get(`${api}/feed`).expect(200);
    expect(fremdFeed.body.posts.map((p: { id: string }) => p.id)).not.toContain(pub.id);
    const userFeed = await fremd.agent.get(`${api}/feed?userId=${dora.userId}`).expect(200);
    expect(userFeed.body.posts.map((p: { id: string }) => p.id)).toEqual([pub.id]);

    // eigene Beiträge inkl. privat, Cursor-Seiten
    const p1 = await dora.agent.get(`${api}/feed?limit=2`).expect(200);
    expect(p1.body.posts.map((p: { id: string }) => p.id)).toEqual([priv.id, fol.id]);
    expect(p1.body.nextCursor).toBeTruthy();
    const p2 = await dora.agent.get(`${api}/feed?limit=2&cursor=${p1.body.nextCursor}`).expect(200);
    expect(p2.body.posts.map((p: { id: string }) => p.id)).toEqual([pub.id]);
    expect(p2.body.nextCursor).toBeNull();
  });

  it('Beitrag mit Aktivität nur für eigene Aktivität; Walk-Feed', async () => {
    const ella = await signUp({ name: 'Ella' });
    const other = await signUp({ name: 'Other' });
    const [act] = await db
      .insert(s.activities)
      .values({ userId: ella.userId, startedAt: new Date(), durationMinutes: 60, distanceKm: 5.5, route: [[9.4, 51.3], [9.5, 51.31]], visibility: 'public' })
      .returning();
    const res = await other.agent.post(`${api}/posts`).send({ text: 'x', visibility: 'public', activityId: act.id }).expect(404);
    expect(res.body.error.code).toBe('activity_not_found');
    const ok = await ella.agent.post(`${api}/posts`).send({ text: '', visibility: 'public', activityId: act.id }).expect(201);
    expect(ok.body.post.activity).toMatchObject({ id: act.id, distanceKm: 5.5, durationMinutes: 60 });
    expect(ok.body.post.activity.route).toHaveLength(2);

    await ella.agent.post(`${api}/posts`).send({ text: '   ', visibility: 'public' }).expect(400);

    const [walk] = await db
      .insert(s.walks)
      .values({ kind: 'distance', title: 'Gemeinsam auf Distanz', startsAt: new Date(), createdBy: ella.userId })
      .returning();
    const wp = await ella.agent.post(`${api}/posts`).send({ text: 'Bin dabei', visibility: 'public', walkId: walk.id }).expect(201);
    expect(wp.body.post.walk).toMatchObject({ id: walk.id, title: 'Gemeinsam auf Distanz' });
    const wfeed = await other.agent.get(`${api}/feed?walkId=${walk.id}`).expect(200);
    expect(wfeed.body.posts.map((p: { id: string }) => p.id)).toEqual([wp.body.post.id]);
    const missing = await other.agent.get(`${api}/feed?walkId=gibtsnicht`).expect(404);
    expect(missing.body.error.code).toBe('walk_not_found');
  });

  it('Gruppenbeitrag nur für aktive Mitglieder; Löschen durch Leitung', async () => {
    const lead = await signUp({ name: 'Leitung' });
    const mem = await signUp({ name: 'Mitglied' });
    const out = await signUp({ name: 'Außen' });
    const g = await createGroup([{ userId: lead.userId, role: 'moderator' }, { userId: mem.userId }]);
    const denied = await out.agent.post(`${api}/posts`).send({ text: 'Hallo', visibility: 'group', groupId: g.id }).expect(403);
    expect(denied.body.error.code).toBe('not_group_member');
    const post = (await mem.agent.post(`${api}/posts`).send({ text: 'Hallo', visibility: 'group', groupId: g.id }).expect(201)).body
      .post;
    const leadView = await lead.agent.get(`${api}/feed?groupId=${g.id}`).expect(200);
    expect(leadView.body.posts[0].canDelete).toBe(true);
    await lead.agent.delete(`${api}/posts/${post.id}`).expect(200);
    await mem.agent.delete(`${api}/posts/${post.id}`).expect(404);
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, mem.userId));
    expect(notes).toHaveLength(0);
  });
});

describe('Kommentare', () => {
  it('Gruppenleitung löscht Kommentar ohne Benachrichtigung', async () => {
    const lead = await signUp({ name: 'Gründerin' });
    const autorin = await signUp({ name: 'Autorin' });
    const kommentator = await signUp({ name: 'Kommentator', gender: 'man' });
    const g = await createGroup([
      { userId: lead.userId, role: 'founder' },
      { userId: autorin.userId },
      { userId: kommentator.userId },
    ]);
    const post = (await autorin.agent.post(`${api}/posts`).send({ text: 'Bilder vom Walk', groupId: g.id }).expect(201)).body.post;
    expect(post.visibility).toBe('group');

    const tooLong = await kommentator.agent.post(`${api}/posts/${post.id}/comments`).send({ text: 'x'.repeat(1001) }).expect(400);
    expect(tooLong.body.error.code).toBe('invalid_input');
    await kommentator.agent.post(`${api}/posts/${post.id}/comments`).send({ text: '   ' }).expect(400);

    const c = (
      await kommentator.agent.post(`${api}/posts/${post.id}/comments`).send({ text: '  <b>Unpassend</b>  ' }).expect(201)
    ).body.comment;
    expect(c.text).toBe('<b>Unpassend</b>'); // reiner Text, die Oberfläche stellt ihn nicht als HTML dar
    const notesAutorin = await db.select().from(s.notifications).where(eq(s.notifications.userId, autorin.userId));
    expect(notesAutorin.map((n) => n.type)).toEqual(['comment']);

    // Autorin des Beitrags (keine Leitung) darf fremden Kommentar nicht löschen
    await autorin.agent.delete(`${api}/comments/${c.id}`).expect(403);

    const list = await lead.agent.get(`${api}/posts/${post.id}/comments`).expect(200);
    expect(list.body.comments[0]).toMatchObject({ id: c.id, canDelete: true, author: { displayName: 'Kommentator' } });

    await lead.agent.delete(`${api}/comments/${c.id}`).expect(200);
    const gone = await kommentator.agent.get(`${api}/posts/${post.id}/comments`).expect(200);
    expect(gone.body.comments).toHaveLength(0);
    // Kommentator wird nicht benachrichtigt; Hinweis bei der Autorin verschwindet
    expect(await db.select().from(s.notifications).where(eq(s.notifications.userId, kommentator.userId))).toHaveLength(0);
    expect(await db.select().from(s.notifications).where(eq(s.notifications.userId, autorin.userId))).toHaveLength(0);
    const again = await lead.agent.delete(`${api}/comments/${c.id}`).expect(404);
    expect(again.body.error.code).toBe('comment_not_found');
  });
});

describe('Personen, Folgen, Blockieren', () => {
  it('Folgen braucht Bestätigung und ist idempotent', async () => {
    const a = await signUp({ name: 'Anke' });
    const b = await signUp({ name: 'Bodo', gender: 'man' });
    const self = await a.agent.post(`${api}/users/${a.userId}/follow`).expect(400);
    expect(self.body.error.code).toBe('cannot_follow_self');

    const r1 = await a.agent.post(`${api}/users/${b.userId}/follow`).expect(200);
    expect(r1.body.followStatus).toBe('pending');
    const r2 = await a.agent.post(`${api}/users/${b.userId}/follow`).expect(200);
    expect(r2.body.followStatus).toBe('pending');

    const bf = await b.agent.get(`${api}/follows`).expect(200);
    expect(bf.body.requests.map((p: { id: string }) => p.id)).toEqual([a.userId]);
    expect(bf.body.followers).toHaveLength(0);
    const reqNotes = await db.select().from(s.notifications).where(eq(s.notifications.userId, b.userId));
    expect(reqNotes.map((n) => n.type)).toEqual(['follow_request']);

    let prof = await a.agent.get(`${api}/users/${b.userId}`).expect(200);
    expect(prof.body.profile.followStatus).toBe('pending');

    await b.agent.post(`${api}/follows/requests/${a.userId}/accept`).expect(200);
    await b.agent.post(`${api}/follows/requests/${a.userId}/accept`).expect(200);
    prof = await a.agent.get(`${api}/users/${b.userId}`).expect(200);
    expect(prof.body.profile.followStatus).toBe('accepted');
    const back = await b.agent.get(`${api}/users/${a.userId}`).expect(200);
    expect(back.body.profile.followsMe).toBe(true);
    const af = await a.agent.get(`${api}/follows`).expect(200);
    expect(af.body.following.map((p: { id: string }) => p.id)).toEqual([b.userId]);

    // Kontakt entfernen
    await b.agent.delete(`${api}/follows/followers/${a.userId}`).expect(200);
    prof = await a.agent.get(`${api}/users/${b.userId}`).expect(200);
    expect(prof.body.profile.followStatus).toBe('none');

    // Ablehnen
    await a.agent.post(`${api}/users/${b.userId}/follow`).expect(200);
    await b.agent.post(`${api}/follows/requests/${a.userId}/decline`).expect(200);
    prof = await a.agent.get(`${api}/users/${b.userId}`).expect(200);
    expect(prof.body.profile.followStatus).toBe('none');
  });

  it('privates Profil zeigt keine Details; Geburtsjahr, Geschlecht, E-Mail nie', async () => {
    const owner = await signUp({ name: 'Gisela' });
    await owner.agent.patch(`${api}/me/profile`).send({ birthYear: 1958, bio: 'Ich gehe gern' }).expect(200);
    const viewer = await signUp({ name: 'Hanna' });

    const res = await viewer.agent.get(`${api}/users/${owner.userId}`).expect(200);
    const p = res.body.profile;
    expect(p).toMatchObject({ id: owner.userId, displayName: 'Gisela', canSeeDetails: false, city: null, bio: null, stats: null, badges: null });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('1958');
    expect(raw).not.toMatch(/birthYear|gender|email|phone|woman/);
    expect(raw).not.toContain(owner.email);

    // followers: Details nur für bestätigte Kontakte
    await owner.agent.patch(`${api}/me/settings`).send({ profileVisibility: 'followers' }).expect(200);
    expect((await viewer.agent.get(`${api}/users/${owner.userId}`)).body.profile.canSeeDetails).toBe(false);
    await follow(viewer, owner);
    const det = await viewer.agent.get(`${api}/users/${owner.userId}`).expect(200);
    expect(det.body.profile).toMatchObject({ canSeeDetails: true, city: 'Kassel', bio: 'Ich gehe gern', stats: { walks: 0, km: 0 }, badges: [] });
    expect(JSON.stringify(det.body)).not.toMatch(/1958|birthYear|gender|email/);

    // public: für alle Angemeldeten
    const third = await signUp({ name: 'Ingrid' });
    await owner.agent.patch(`${api}/me/settings`).send({ profileVisibility: 'public' }).expect(200);
    expect((await third.agent.get(`${api}/users/${owner.userId}`)).body.profile.canSeeDetails).toBe(true);

    // gemeinsame Gruppen werden immer gezeigt
    await owner.agent.patch(`${api}/me/settings`).send({ profileVisibility: 'private' }).expect(200);
    const g = await createGroup([{ userId: owner.userId }, { userId: third.userId }], { name: 'Nordstadt' });
    const shared = await third.agent.get(`${api}/users/${owner.userId}`).expect(200);
    expect(shared.body.profile.sharedGroups).toEqual([{ id: g.id, name: 'Nordstadt' }]);
    expect(shared.body.profile.canSeeDetails).toBe(false);

    const missing = await third.agent.get(`${api}/users/gibtsnicht`).expect(404);
    expect(missing.body.error.code).toBe('user_not_found');
  });

  it('Blockieren entfernt Folgen und versteckt Inhalte beidseitig', async () => {
    const a = await signUp({ name: 'Jutta' });
    const b = await signUp({ name: 'Kurt', gender: 'man' });
    const g = await createGroup([{ userId: a.userId }, { userId: b.userId }]);
    await follow(a, b);
    await follow(b, a);
    const pa = (await a.agent.post(`${api}/posts`).send({ text: 'von A', visibility: 'group', groupId: g.id }).expect(201)).body.post;
    const pb = (await b.agent.post(`${api}/posts`).send({ text: 'von B', visibility: 'public' }).expect(201)).body.post;
    const ca = (await a.agent.post(`${api}/posts/${pb.id}/comments`).send({ text: 'Kommentar von A' }).expect(201)).body.comment;

    await a.agent.post(`${api}/users/${b.userId}/block`).expect(200);
    await a.agent.post(`${api}/users/${b.userId}/block`).expect(200); // idempotent
    expect(await db.select().from(s.follows).where(eq(s.follows.followerId, a.userId))).toHaveLength(0);
    expect(await db.select().from(s.follows).where(eq(s.follows.followerId, b.userId))).toHaveLength(0);

    // B sieht A nicht mehr: Profil 404, Beiträge weg, Kommentare weg
    const prof = await b.agent.get(`${api}/users/${a.userId}`).expect(404);
    expect(prof.body.error.code).toBe('user_not_found');
    const bFeed = await b.agent.get(`${api}/feed?groupId=${g.id}`).expect(200);
    expect(bFeed.body.posts.map((p: { id: string }) => p.id)).not.toContain(pa.id);
    await b.agent.put(`${api}/posts/${pa.id}/like`).expect(404);
    const bComments = await b.agent.get(`${api}/posts/${pb.id}/comments`).expect(200);
    expect(bComments.body.comments.map((c: { id: string }) => c.id)).not.toContain(ca.id);
    const bOwn = await b.agent.get(`${api}/feed`).expect(200);
    expect(bOwn.body.posts.find((p: { id: string }) => p.id === pb.id).commentCount).toBe(0);
    const followTry = await b.agent.post(`${api}/users/${a.userId}/follow`).expect(404);
    expect(followTry.body.error.code).toBe('user_not_found');

    // A sieht B auch nicht mehr
    const aFeed = await a.agent.get(`${api}/feed?userId=${b.userId}`).expect(404);
    expect(aFeed.body.error.code).toBe('user_not_found');
    await a.agent.get(`${api}/posts/${pb.id}/comments`).expect(404);
    const aProf = await a.agent.get(`${api}/users/${b.userId}`).expect(200);
    expect(aProf.body.profile).toMatchObject({ isBlocked: true, canSeeDetails: false });
    const blocked = await a.agent.get(`${api}/blocks`).expect(200);
    expect(blocked.body.blocked.map((p: { id: string }) => p.id)).toEqual([b.userId]);
    const fb = await a.agent.post(`${api}/users/${b.userId}/follow`).expect(409);
    expect(fb.body.error.code).toBe('blocked');

    // Aufheben
    await a.agent.delete(`${api}/users/${b.userId}/block`).expect(200);
    await b.agent.get(`${api}/users/${a.userId}`).expect(200);
    const again = await b.agent.get(`${api}/feed?groupId=${g.id}`).expect(200);
    expect(again.body.posts.map((p: { id: string }) => p.id)).toContain(pa.id);
  });
});

describe('Melden', () => {
  it('meldet alle Inhaltstypen, idempotent', async () => {
    const a = await signUp({ name: 'Lotte' });
    const b = await signUp({ name: 'Max', gender: 'man' });
    const post = (await b.agent.post(`${api}/posts`).send({ text: 'Werbung', visibility: 'public' }).expect(201)).body.post;
    await a.agent.post(`${api}/reports`).send({ targetType: 'post', targetId: post.id, reason: 'Werbung' }).expect(200);
    await a.agent.post(`${api}/reports`).send({ targetType: 'post', targetId: post.id, reason: 'Werbung' }).expect(200);
    await a.agent.post(`${api}/reports`).send({ targetType: 'user', targetId: b.userId, reason: 'belästigend' }).expect(200);
    const nf = await a.agent.post(`${api}/reports`).send({ targetType: 'photo', targetId: 'x', reason: 'x' }).expect(404);
    expect(nf.body.error.code).toBe('photo_not_found');
    await a.agent.post(`${api}/reports`).send({ targetType: 'unbekannt', targetId: 'x', reason: 'x' }).expect(400);
    const rows = await db.select().from(s.reports).where(eq(s.reports.reporterId, a.userId));
    expect(rows).toHaveLength(2);
  });
});
