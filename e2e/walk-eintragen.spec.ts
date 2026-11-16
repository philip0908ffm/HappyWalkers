import path from 'node:path';
import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, signUpViaUi } from './helpers';

const GPX = path.join(__dirname, '..', 'server', 'test', 'fixtures', 'walk.gpx');

test('Walk manuell eintragen: „5,2“ km → Erfolgsseite mit Abzeichen', async ({ page }) => {
  await signUpViaUi(page, { name: 'Gerda' });
  await page.getByRole('link', { name: /Walk eintragen/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Walk eintragen' })).toBeVisible();
  await expectNoA11yViolations(page);

  const form = page.getByRole('form', { name: 'Angaben zu Ihrem Walk' });
  await form.getByRole('textbox', { name: 'Stunden' }).fill('1');
  await form.getByRole('textbox', { name: 'Minuten' }).fill('5');
  await form.getByLabel('Strecke in Kilometern').fill('5,2');
  await form.getByLabel('Name für diesen Walk (freiwillig)').fill('Runde am See');
  await form.getByRole('button', { name: 'Walk speichern' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Geschafft – 5,2 km!' })).toBeVisible();
  await expect(page.getByText(/Dafür gibt es \d+ Punkte?\./)).toBeVisible();
  await expect(page.getByRole('region', { name: /neue Abzeichen für Ihre Vitrine|Neues Abzeichen für Ihre Vitrine/ })).toBeVisible();
  await expect(page.getByText('Erster Walk', { exact: true }).first()).toBeVisible();
  await expectNoA11yViolations(page);

  // Abzeichen ist in der Vitrine
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Abzeichen' }).click();
  await expect(page.getByText('Erster Walk', { exact: true }).first()).toBeVisible();
});

test('Unplausible Eingaben: verständliche Fehlermeldungen direkt am Feld', async ({ page }) => {
  await signUpViaUi(page, { name: 'Gerda' });
  await page.goto('/walk-eintragen');
  const form = page.getByRole('form', { name: 'Angaben zu Ihrem Walk' });
  const km = form.getByLabel('Strecke in Kilometern');

  // Nichts ausgefüllt
  await form.getByRole('button', { name: 'Walk speichern' }).click();
  await expect(km).toHaveAttribute('aria-invalid', 'true');
  await expect(km).toHaveAccessibleDescription(/Bitte geben Sie die Strecke in Kilometern an, zum Beispiel 5,2\./);
  await expect(page.getByText('Bitte geben Sie an, wie lange Sie unterwegs waren (Stunden und/oder Minuten).').first()).toBeVisible();

  // Keine Zahl
  await km.fill('fünf');
  await form.getByRole('textbox', { name: 'Minuten' }).fill('60');
  await form.getByRole('button', { name: 'Walk speichern' }).click();
  await expect(km).toHaveAccessibleDescription(/Bitte geben Sie die Strecke als Zahl an, zum Beispiel 5,2\./);

  // Zu schnell: 30 km in 60 Minuten
  await km.fill('30');
  await form.getByRole('button', { name: 'Walk speichern' }).click();
  await expect(page.getByText('Das wären über 15 km pro Stunde. Bitte prüfen Sie Strecke und Dauer.').first()).toBeVisible();

  // Datum in der Zukunft
  await km.fill('5');
  await form.getByLabel('Datum').fill('2099-01-01');
  await form.getByRole('button', { name: 'Walk speichern' }).click();
  await expect(form.getByLabel('Datum')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByLabel('Datum')).toHaveAccessibleDescription(/Das Datum liegt in der Zukunft/);
  await expectNoA11yViolations(page);

  // Es wurde nichts gespeichert
  await expect(page.getByRole('heading', { level: 1, name: 'Walk eintragen' })).toBeVisible();
});

test('GPX-Datei hochladen, Angaben prüfen und speichern', async ({ page }) => {
  await signUpViaUi(page, { name: 'Gerda' });
  await page.goto('/walk-eintragen');
  await page.getByRole('radio', { name: /GPX-Datei hochladen/ }).check();
  await expect(page.getByText(/Eine GPX-Datei speichert Ihren Weg/)).toBeVisible();
  await expectNoA11yViolations(page);

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Datei auswählen' }).click();
  await (await chooser).setFiles(GPX);
  await expect(page.getByText('Die Datei wurde gelesen. Bitte prüfen Sie die Angaben.').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Das haben wir in der Datei gefunden' })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Ja, diese Angaben übernehmen' }).click();
  await expect(page.getByText(/Die Angaben aus der Datei sind unten eingetragen/).first()).toBeVisible();

  const form = page.getByRole('form', { name: 'Angaben zu Ihrem Walk' });
  await expect(form.getByLabel('Strecke in Kilometern')).not.toHaveValue('');
  // Fixture: rund 2,6 km
  await expect(form.getByLabel('Strecke in Kilometern')).toHaveValue(/^2,6/);
  await form.getByRole('button', { name: 'Walk speichern' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Geschafft – 2,6 km!' })).toBeVisible();
  await expect(page.getByText(/Dafür gibt es \d+ Punkte?\./)).toBeVisible();
});

test('Falsche Datei beim GPX-Hochladen wird verständlich abgelehnt', async ({ page }) => {
  await signUpViaUi(page, { name: 'Gerda' });
  await page.goto('/walk-eintragen');
  await page.getByRole('radio', { name: /GPX-Datei hochladen/ }).check();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Datei auswählen' }).click();
  await (await chooser).setFiles({ name: 'urlaub.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('kein gpx') });
  await expect(page.getByText('Das ist keine GPX-Datei. Bitte wählen Sie eine Datei, deren Name auf .gpx endet.').first()).toBeVisible();
});
