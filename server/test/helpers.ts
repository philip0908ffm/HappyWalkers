import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { sentMails } from '../src/lib/email.js';

let app: Express | null = null;
export function getApp(): Express {
  app ??= createApp();
  return app;
}

/** Ein angemeldeter Test-Agent (Cookies bleiben erhalten). */
export type Agent = ReturnType<typeof request.agent>;

let counter = 0;

/**
 * Meldet eine neue Person per Magic Link an und füllt das Profil aus.
 * Gibt den Agenten (mit Sitzungs-Cookie) und die Benutzer-ID zurück.
 */
export async function signUp(opts: { name?: string; postalCode?: string; gender?: 'woman' | 'man' | 'diverse' } = {}) {
  const email = `test${Date.now()}${counter++}@example.org`;
  const agent = request.agent(getApp());
  await agent
    .post('/api/auth/sign-in/magic-link')
    .set('Origin', 'http://localhost:5173')
    .send({ email, callbackURL: '/' })
    .expect(200);
  const mail = [...sentMails].reverse().find((m) => m.to === email);
  if (!mail) throw new Error('Keine Anmelde-Mail gefunden');
  const url = new URL(mail.text.match(/https?:\/\/\S+/)![0]);
  await agent.get(url.pathname + url.search).set('Origin', 'http://localhost:5173');
  const res = await agent
    .patch('/api/v1/me/profile')
    .send({
      displayName: opts.name ?? 'Erika',
      postalCode: opts.postalCode ?? '34117',
      gender: opts.gender ?? 'woman',
      completeOnboarding: true,
    })
    .expect(200);
  return { agent, userId: res.body.me.id as string, email };
}
