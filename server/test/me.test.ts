import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp, signUp } from './helpers.js';

describe('Konto und Profil', () => {
  it('lehnt nicht angemeldete Anfragen ab', async () => {
    const res = await request(getApp()).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('not_signed_in');
  });

  it('meldet per Magic Link an und speichert das Profil mit Ort aus der PLZ', async () => {
    const { agent } = await signUp({ name: 'Erika', postalCode: '34117' });
    const res = await agent.get('/api/v1/me').expect(200);
    expect(res.body.me.displayName).toBe('Erika');
    expect(res.body.me.city).toBe('Kassel');
    expect(res.body.me.settings.anrede).toBe('sie');
    expect(res.body.me.settings.profileVisibility).toBe('private');
  });

  it('ändert Einstellungen (Du-Ansprache, große Schrift)', async () => {
    const { agent } = await signUp();
    const res = await agent.patch('/api/v1/me/settings').send({ anrede: 'du', fontScale: 'sehr-gross' }).expect(200);
    expect(res.body.me.settings.anrede).toBe('du');
    expect(res.body.me.settings.fontScale).toBe('sehr-gross');
  });

  it('exportiert alle Daten und löscht das Konto nur mit Bestätigung', async () => {
    const { agent } = await signUp();
    const exp = await agent.get('/api/v1/me/export').expect(200);
    expect(exp.headers['content-disposition']).toContain('attachment');
    await agent.delete('/api/v1/me').send({ confirm: 'ja' }).expect(400);
    await agent.delete('/api/v1/me').send({ confirm: 'LÖSCHEN' }).expect(200);
    await agent.get('/api/v1/me').expect(401);
  });
});
