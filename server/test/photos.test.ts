import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createGroup } from './fixtures/groups.js';
import { signUp } from './helpers.js';

const api = '/api/v1';

/** JPEG mit EXIF-Daten inkl. GPS-Position (wie vom Smartphone). */
async function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestKamera', Model: 'Handy 3000' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 18/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '9/1 29/1 0/1' },
    })
    .toBuffer();
}

/** supertest liefert Binärdaten als Buffer */
const binary = (res: { on: (e: string, cb: (c?: Buffer) => void) => void }, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c) => chunks.push(c!));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Fotos', () => {
  it('entfernt EXIF/GPS, zeigt Gruppenfotos nur Mitgliedern und setzt sichere Header', async () => {
    const owner = await signUp({ name: 'Paula' });
    const member = await signUp({ name: 'Rita' });
    const stranger = await signUp({ name: 'Sabine' });
    const g = await createGroup([{ userId: owner.userId, role: 'founder' }, { userId: member.userId }]);

    const original = await jpegWithGps();
    const meta0 = await sharp(original).metadata();
    expect(meta0.exif).toBeTruthy(); // Testbild hat wirklich EXIF
    expect(meta0.exif!.toString('latin1')).toContain('TestKamera');

    const up = await owner.agent
      .post(`${api}/photos`)
      .field('altText', 'Blick über die Fulda')
      .field('groupId', g.id)
      .attach('photo', original, { filename: 'bild.jpg', contentType: 'image/jpeg' })
      .expect(201);
    const photo = up.body.photo;
    expect(photo).toMatchObject({ visibility: 'group', altText: 'Blick über die Fulda', width: 64, height: 48 });
    expect(photo.url).toBe(`/api/v1/photos/${photo.id}`);

    const got = await member.agent.get(`${api}/photos/${photo.id}`).buffer(true).parse(binary).expect(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect(got.headers['cache-control']).toBe('private, max-age=3600');
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    const meta = await sharp(got.body as Buffer).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
    expect((got.body as Buffer).toString('latin1')).not.toContain('TestKamera');

    const denied = await stranger.agent.get(`${api}/photos/${photo.id}`).expect(404);
    expect(denied.body.error.code).toBe('photo_not_found');

    // Sichtbarkeit ändern (nur Eigentümerin)
    await member.agent.patch(`${api}/photos/${photo.id}`).send({ visibility: 'public' }).expect(403);
    const patched = await owner.agent.patch(`${api}/photos/${photo.id}`).send({ visibility: 'public' }).expect(200);
    expect(patched.body.photo.visibility).toBe('public');
    await stranger.agent.get(`${api}/photos/${photo.id}`).expect(200);

    // Löschen: fremd nein, Gruppenleitung ja (bei Mitglieder-Foto)
    const up2 = await member.agent
      .post(`${api}/photos`)
      .field('groupId', g.id)
      .attach('photo', original, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .expect(201);
    await stranger.agent.delete(`${api}/photos/${up2.body.photo.id}`).expect(404);
    await owner.agent.delete(`${api}/photos/${up2.body.photo.id}`).expect(200);
    await member.agent.get(`${api}/photos/${up2.body.photo.id}`).expect(404);
  });

  it('lehnt falsche Dateitypen und kaputte Bilder ab', async () => {
    const u = await signUp({ name: 'Tina' });
    const wrongType = await u.agent
      .post(`${api}/photos`)
      .attach('photo', Buffer.from('%PDF-1.4 hallo'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(400);
    expect(wrongType.body.error.code).toBe('invalid_image');
    const fake = await u.agent
      .post(`${api}/photos`)
      .attach('photo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), { filename: 'x.jpg', contentType: 'image/jpeg' })
      .expect(400);
    expect(fake.body.error.code).toBe('invalid_image');
    const big = await u.agent
      .post(`${api}/photos`)
      .attach('photo', Buffer.alloc(10 * 1024 * 1024 + 10, 1), { filename: 'gross.jpg', contentType: 'image/jpeg' });
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('file_too_large');
    const none = await u.agent.post(`${api}/photos`).field('altText', 'ohne Bild').expect(400);
    expect(none.body.error.code).toBe('invalid_input');
    const g = await createGroup([]);
    const notMember = await u.agent
      .post(`${api}/photos`)
      .field('groupId', g.id)
      .attach('photo', await jpegWithGps(), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(403);
    expect(notMember.body.error.code).toBe('not_group_member');
  });

  it('Fotos im Beitrag: hochladen, anhängen und im Feed mit Sichtbarkeit ausliefern', async () => {
    const a = await signUp({ name: 'Ulla' });
    const b = await signUp({ name: 'Vera' });
    const g = await createGroup([{ userId: a.userId }, { userId: b.userId }]);
    const up = await a.agent
      .post(`${api}/photos`)
      .attach('photo', await jpegWithGps(), { filename: 'a.png', contentType: 'image/jpeg' })
      .expect(201);
    const post = await a.agent
      .post(`${api}/posts`)
      .send({ text: 'Mit Bild', groupId: g.id, photoIds: [up.body.photo.id] })
      .expect(201);
    expect(post.body.post.photos.map((p: { id: string }) => p.id)).toEqual([up.body.photo.id]);
    const feed = await b.agent.get(`${api}/feed?groupId=${g.id}`).expect(200);
    expect(feed.body.posts[0].photos[0]).toMatchObject({ id: up.body.photo.id, visibility: 'group' });
    await b.agent.get(`${api}/photos/${up.body.photo.id}`).expect(200);
    // zweites Foto direkt zum Beitrag
    const up2 = await a.agent
      .post(`${api}/photos`)
      .field('postId', post.body.post.id)
      .field('visibility', 'private')
      .attach('photo', await jpegWithGps(), { filename: 'b.jpg', contentType: 'image/jpeg' })
      .expect(201);
    const feed2 = await b.agent.get(`${api}/feed?groupId=${g.id}`).expect(200);
    expect(feed2.body.posts[0].photos).toHaveLength(1); // privates Foto nicht für Vera
    const own = await a.agent.get(`${api}/feed?groupId=${g.id}`).expect(200);
    expect(own.body.posts[0].photos.map((p: { id: string }) => p.id)).toEqual([up.body.photo.id, up2.body.photo.id]);
    // fremder Beitrag
    await b.agent
      .post(`${api}/photos`)
      .field('postId', post.body.post.id)
      .attach('photo', await jpegWithGps(), { filename: 'c.jpg', contentType: 'image/jpeg' })
      .expect(404);
  });

  it('Profilbild nur für Berechtigte', async () => {
    const owner = await signUp({ name: 'Wilma' });
    const mate = await signUp({ name: 'Xenia' });
    const stranger = await signUp({ name: 'Yvonne' });
    await createGroup([{ userId: owner.userId }, { userId: mate.userId }]);
    const up = await owner.agent
      .post(`${api}/photos/avatar`)
      .attach('photo', await jpegWithGps(), { filename: 'me.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(up.body.avatarUrl).toMatch(new RegExp(`^/api/v1/photos/avatar/${owner.userId}\\?v=`));

    await owner.agent.get(`${api}/photos/avatar/${owner.userId}`).expect(200);
    const ok = await mate.agent.get(`${api}/photos/avatar/${owner.userId}`).buffer(true).parse(binary).expect(200);
    expect((await sharp(ok.body as Buffer).metadata()).exif).toBeUndefined();
    await stranger.agent.get(`${api}/photos/avatar/${owner.userId}`).expect(404);

    // PersonRef: avatarUrl nur, wenn sichtbar
    const strangerView = await stranger.agent.get(`${api}/users/${owner.userId}`).expect(200);
    expect(strangerView.body.profile.avatarUrl).toBeNull();
    const mateView = await mate.agent.get(`${api}/users/${owner.userId}`).expect(200);
    expect(mateView.body.profile.avatarUrl).toBe(up.body.avatarUrl);

    await owner.agent.patch(`${api}/me/settings`).send({ profileVisibility: 'public' }).expect(200);
    await stranger.agent.get(`${api}/photos/avatar/${owner.userId}`).expect(200);

    await owner.agent.delete(`${api}/photos/avatar`).expect(200);
    await owner.agent.get(`${api}/photos/avatar/${owner.userId}`).expect(404);
  });
});
