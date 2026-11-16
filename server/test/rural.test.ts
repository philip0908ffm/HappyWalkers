import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/index.js';
import * as s from '../src/db/schema.js';
import { sentMails } from '../src/lib/email.js';
import { getApp, signUp, type Agent } from './helpers.js';

async function newGroup(agent: Agent, postalCode: string, over: Record<string, unknown> = {}) {
  const res = await agent.post('/api/v1/groups').send({
    name: `Dorfrunde ${postalCode}`,
    description: '',
    rules: '',
    joinPolicy: 'open',
    womenOnly: false,
    postalCode,
    defaultTempo: 'gemuetlich',
    ...over,
  });
  expect(res.status).toBe(201);
  return res.body.group;
}

const notes = async (userId: string, type: string) =>
  (await db.select().from(s.notifications).where(eq(s.notifications.userId, userId))).filter((n) => n.type === type);

describe('Ländliche Regionen', () => {
  it('erfordert Anmeldung', async () => {
    expect((await request(getApp()).get('/api/v1/rural/overview?postalCode=17509')).status).toBe(401);
  });

  it('Interesse anmelden, ansehen, abmelden', async () => {
    const p = await signUp({ postalCode: '17509' });
    expect((await p.agent.get('/api/v1/rural/interest').expect(200)).body.interest).toBeNull();
    const put = await p.agent.put('/api/v1/rural/interest').send({ postalCode: '17509', radiusKm: 30 }).expect(200);
    expect(put.body.interest).toMatchObject({ postalCode: '17509', city: 'Lubmin', radiusKm: 30 });
    const again = await p.agent.put('/api/v1/rural/interest').send({ postalCode: '17509', radiusKm: 50 }).expect(200);
    expect(again.body.interest.radiusKm).toBe(50);
    expect((await p.agent.put('/api/v1/rural/interest').send({ postalCode: '17509', radiusKm: 12 })).status).toBe(400);
    await p.agent.delete('/api/v1/rural/interest').expect(200);
    expect((await p.agent.get('/api/v1/rural/interest').expect(200)).body.interest).toBeNull();
  });

  it('Interessen-Mail, sobald in der Nähe eine Gruppe entsteht – höchstens 1 am Tag', async () => {
    const interested = await signUp({ name: 'Hannelore', postalCode: '17509' });
    await interested.agent.put('/api/v1/rural/interest').send({ postalCode: '17509', radiusKm: 15 }).expect(200);
    const quiet = await signUp({ name: 'Ohne Mail', postalCode: '17509' });
    await quiet.agent.put('/api/v1/rural/interest').send({ postalCode: '17509', radiusKm: 15 }).expect(200);
    await quiet.agent.patch('/api/v1/me/settings').send({ emailNotifications: false }).expect(200);
    const du = await signUp({ name: 'Duzi', postalCode: '17509' });
    await du.agent.put('/api/v1/rural/interest').send({ postalCode: '17509', radiusKm: 15 }).expect(200);
    await du.agent.patch('/api/v1/me/settings').send({ anrede: 'du' }).expect(200);

    const founder = await signUp({ name: 'Gründerin', postalCode: '17489' });
    const g = await newGroup(founder.agent, '17489'); // Greifswald, ~14 km entfernt
    const mails = sentMails.filter((m) => m.to === interested.email && m.subject.includes('Nähe'));
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toContain('Gehgruppe');
    expect(mails[0].text).toContain('Guten Tag Hannelore');
    expect(mails[0].text).toContain('Greifswald');
    expect(mails[0].text).toContain(`/gruppen/${g.id}`);
    expect(mails[0].text).not.toContain(founder.email);
    expect(await notes(interested.userId, 'interest_match')).toHaveLength(1);
    // E-Mail-Benachrichtigungen aus → nur in der App
    expect(sentMails.filter((m) => m.to === quiet.email && m.subject.includes('Nähe'))).toHaveLength(0);
    expect(await notes(quiet.userId, 'interest_match')).toHaveLength(1);
    // Du-Anrede
    const duMail = sentMails.find((m) => m.to === du.email && m.subject.includes('Nähe'))!;
    expect(duMail.text).toContain('Hallo Duzi');
    expect(duMail.text).toContain('deiner Nähe');

    // zweiter Eintrag am selben Tag → keine weitere Mail
    await newGroup(founder.agent, '17489', { name: 'Zweite Runde' });
    expect(sentMails.filter((m) => m.to === interested.email && m.subject.includes('Nähe'))).toHaveLength(1);
    // die Gründerin selbst bekommt nichts, auch wenn sie Interesse angemeldet hat
    expect(sentMails.filter((m) => m.to === founder.email && m.subject.includes('Nähe'))).toHaveLength(0);
  });

  it('Überblick: wenig in der Nähe → nächster Ort mit Gruppe', async () => {
    const p = await signUp({ postalCode: '17509' });
    const res = await p.agent.get('/api/v1/rural/overview?postalCode=17509&radiusKm=5').expect(200);
    expect(res.body.center.city).toBe('Lubmin');
    expect(res.body.radiusOptions).toEqual([15, 30, 50]);
    expect(res.body.groupsInRadius).toBe(0);
    expect(res.body.nearestTown).toMatchObject({ city: 'Greifswald' });
    expect(res.body.nearestTown.distanceKm).toBeGreaterThan(5);
    expect(res.body.nearestGroups.length).toBeGreaterThan(0);
    expect(res.body.nearestGroups[0].city).toBe('Greifswald');
    expect(Array.isArray(res.body.distanceWalks)).toBe(true);
    const wide = await p.agent.get('/api/v1/rural/overview?radiusKm=30').expect(200); // PLZ aus dem Profil
    expect(wide.body.groupsInRadius).toBeGreaterThan(0);
  });

  it('Gehpartner: Gesuch, Anfrage (idempotent, ohne Kontaktdaten), Annahme → 1:1-Walk', async () => {
    const anna = await signUp({ name: 'Anna', postalCode: '24937' });
    const bernd = await signUp({ name: 'Bernd', postalCode: '24943', gender: 'man' });
    const offer = await anna.agent
      .put('/api/v1/rural/partner-offer')
      .send({ postalCode: '24937', tempo: 'zuegig', availability: 'vormittags unter der Woche', note: 'Gern am Hafen', active: true })
      .expect(200);
    expect(offer.body.offer).toMatchObject({ city: 'Flensburg', tempo: 'zuegig', active: true });
    expect((await anna.agent.get('/api/v1/rural/partner-offer').expect(200)).body.offer.id).toBe(offer.body.offer.id);

    const list = await bernd.agent.get('/api/v1/rural/partners?radiusKm=15').expect(200);
    const found = list.body.offers.find((o: { id: string }) => o.id === offer.body.offer.id);
    expect(found).toMatchObject({ person: { id: anna.userId, displayName: 'Anna' }, city: 'Flensburg', isMine: false, availability: 'vormittags unter der Woche' });
    expect(Number.isInteger(found.distanceKm)).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain(anna.email);
    expect(JSON.stringify(list.body)).not.toContain('postalCode');

    // eigenes Gesuch kann man nicht anfragen
    expect((await anna.agent.post(`/api/v1/rural/partners/${offer.body.offer.id}/request`).send({ message: 'x' })).body.error.code).toBe('offer_not_found');

    const r1 = await bernd.agent.post(`/api/v1/rural/partners/${offer.body.offer.id}/request`).send({ message: 'Ich gehe auch gern zügig.' }).expect(200);
    const r2 = await bernd.agent.post(`/api/v1/rural/partners/${offer.body.offer.id}/request`).send({ message: 'Nochmal' }).expect(200);
    expect(r2.body.request.id).toBe(r1.body.request.id);
    expect(r1.body.request).toMatchObject({ from: { id: bernd.userId }, to: { id: anna.userId }, status: 'pending', walkId: null });
    expect(await notes(anna.userId, 'partner_request')).toHaveLength(1);
    const mail = sentMails.filter((m) => m.to === anna.email && m.subject.includes('Bernd'));
    expect(mail).toHaveLength(1);
    expect(mail[0].text).not.toContain(bernd.email);
    expect(mail[0].text).toContain('Ich gehe auch gern zügig.');

    const inc = await anna.agent.get('/api/v1/rural/partner-requests').expect(200);
    expect(inc.body.incoming.map((x: { id: string }) => x.id)).toContain(r1.body.request.id);
    // nur die Empfängerin darf annehmen
    expect((await bernd.agent.post(`/api/v1/rural/partner-requests/${r1.body.request.id}/accept`).send({})).status).toBe(400);
    const startsAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const acceptBody = { startsAt, meetingPointName: 'Hafenspitze', meetingAddress: 'Schiffbrücke, 24937 Flensburg', meetingDescription: 'Bei den Bänken' };
    expect((await bernd.agent.post(`/api/v1/rural/partner-requests/${r1.body.request.id}/accept`).send(acceptBody)).status).toBe(404);
    const acc = await anna.agent.post(`/api/v1/rural/partner-requests/${r1.body.request.id}/accept`).send(acceptBody).expect(200);
    const acc2 = await anna.agent.post(`/api/v1/rural/partner-requests/${r1.body.request.id}/accept`).send(acceptBody).expect(200);
    expect(acc2.body.walkId).toBe(acc.body.walkId);
    expect(await notes(bernd.userId, 'partner_accepted')).toHaveLength(1);

    const w = await bernd.agent.get(`/api/v1/walks/${acc.body.walkId}`).expect(200);
    expect(w.body.walk).toMatchObject({ kind: 'partner', participantCount: 2, myRsvp: 'yes', canSeeMeetingPoint: true });
    expect(w.body.walk.meetingPoint.address).toBe('Schiffbrücke, 24937 Flensburg');
    // Dritte sehen den 1:1-Walk nicht
    const carla = await signUp({ name: 'Carla', postalCode: '24937' });
    expect((await carla.agent.get(`/api/v1/walks/${acc.body.walkId}`)).status).toBe(404);
    const out = await bernd.agent.get('/api/v1/rural/partner-requests').expect(200);
    expect(out.body.outgoing[0]).toMatchObject({ status: 'accepted', walkId: acc.body.walkId });
    const mine = await bernd.agent.get('/api/v1/walks?kind=partner').expect(200);
    expect(mine.body.walks.map((x: { id: string }) => x.id)).toContain(acc.body.walkId);

    // Ablehnen: still, Absenderin sieht nur den Status
    const rc = await carla.agent.post(`/api/v1/rural/partners/${offer.body.offer.id}/request`).send({ message: 'Hallo' }).expect(200);
    const before = (await db.select().from(s.notifications).where(eq(s.notifications.userId, carla.userId))).length;
    await anna.agent.post(`/api/v1/rural/partner-requests/${rc.body.request.id}/decline`).send({}).expect(200);
    expect((await db.select().from(s.notifications).where(eq(s.notifications.userId, carla.userId))).length).toBe(before);
    const cOut = await carla.agent.get('/api/v1/rural/partner-requests').expect(200);
    expect(cOut.body.outgoing[0].status).toBe('declined');

    // Überblick zählt Gehpartner in der Nähe
    const ov = await bernd.agent.get('/api/v1/rural/overview?radiusKm=15').expect(200);
    expect(ov.body.partnersNearby).toBeGreaterThanOrEqual(1);

    // Gesuch löschen
    await anna.agent.delete('/api/v1/rural/partner-offer').expect(200);
    expect((await anna.agent.get('/api/v1/rural/partner-offer').expect(200)).body.offer).toBeNull();
  });

  it('blockierte Personen sehen das Gesuch der anderen nicht', async () => {
    const a = await signUp({ name: 'Ada', postalCode: '24976' });
    const b = await signUp({ name: 'Bea', postalCode: '24976' });
    const o = await a.agent.put('/api/v1/rural/partner-offer').send({ postalCode: '24976', active: true }).expect(200);
    await db.insert(s.blocks).values({ blockerId: a.userId, blockedId: b.userId });
    const list = await b.agent.get('/api/v1/rural/partners?radiusKm=5').expect(200);
    expect(list.body.offers.map((x: { id: string }) => x.id)).not.toContain(o.body.offer.id);
    const r = await b.agent.post(`/api/v1/rural/partners/${o.body.offer.id}/request`).send({ message: 'Hi' });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('offer_not_found');
  });

  it('Gehpartner-Gesuch löst Interessen-Benachrichtigung aus', async () => {
    const interested = await signUp({ name: 'Ilse', postalCode: '24986' });
    await interested.agent.put('/api/v1/rural/interest').send({ postalCode: '24986', radiusKm: 15 }).expect(200);
    const p = await signUp({ name: 'Otto', postalCode: '24937', gender: 'man' });
    await p.agent.put('/api/v1/rural/partner-offer').send({ postalCode: '24937', active: true }).expect(200);
    const m = sentMails.filter((x) => x.to === interested.email && x.subject.includes('Nähe'));
    expect(m).toHaveLength(1);
    expect(m[0].subject).toContain('Gehpartner');
  });
});
