import { expect, test, type Browser, type Page } from '@playwright/test';
import { expectNoA11yViolations, signUpViaUi } from './helpers';

/** Start-Konto aus scripts/e2e-server.sh (ADMIN_EMAILS / ADMIN_INITIAL_PASSWORD – nur Testwerte). */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'verwaltung@example.org';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'E2e-Verwaltung-2026';

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  return ctx.newPage();
}

async function passwordLogin(page: Page, email: string, password: string) {
  await page.goto('/anmelden');
  await page.getByRole('radio', { name: 'Mit Passwort' }).check();
  await page.getByLabel('Ihre E-Mail-Adresse').fill(email);
  await page.getByLabel('Ihr Passwort').fill(password);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
}

test('Verwaltung: Anmeldung mit Passwort, Meldung bearbeiten, Person sperren und entsperren', async ({ browser }) => {
  test.setTimeout(120_000);
  const suffix = Date.now() % 100000;

  // Eine Person schreibt einen öffentlichen Beitrag, eine andere meldet ihn
  const author = await newPage(browser);
  const { email: authorEmail } = await signUpViaUi(author, { name: `Ruth${suffix}` });
  const postText = `Unfreundlicher Beitrag ${suffix}`;
  const post = await author.request.post('/api/v1/posts', { data: { text: postText, visibility: 'public' } });
  expect(post.status()).toBe(201);
  const postId = (await post.json()).post.id as string;

  const reporter = await newPage(browser);
  await signUpViaUi(reporter, { name: `Grete${suffix}` });
  const rep = await reporter.request.post('/api/v1/reports', { data: { targetType: 'post', targetId: postId, reason: 'Beleidigend' } });
  expect(rep.status()).toBe(200);

  // Normale Personen sehen keine Verwaltung (404-Seite, kein Link im Profil)
  await reporter.goto('/verwaltung');
  await expect(reporter.getByRole('heading', { level: 1 })).toHaveText(/existiert nicht/);
  await reporter.goto('/profil');
  await expect(reporter.getByRole('link', { name: 'Wer sieht was?' })).toBeVisible();
  await expect(reporter.getByRole('link', { name: 'Verwaltung' })).toHaveCount(0);

  // Admin: Anmeldung „Mit Passwort“
  const admin = await newPage(browser);
  await admin.goto('/anmelden');
  await admin.getByRole('radio', { name: 'Mit Passwort' }).check();
  const pw = admin.getByLabel('Ihr Passwort');
  await expect(pw).toHaveAttribute('type', 'password');
  await expect(pw).toHaveAttribute('autocomplete', 'current-password');
  await admin.getByRole('checkbox', { name: 'Passwort anzeigen' }).check();
  await expect(pw).toHaveAttribute('type', 'text');
  await admin.getByRole('checkbox', { name: 'Passwort anzeigen' }).uncheck();
  await expectNoA11yViolations(admin);

  // Falsches Passwort: verständliche Meldung, verrät nicht, ob es die Adresse gibt
  await passwordLogin(admin, ADMIN_EMAIL, 'ganz-falsches-passwort');
  await expect(admin.getByText('E-Mail-Adresse oder Passwort stimmen nicht.', { exact: false })).toBeVisible();
  await expect(admin.getByLabel('Ihr Passwort')).toBeFocused();
  await passwordLogin(admin, `niemand${suffix}@example.org`, 'ganz-falsches-passwort');
  await expect(admin.getByText('E-Mail-Adresse oder Passwort stimmen nicht.', { exact: false })).toBeVisible();

  await passwordLogin(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(admin).toHaveURL(/localhost:5174\/$/);

  // Link im Profil → Verwaltung
  await admin.goto('/profil');
  await admin.getByRole('link', { name: 'Verwaltung' }).click();
  await expect(admin.getByRole('heading', { level: 1, name: 'Verwaltung' })).toBeVisible();
  await expect(admin.getByRole('tab', { name: 'Meldungen' })).toHaveAttribute('aria-selected', 'true');
  const table = admin.getByRole('table', { name: 'Gemeldete Inhalte und Personen, die neuesten zuerst' });
  const row = table.getByRole('row').filter({ hasText: postText });
  await expect(row).toBeVisible();
  await expect(row).toContainText(`Ruth${suffix}`);
  await expect(row).toContainText(`Grete${suffix}`);
  await expect(row).toContainText('Beleidigend');
  await expect(table).not.toContainText('@example.org'); // keine E-Mail-Adressen bei Meldungen
  await expectNoA11yViolations(admin);

  // Inhalt löschen – mit Bestätigung, Fokus startet auf „Abbrechen“
  await row.getByRole('button', { name: /Inhalt löschen/ }).click();
  const dialog = admin.getByRole('dialog', { name: 'Diesen Inhalt löschen?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Abbrechen' })).toBeFocused();
  await expectNoA11yViolations(admin);
  await dialog.getByRole('button', { name: 'Ja, endgültig löschen' }).click();
  await expect(admin.getByText('Der Inhalt wurde gelöscht und die Meldung ist erledigt.').first()).toBeVisible();
  await expect(admin.getByRole('row').filter({ hasText: postText })).toHaveCount(0);
  const gone = await author.request.get(`/api/v1/feed?userId=${(await (await author.request.get('/api/v1/me')).json()).me.id}`);
  expect(JSON.stringify(await gone.json())).not.toContain(postText);

  // Erledigte Meldungen
  await admin.getByRole('radio', { name: 'Erledigte Meldungen' }).check();
  await expect(admin.getByRole('row').filter({ hasText: 'Beleidigend' }).first()).toBeVisible();

  // Personen: suchen, sperren (mit Grund), entsperren
  await admin.getByRole('tab', { name: 'Personen' }).click();
  await admin.getByLabel('Name oder E-Mail-Adresse').fill(authorEmail);
  await admin.getByRole('button', { name: 'Suchen' }).click();
  const people = admin.getByRole('table', { name: /Personen bei/ });
  const personRow = people.getByRole('row').filter({ hasText: authorEmail });
  await expect(personRow).toBeVisible();
  await expect(personRow).toContainText('Aktiv');
  await expectNoA11yViolations(admin);

  await personRow.getByRole('button', { name: /^Sperren/ }).click();
  const banDialog = admin.getByRole('dialog', { name: `Ruth${suffix} sperren?` });
  await banDialog.getByRole('button', { name: 'Ja, sperren' }).click();
  await expect(banDialog.getByText('Bitte geben Sie einen Grund an.')).toBeVisible();
  await expect(banDialog.getByLabel('Grund der Sperre')).toBeFocused();
  await expectNoA11yViolations(admin);
  await banDialog.getByLabel('Grund der Sperre').fill('Beleidigungen im Feed');
  await banDialog.getByRole('button', { name: 'Ja, sperren' }).click();
  await expect(personRow).toContainText('Gesperrt');
  await expect(personRow).toContainText('Beleidigungen im Feed');

  // Die gesperrte Person ist sofort abgemeldet
  expect((await author.request.get('/api/v1/me')).status()).toBe(401);

  await personRow.getByRole('button', { name: /Sperre aufheben/ }).click();
  await admin.getByRole('dialog', { name: `Sperre für Ruth${suffix} aufheben?` }).getByRole('button', { name: 'Ja, Sperre aufheben' }).click();
  await expect(personRow).toContainText('Aktiv');

  // Eigene Zeile: keine Knöpfe zum Sperren oder Rolle-Entziehen
  await admin.getByLabel('Name oder E-Mail-Adresse').fill(ADMIN_EMAIL);
  await admin.getByRole('button', { name: 'Suchen' }).click();
  const selfRow = people.getByRole('row').filter({ hasText: ADMIN_EMAIL });
  await expect(selfRow).toContainText('Das sind Sie');
  await expect(selfRow.getByRole('button')).toHaveCount(0);
});
