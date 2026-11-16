import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

let n = 0;

/** Meldet eine neue Person über den echten Magic-Link-Ablauf an und füllt das Profil aus. */
export async function signUpViaUi(page: Page, opts: { name?: string; postalCode?: string } = {}) {
  const email = `e2e${Date.now()}${n++}@example.org`;
  await page.goto('/anmelden');
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
