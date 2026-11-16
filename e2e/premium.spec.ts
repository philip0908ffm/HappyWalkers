import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, signUpViaUi } from './helpers';

test('Premium: Preis sichtbar, kein Probeabo, abschließen, Fortschritt, kündigen', async ({ page }) => {
  await signUpViaUi(page, { name: 'Margarete' });

  // Fortschritt ohne Premium: freundlicher Hinweis statt Fehler
  await page.goto('/fortschritt');
  await expect(page.getByRole('heading', { level: 2, name: /Diese Seite gehört zu Premium/ })).toBeVisible();
  await expect(page.getByText('Walks, Gruppen und das Eintragen von Walks bleiben immer kostenlos.')).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole('link', { name: 'Mehr über Premium' }).click();

  // Preis und Versprechen
  await expect(page.getByRole('heading', { level: 1, name: 'Premium' })).toBeVisible();
  const price = page.getByRole('region', { name: 'Preis' });
  await expect(price.getByText('3,99 € pro Monat')).toBeVisible();
  await expect(price.getByText('Kein Probeabo – es kostet erst etwas, wenn Sie es selbst abschließen.')).toBeVisible();
  await expect(price.getByText('Monatlich mit einem Klick kündbar.')).toBeVisible();
  await expectNoA11yViolations(page);

  // Abschließen – mit klarer Rückfrage
  await page.getByRole('button', { name: 'Premium abschließen – 3,99 € pro Monat' }).click();
  const dialog = page.getByRole('dialog', { name: 'Premium abschließen?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Es gibt kein Probeabo und keine versteckten Kosten.')).toBeVisible();
  await expectNoA11yViolations(page);
  await dialog.getByRole('button', { name: 'Ja, kostenpflichtig abschließen (3,99 € pro Monat)' }).dblclick();
  await expect(page.getByRole('status').filter({ hasText: 'Willkommen bei Premium!' }).first()).toBeVisible();
  const mine = page.getByRole('region', { name: 'Mein Premium' });
  await expect(mine.getByText(/Premium ist aktiv\./)).toBeVisible();

  // Fortschritt sichtbar
  await mine.getByRole('link', { name: 'Zu meinem Fortschritt' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mein Fortschritt' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /Statistik/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Diese Seite gehört zu Premium/ })).toHaveCount(0);
  await expectNoA11yViolations(page);

  // Kündigen: ein Knopf, eine Bestätigung (gesetzliche Kündigungsschaltfläche)
  await page.goto('/premium');
  await page.getByRole('button', { name: 'Premium kündigen' }).click();
  const cancel = page.getByRole('dialog', { name: 'Premium wirklich kündigen?' });
  await expect(cancel.getByText('Danach wird nichts mehr abgebucht.')).toBeVisible();
  await cancel.getByRole('button', { name: 'Ja, kündigen' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Gekündigt\. Premium läuft noch bis zum/ }).first()).toBeVisible();
  await expect(page.getByText(/Sie haben gekündigt\. Premium läuft noch bis zum/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kündigung zurücknehmen' })).toBeVisible();
  const status = await page.request.get('/api/v1/premium/status').then((r) => r.json());
  expect(status.subscription.cancelAtPeriodEnd).toBe(true);
});
