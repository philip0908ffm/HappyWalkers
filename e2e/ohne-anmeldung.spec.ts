import { expect, test } from '@playwright/test';
import { signUpFromLoginPage } from './helpers';

const PROTECTED = [
  '/walk-eintragen',
  '/walks/neu',
  '/gruppen/neu',
  '/gruppen/demo-group-karlsaue/verwaltung',
  '/gruppen/demo-group-karlsaue/aushang',
  '/abzeichen',
  '/profil',
  '/profil/einstellungen',
  '/profil/nachrichten',
  '/personen/demo-user-renate',
  '/in-der-naehe',
  '/fortschritt',
];

for (const path of PROTECTED) {
  test(`ohne Anmeldung: ${path} leitet zur Anmeldung mit Rücksprung`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(`/anmelden?weiter=${encodeURIComponent(path)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Anmelden' })).toBeVisible();
  });
}

test('Nach der Registrierung geht es zur ursprünglich gewünschten Seite zurück', async ({ page }) => {
  await page.goto('/walk-eintragen');
  await expect(page).toHaveURL(/\/anmelden\?weiter=%2Fwalk-eintragen/);
  await signUpFromLoginPage(page, { name: 'Ingeborg' });
  await expect(page).toHaveURL(/\/walk-eintragen$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Walk eintragen' })).toBeVisible();
});

test('Öffentliche Seiten sind ohne Anmeldung erreichbar; Treffpunkt bleibt verborgen', async ({ page }) => {
  await page.goto('/walks');
  await expect(page.getByRole('heading', { level: 1, name: 'Walks in Ihrer Nähe' })).toBeVisible();
  await page.goto('/gruppen/demo-group-karlsaue');
  await expect(page.getByRole('heading', { level: 1, name: 'Morgenrunde Karlsaue' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Anmelden und beitreten' }).first()).toBeVisible();
  await page.getByRole('region', { name: 'Nächste Termine' }).getByRole('link').first().click();
  await expect(page.getByText('Orangerie, Haupteingang')).toHaveCount(0);
  const walkId = page.url().split('/walks/')[1];
  const api = await page.request.get(`/api/v1/walks/${walkId}`).then((r) => r.json());
  expect(api.walk.meetingPoint).toBeNull();
  const ics = await page.request.get(`/api/v1/walks/${walkId}/ics`);
  expect(await ics.text()).not.toContain('Karlsaue 20c');
  // Unsichere Rücksprung-Adressen werden ignoriert
  await page.goto('/anmelden?weiter=https%3A%2F%2Fboese.example');
  await expect(page.getByRole('heading', { level: 1, name: 'Anmelden' })).toBeVisible();
});
