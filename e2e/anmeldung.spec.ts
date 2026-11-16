import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, signUpViaUi } from './helpers';

test('Anmeldeseite ist barrierefrei und per Tastatur erreichbar', async ({ page }) => {
  await page.goto('/anmelden');
  await expect(page.getByRole('heading', { level: 1, name: 'Anmelden' })).toBeVisible();
  await expectNoA11yViolations(page);
  // erster Tab-Stopp: Sprunglink
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Zum Inhalt springen' })).toBeFocused();
});

test('Fehlermeldung bei ungültiger E-Mail-Adresse ist verständlich', async ({ page }) => {
  await page.goto('/anmelden');
  await page.getByLabel('Ihre E-Mail-Adresse').fill('erika');
  await page.getByRole('button', { name: 'Anmelde-Link senden' }).click();
  await expect(page.getByText('Bitte geben Sie eine vollständige E-Mail-Adresse ein')).toBeVisible();
  await expect(page.getByLabel('Ihre E-Mail-Adresse')).toHaveAttribute('aria-invalid', 'true');
});

test('Registrierung per Magic Link mit anschließendem Profil', async ({ page }) => {
  await signUpViaUi(page, { name: 'Erika' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Erika');
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link')).toHaveCount(5);
});
