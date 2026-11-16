import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { getApp, signUp } from './helpers.js';

const api = '/api/v1';

describe('Benachrichtigungen', () => {
  it('Liste, ungelesen-Zähler, alle gelesen; Hinweise blockierter Personen ausgeblendet', async () => {
    await request(getApp()).get(`${api}/notifications`).expect(401);
    const a = await signUp({ name: 'Zora' });
    const b = await signUp({ name: 'Bernd', gender: 'man' });
    const c = await signUp({ name: 'Clara' });

    expect((await a.agent.get(`${api}/notifications/unread-count`).expect(200)).body).toEqual({ unread: 0 });

    await b.agent.post(`${api}/users/${a.userId}/follow`).expect(200);
    await c.agent.post(`${api}/users/${a.userId}/follow`).expect(200);

    const list = await a.agent.get(`${api}/notifications`).expect(200);
    expect(list.body.unread).toBe(2);
    expect(list.body.notifications).toHaveLength(2);
    expect(list.body.notifications[0]).toMatchObject({ type: 'follow_request', readAt: null, actor: { id: c.userId, displayName: 'Clara' } });
    expect(JSON.stringify(list.body)).not.toMatch(/email|birthYear|gender/);

    // Anfrage zurückgezogen → Hinweis verschwindet
    await c.agent.delete(`${api}/users/${a.userId}/follow`).expect(200);
    expect((await a.agent.get(`${api}/notifications/unread-count`)).body.unread).toBe(1);

    // blockiert → ausgeblendet
    await a.agent.post(`${api}/users/${b.userId}/block`).expect(200);
    expect((await a.agent.get(`${api}/notifications`)).body.notifications).toHaveLength(0);
    await a.agent.delete(`${api}/users/${b.userId}/block`).expect(200);

    await a.agent.post(`${api}/notifications/read-all`).expect(200);
    await a.agent.post(`${api}/notifications/read-all`).expect(200);
    const after = await a.agent.get(`${api}/notifications`).expect(200);
    expect(after.body.unread).toBe(0);
    expect(after.body.notifications[0].readAt).toBeTruthy();

    // B ist nach dem Blockieren kein Kontakt mehr; Bestätigung benachrichtigt B
    await b.agent.post(`${api}/users/${a.userId}/follow`).expect(200);
    await a.agent.post(`${api}/follows/requests/${b.userId}/accept`).expect(200);
    const bList = await b.agent.get(`${api}/notifications`).expect(200);
    expect(bList.body.notifications[0]).toMatchObject({ type: 'follow_accepted', actor: { id: a.userId } });
    await b.agent.post(`${api}/notifications/${bList.body.notifications[0].id}/read`).expect(200);
    expect((await b.agent.get(`${api}/notifications/unread-count`)).body.unread).toBe(0);
  });
});
