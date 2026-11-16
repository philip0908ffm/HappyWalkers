import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations, signUpViaUi } from './helpers';

async function logWalk(page: Page, km: string, minutes: string) {
  await page.goto('/walk-eintragen');
  const form = page.getByRole('form', { name: 'Angaben zu Ihrem Walk' });
  await form.getByRole('textbox', { name: 'Minuten' }).fill(minutes);
  await form.getByLabel('Strecke in Kilometern').fill(km);
  await form.getByRole('button', { name: 'Walk speichern' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Geschafft – ${km} km!` })).toBeVisible();
}

test('Vitrine, Urkunde als PDF, öffentlicher Teilen-Link und Teilen beenden', async ({ page, browser }) => {
  await signUpViaUi(page, { name: 'Gerda' });
  await logWalk(page, '5,2', '65');

  await page.getByRole('link', { name: 'Zur Vitrine' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Meine Vitrine' })).toBeVisible();
  const stand = page.getByRole('region', { name: 'Mein Stand' });
  await expect(stand.getByRole('listitem').filter({ hasText: /^1\s*Walk$/ })).toBeVisible();
  await expect(stand.getByRole('listitem').filter({ hasText: /^5,2\s*Kilometer$/ })).toBeVisible();
  const badge = page.getByRole('article', { name: 'Erster Walk' });
  await expect(badge.getByText('Bronze · erreicht')).toBeVisible();
  // Noch nicht erreichte Abzeichen zeigen den Fortschritt
  await expect(page.getByRole('article', { name: 'Erste 10 Kilometer' }).getByRole('progressbar', { name: 'Fortschritt' })).toBeVisible();
  await expectNoA11yViolations(page);

  // Urkunde
  const pdfLink = badge.getByRole('link', { name: 'Urkunde herunterladen (PDF)' });
  const href = await pdfLink.getAttribute('href');
  const pdf = await page.request.get(href!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  // Teilen: erst Warnhinweis, dann Link erzeugen
  await badge.getByRole('button', { name: 'Teilen' }).click();
  await expect(badge.getByText(/Achtung, öffentlich: Wer den Link hat, sieht Ihren Namen/)).toBeVisible();
  await badge.getByRole('button', { name: 'Öffentlichen Link erstellen' }).click();
  const linkBox = badge.getByRole('textbox', { name: 'Ihr Link zum Weitergeben' });
  await expect(linkBox).toHaveValue(/\/abzeichen\/geteilt\/[\w-]+$/);
  const shareUrl = await linkBox.inputValue();
  const sharePath = new URL(shareUrl).pathname;
  const token = sharePath.split('/').pop()!;
  await expectNoA11yViolations(page);

  // Öffentlich abrufbar – ohne Anmeldung
  const anon = await browser.newContext({ locale: 'de-DE' });
  const anonPage = await anon.newPage();
  await anonPage.goto(sharePath);
  await expect(anonPage.getByText('Gerda').first()).toBeVisible();
  await expect(anonPage.getByText('Erster Walk').first()).toBeVisible();
  await expectNoA11yViolations(anonPage);
  const api = await anonPage.request.get(`/api/v1/badges/shared/${token}`);
  expect(api.status()).toBe(200);
  const shared = await api.json();
  expect(shared.displayName).toBe('Gerda');
  expect(JSON.stringify(shared)).not.toMatch(/@example\.org/);

  // Teilen beenden → Link funktioniert nicht mehr
  await badge.getByRole('button', { name: 'Teilen beenden' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Das Teilen ist beendet. Der Link funktioniert nicht mehr.' }).first()).toBeVisible();
  expect((await anonPage.request.get(`/api/v1/badges/shared/${token}`)).status()).toBe(404);
  await anonPage.reload();
  await expect(anonPage.getByText('Erster Walk')).toHaveCount(0);
  await expect(anonPage.getByRole('heading', { level: 1 })).toBeVisible();
  await anon.close();
});

test('Mitmach-Aktion: mitmachen und Rangliste ansehen', async ({ page }) => {
  await signUpViaUi(page, { name: 'Gerda' });
  await logWalk(page, '5,2', '65');
  await page.goto('/abzeichen');
  const region = page.getByRole('region', { name: /Mitmach-Aktionen/ });
  const challenge = region.getByRole('article').filter({ hasText: '5 km auf Ihrer eigenen Strecke' });
  await challenge.getByRole('button', { name: 'Mitmachen' }).dblclick();
  await expect(page.getByRole('status').first()).not.toBeEmpty();
  await challenge.getByRole('link', { name: '5 km auf Ihrer eigenen Strecke', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '5 km auf Ihrer eigenen Strecke' })).toBeVisible();
  await expect(page.getByText(/Geschafft/).first()).toBeVisible();
  await expectNoA11yViolations(page);
});
