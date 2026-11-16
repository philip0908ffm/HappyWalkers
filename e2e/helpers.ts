import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import pg from 'pg';

let n = 0;

export function newEmail() {
  return `e2e${Date.now()}${n++}@example.org`;
}

/** Meldet eine neue Person über den echten Magic-Link-Ablauf an und füllt das Profil aus. */
export async function signUpViaUi(page: Page, opts: { name?: string; postalCode?: string } = {}) {
  await page.goto('/anmelden');
  return signUpFromLoginPage(page, opts);
}

/**
 * Wie `signUpViaUi`, aber die Anmeldeseite ist bereits geöffnet (z. B. über „Anmelden und beitreten“
 * mit Rücksprung-Adresse). Danach steht die Person auf der Rücksprung-Seite.
 */
export async function signUpFromLoginPage(page: Page, opts: { name?: string; postalCode?: string } = {}) {
  const email = newEmail();
  await page.getByLabel('Ihre E-Mail-Adresse').fill(email);
  await page.getByRole('button', { name: 'Anmelde-Link senden' }).click();
  await expect(page.getByRole('heading', { name: /Bitte schauen Sie in Ihr E-Mail-Postfach/ })).toBeVisible();
  const link = await magicLinkFor(page, email);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Willkommen bei Gehmeinsam!' })).toBeVisible();
  await page.getByLabel('Wie dürfen wir Sie nennen?').fill(opts.name ?? 'Erika');
  await page.getByLabel('Ihre Postleitzahl').fill(opts.postalCode ?? '34117');
  await expect(page.getByText(/Gefunden: Kassel|Gefunden:/)).toBeVisible();
  await page.getByRole('button', { name: /Los geht/ }).click();
  await expect(page.getByRole('status').getByText(/Schön, dass Sie da sind/)).toBeVisible();
  return { email };
}

export async function magicLinkFor(page: Page, email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await page.request.get(`http://localhost:3100/api/test/mailbox?to=${encodeURIComponent(email)}`);
    const { mails } = await res.json();
    const last = mails.at(-1);
    if (last) {
      const url = new URL(last.text.match(/https?:\/\/\S+/)[0]);
      return url.pathname + url.search;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('Keine Anmelde-Mail erhalten');
}

/** axe-Prüfung nach WCAG 2.2 A/AA. */
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  expect(summary, summary.join('\n')).toEqual([]);
}

/** Direkter Datenbankzugriff – nur für Testvorbereitungen, die über die Oberfläche nicht gehen (Zeit vorstellen). */
export async function dbQuery<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({
    connectionString: process.env.E2E_DATABASE_URL ?? 'postgres://gehmeinsam:gehmeinsam@localhost:5432/gehmeinsam_e2e',
  });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/** Kein waagerechtes Scrollen (Zoom 200 % / 320 px). */
export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `Seite ${page.url()} ist ${scrollWidth}px breit bei ${innerWidth}px Fenster`).toBeLessThanOrEqual(innerWidth);
}

export type RichUser = {
  storageState: Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>>;
  groupId: string;
  walkId: string;
  activityId: string;
  challengeId: string;
};

/**
 * Legt eine Person mit „gefülltem“ Konto an: Mitglied der Demo-Gruppe Karlsaue mit Zusage,
 * eigene Gruppe (Leitung), ein eingetragener Walk, Premium aktiv. Für Seitenprüfungen.
 */
export async function setupRichUser(browser: import('@playwright/test').Browser): Promise<RichUser> {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const page = await ctx.newPage();
  await signUpViaUi(page, { name: 'Erika', postalCode: '34117' });
  const api = async (method: 'post' | 'put', url: string, data?: unknown) => {
    const r = await page.request[method](`/api/v1${url}`, { data: data ?? {} });
    expect(r.ok(), `${method} ${url} → ${r.status()} ${await r.text()}`).toBeTruthy();
    return r.json();
  };
  await api('post', '/groups/demo-group-karlsaue/join');
  const walks = await page.request.get('/api/v1/walks?groupId=demo-group-karlsaue').then((r) => r.json());
  const walkId = walks.walks[0].id as string;
  await api('put', `/walks/${walkId}/rsvp`, { status: 'yes' });
  const { group } = await api('post', '/groups', {
    name: `Prüfgruppe ${Date.now() % 100000}`,
    description: 'Eine Gruppe für die Prüfung der Seiten.',
    rules: 'Wir warten aufeinander.',
    joinPolicy: 'open',
    womenOnly: false,
    postalCode: '34117',
    defaultTempo: 'zuegig',
  });
  const started = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { activity } = await api('post', '/activities', { startedAt: started, durationMinutes: 62, distanceKm: 5.2, title: 'Runde im Park' });
  await api('post', '/premium/subscribe');
  const ch = await page.request.get('/api/v1/challenges').then((r) => r.json());
  const storageState = await ctx.storageState();
  await ctx.close();
  return { storageState, groupId: group.id, walkId, activityId: activity.id, challengeId: ch.active[0].id };
}
