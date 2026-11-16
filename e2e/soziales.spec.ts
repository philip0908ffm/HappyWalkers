import { expect, test, type Browser, type Page } from '@playwright/test';
import { expectNoA11yViolations, signUpViaUi } from './helpers';

// Gültiges 1×1-PNG für die Datei-Auswahl
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function personInKarlsaue(browser: Browser, name: string): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const page = await ctx.newPage();
  await signUpViaUi(page, { name, postalCode: '34117' });
  await page.goto('/gruppen/demo-group-karlsaue');
  await page.getByRole('region', { name: 'Mitmachen' }).getByRole('button', { name: 'Gruppe beitreten' }).click();
  await expect(page.getByRole('region', { name: 'Neuigkeiten aus der Gruppe' })).toBeVisible();
  return page;
}

test('Soziales: Profilbild, Beitrag, Herz, Kommentar, Folgen mit Bestätigung, privates Profil, Blockieren', async ({ browser }) => {
  test.setTimeout(120_000);
  const suffix = Date.now() % 100000;
  const nameA = `Hilde${suffix}`;
  const nameB = `Klara${suffix}`;
  const a = await personInKarlsaue(browser, nameA);
  const b = await personInKarlsaue(browser, nameB);

  // A: Profilbild über die Datei-Auswahl hochladen
  await a.goto('/profil');
  const chooser = a.waitForEvent('filechooser');
  await a.getByRole('group', { name: 'Profilbild' }).getByRole('button', { name: 'Bild auswählen' }).click();
  await (await chooser).setFiles({ name: 'ich.png', mimeType: 'image/png', buffer: PNG });
  await expect(a.getByText('Ihr Profilbild wurde gespeichert.').first()).toBeVisible();
  await expect(a.getByRole('button', { name: 'Anderes Bild wählen' })).toBeVisible();
  await expectNoA11yViolations(a);

  // A: Beitrag in der Gruppe
  const postText = `Heute war es herrlich an der Orangerie! ${suffix}`;
  await a.goto('/gruppen/demo-group-karlsaue');
  const feedA = a.getByRole('region', { name: 'Neuigkeiten aus der Gruppe' });
  await feedA.getByRole('button', { name: 'Teilen' }).click();
  await expect(feedA.getByText('Bitte schreiben Sie zuerst etwas.')).toBeVisible();
  await feedA.getByLabel('Etwas mit der Gruppe teilen').fill(postText);
  await feedA.getByRole('button', { name: 'Teilen' }).click();
  await expect(a.getByRole('status').filter({ hasText: 'Ihr Beitrag ist jetzt für die Gruppe sichtbar.' }).first()).toBeVisible();
  await expect(feedA.getByText(postText)).toBeVisible();

  // B: Herz (Doppelklick-sicher) und Kommentar
  await b.goto('/gruppen/demo-group-karlsaue');
  const post = b.getByRole('article').filter({ hasText: postText });
  await expect(post).toBeVisible();
  const heart = post.getByRole('button', { name: /Herz geben/ });
  await heart.click();
  await expect(b.getByRole('status').filter({ hasText: 'Sie haben ein Herz gegeben.' }).first()).toBeVisible();
  await expect(post.getByRole('button', { name: /Herz gegeben/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(post.getByText('(1 Herz)')).toBeVisible();
  await post.getByRole('button', { name: /Kommentar/ }).click();
  await post.getByLabel('Ihr Kommentar').fill('Wie schön, bis Dienstag!');
  await post.getByRole('button', { name: 'Kommentar senden' }).click();
  await expect(b.getByRole('status').filter({ hasText: 'Ihr Kommentar ist gesendet.' }).first()).toBeVisible();
  await expect(post.getByText('Wie schön, bis Dienstag!')).toBeVisible();
  await expect(post.getByRole('button', { name: /1 Kommentar/ })).toBeVisible();
  await expectNoA11yViolations(b);

  // B: Profil von A ist privat → keine Details
  await post.getByRole('link', { name: nameA }).first().click();
  await expect(b.getByRole('heading', { level: 1, name: nameA })).toBeVisible();
  await expect(b.getByText(`${nameA} zeigt das Profil nur ausgewählten Personen.`)).toBeVisible();
  await expect(b.getByRole('region', { name: `Über ${nameA}` })).toHaveCount(0);
  await expect(b.getByRole('region', { name: 'Abzeichen' })).toHaveCount(0);
  await expect(b.getByText('aus Kassel')).toHaveCount(0);
  await expectNoA11yViolations(b);
  const personAUrl = new URL(b.url()).pathname;

  // B: Folgen braucht Bestätigung
  await b.getByRole('button', { name: 'Anfrage zum Folgen senden' }).dblclick();
  await expect(b.getByRole('status').filter({ hasText: `Ihre Anfrage wurde an ${nameA} gesendet.` }).first()).toBeVisible();
  await expect(b.getByText(`Ihre Anfrage an ${nameA} wartet auf Zustimmung.`)).toBeVisible();

  // A: Anfrage annehmen
  await a.goto('/profil');
  const contacts = a.getByRole('region', { name: 'Meine Kontakte' });
  await expect(contacts.getByRole('heading', { name: 'Neue Anfrage (1)' })).toBeVisible();
  await contacts.getByRole('button', { name: /^Annehmen/ }).click();
  await expect(a.getByRole('status').filter({ hasText: `${nameB} ist jetzt Ihr Kontakt.` }).first()).toBeVisible();
  await expect(contacts.getByRole('heading', { name: 'Mir folgt 1 Person' })).toBeVisible();

  await b.reload();
  await expect(b.getByText(`Sie folgen ${nameA}.`)).toBeVisible();
  // Profil bleibt privat – auch für Kontakte (Sichtbarkeit „Nur ich“)
  await expect(b.getByText(`${nameA} zeigt das Profil nur ausgewählten Personen.`)).toBeVisible();

  // B blockiert A – mit Bestätigung
  await b.getByRole('region', { name: 'Sicherheit' }).getByRole('button', { name: 'Blockieren' }).click();
  const dialog = b.getByRole('dialog', { name: `${nameA} blockieren?` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Die Person wird nicht benachrichtigt.', { exact: false })).toBeVisible();
  await expectNoA11yViolations(b);
  await dialog.getByRole('button', { name: 'Ja, blockieren' }).click();
  await expect(b.getByRole('status').filter({ hasText: `${nameA} ist jetzt blockiert.` }).first()).toBeVisible();

  // Gegenseitig unsichtbar
  await b.goto('/gruppen/demo-group-karlsaue');
  await expect(b.getByRole('region', { name: 'Neuigkeiten aus der Gruppe' })).toBeVisible();
  await expect(b.getByText(postText)).toHaveCount(0);
  await a.goto('/gruppen/demo-group-karlsaue');
  await expect(a.getByText(postText)).toBeVisible();
  await expect(a.getByText('Wie schön, bis Dienstag!')).toHaveCount(0);
  const resp = await a.request.get(`/api/v1/users/${personAUrl.split('/').pop()}`);
  expect(resp.status()).toBe(200);
  await b.goto('/profil');
  await expect(b.getByRole('region', { name: 'Blockierte Personen' }).getByText(nameA)).toBeVisible();

  await a.context().close();
  await b.context().close();
});

// Foto zu einem Beitrag: Datei-Auswahl „Foto hinzufügen“, Pflicht-Bildbeschreibung, Vorschau, danach im Beitrag mit alt-Text.
test('Foto zu einem Gruppen-Beitrag hinzufügen (Datei-Auswahl) und Beitrag melden', async ({ browser }) => {
  test.setTimeout(90_000);
  const suffix = Date.now() % 100000;
  const a = await personInKarlsaue(browser, `Fotofreundin${suffix}`);
  const feed = a.getByRole('region', { name: 'Neuigkeiten aus der Gruppe' });
  const chooser = a.waitForEvent('filechooser');
  await feed.getByRole('button', { name: 'Foto hinzufügen' }).click();
  await (await chooser).setFiles({ name: 'teich.png', mimeType: 'image/png', buffer: PNG });
  await expect(feed.getByRole('img', { name: 'Vorschau des ausgewählten Fotos' })).toBeVisible();
  await expect(feed.getByText('Foto ausgewählt: teich.png')).toBeVisible();

  // Ohne Bildbeschreibung geht es nicht – Fehler am Feld, Fokus dort
  await feed.getByRole('button', { name: 'Teilen' }).click();
  const alt = feed.getByLabel('Was ist auf dem Foto zu sehen?');
  await expect(feed.getByText('Bitte beschreiben Sie kurz, was auf dem Foto zu sehen ist.')).toBeVisible();
  await expect(alt).toBeFocused();
  await expectNoA11yViolations(a);

  const altText = `Enten auf dem Teich ${suffix}`;
  await alt.fill(altText);
  await feed.getByLabel('Etwas mit der Gruppe teilen').fill(`Heute mit Enten! ${suffix}`);
  await feed.getByRole('button', { name: 'Teilen' }).click();
  await expect(a.getByRole('status').filter({ hasText: 'Ihr Beitrag mit Foto ist jetzt sichtbar.' }).first()).toBeVisible();
  const post = feed.getByRole('article').filter({ hasText: `Heute mit Enten! ${suffix}` });
  const img = post.getByRole('img', { name: altText });
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  // Eingabe ist wieder leer, Knopf wieder da
  await expect(feed.getByRole('button', { name: 'Foto hinzufügen' })).toBeVisible();
  // eigener Beitrag: kein „Melden“
  await expect(post.getByRole('button', { name: 'Melden' })).toHaveCount(0);

  // Eine andere Person meldet den Beitrag – mit Grund und deutlicher Bestätigung
  const b = await personInKarlsaue(browser, `Melderin${suffix}`);
  const postB = b.getByRole('article').filter({ hasText: `Heute mit Enten! ${suffix}` });
  await postB.getByRole('button', { name: 'Melden' }).click();
  const dialog = b.getByRole('dialog', { name: /Beitrag von Fotofreundin\d+ melden/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Meldung absenden' }).click();
  await expect(dialog.getByText('Bitte wählen Sie einen Grund.')).toBeVisible();
  await dialog.getByLabel('Werbung oder Massennachrichten').check();
  await dialog.getByLabel('Was ist passiert?').fill('Test');
  await expectNoA11yViolations(b);
  await dialog.getByRole('button', { name: 'Meldung absenden' }).click();
  await expect(b.getByRole('status').filter({ hasText: 'Danke! Ihre Meldung ist bei uns angekommen.' }).first()).toBeVisible();
  await expect(dialog).toBeHidden();

  await a.context().close();
  await b.context().close();
});
