import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, signUpViaUi } from './helpers';

test('Einstellungen: Schriftgröße „Sehr groß“ wirkt und bleibt erhalten', async ({ page }) => {
  await signUpViaUi(page, { name: 'Elfriede' });
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Profil' }).click();
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
  await expectNoA11yViolations(page);

  const html = page.locator('html');
  const sizeBefore = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  await page.getByRole('group', { name: 'Schriftgröße' }).getByRole('radio', { name: 'Sehr groß' }).click();
  await expect(page.getByRole('radio', { name: 'Sehr groß' })).toBeChecked();
  await expect(html).toHaveAttribute('data-font', 'sehr-gross');
  await expect(page.getByRole('status').filter({ hasText: /gespeichert/ }).first()).toBeVisible();
  const sizeAfter = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(sizeAfter).toBeGreaterThan(sizeBefore);
  expect(sizeBefore).toBeGreaterThanOrEqual(18);
  await expectNoA11yViolations(page);

  await page.reload();
  await expect(html).toHaveAttribute('data-font', 'sehr-gross');
  await expect(page.getByRole('radio', { name: 'Sehr groß' })).toBeChecked();
});

test('Einstellungen: Du-Ansprache wechselt die Texte', async ({ page }) => {
  await signUpViaUi(page, { name: 'Elfriede' });
  await page.goto('/profil/einstellungen');
  await expect(page.getByText('Hier stellen Sie ein, wie HappyWalkers für Sie aussieht')).toBeVisible();
  // Sprachwechsel lädt die Du-Texte nach und zeichnet die Seite neu – daher click() + Zustandsprüfung
  await page.getByRole('group', { name: 'Ansprache' }).getByRole('radio', { name: '„Du“' }).click();
  await expect(page.getByRole('radio', { name: '„Du“' })).toBeChecked();
  await expect(page.getByText('Hier stellst du ein, wie HappyWalkers für dich aussieht')).toBeVisible();
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Start' }).click();
  await expect(page.getByText(/Was möchtest du heute tun\?/)).toBeVisible();
  await expect(page.getByText(/Was möchten Sie heute tun\?/)).toHaveCount(0);
  await expectNoA11yViolations(page);
  // zurück zu „Sie“
  await page.goto('/profil/einstellungen');
  await page.getByRole('radio', { name: '„Sie“' }).click();
  await expect(page.getByRole('radio', { name: '„Sie“' })).toBeChecked();
  await expect(page.getByText('Hier stellen Sie ein, wie HappyWalkers für Sie aussieht')).toBeVisible();
});

test('Einstellungen: Datenexport und Konto löschen', async ({ page }) => {
  const { email } = await signUpViaUi(page, { name: 'Elfriede' });
  await page.goto('/profil/einstellungen');

  // Datenexport
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Alle meine Daten herunterladen' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const data = JSON.parse(await fs.readFile((await download.path())!, 'utf8'));
  expect(JSON.stringify(data)).toContain(email);
  expect(JSON.stringify(data)).toContain('Elfriede');
  expect(JSON.stringify(data)).not.toMatch(/"token"\s*:/);

  // Konto löschen: falsches Wort → verständlicher Fehler am Feld
  const confirm = page.getByLabel('Zur Bestätigung tippen Sie bitte LÖSCHEN in das Feld');
  await confirm.fill('löschen bitte');
  await page.getByRole('button', { name: 'Konto endgültig löschen' }).click();
  await expect(confirm).toHaveAttribute('aria-invalid', 'true');
  await expect((await page.request.get('/api/v1/me')).status()).toBe(200);

  await confirm.fill('LÖSCHEN');
  await page.getByRole('button', { name: 'Konto endgültig löschen' }).click();
  await expect(page.getByText('Ihr Konto wurde gelöscht. Alles Gute!').first()).toBeVisible();
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  await page.goto('/profil');
  await expect(page).toHaveURL(/\/anmelden\?weiter=%2Fprofil/);
});
