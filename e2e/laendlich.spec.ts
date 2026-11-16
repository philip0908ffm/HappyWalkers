import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, signUpViaUi } from './helpers';

/** Ländliche Region ohne Gruppen: 25845 (Nordfriesland). */
test('Ländlich: Umkreis erweitern, Interesse anmelden, Gehpartner-Gesuch und Anfrage', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const suffix = Date.now() % 100000;
  const nameA = `Frieda${suffix}`;
  await signUpViaUi(page, { name: nameA, postalCode: '25845' });

  // Einstieg über das Profil
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Profil' }).click();
  await page.getByRole('link', { name: 'Keine Gruppe in der Nähe?' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Keine Gruppe in der Nähe?' })).toBeVisible();
  await expectNoA11yViolations(page);

  // Umkreis erweitern
  const radius = page.getByRole('region', { name: 'Umkreis erweitern' });
  await expect(radius.getByText(/Im Umkreis von 15 km um Elisabeth-Sophien-Koog: keine Gruppe, kein Walk/)).toBeVisible();
  await expect(radius.getByText(/Der nächste Ort mit einer Gruppe ist .+ \(etwa \d+ km entfernt\)\./)).toBeVisible();
  await radius.getByRole('radio', { name: '50 km' }).check();
  await expect(radius.getByText(/Im Umkreis von 50 km um Elisabeth-Sophien-Koog/)).toBeVisible();

  // Interesse anmelden
  const interest = page.getByRole('region', { name: 'Interesse anmelden' });
  await interest.getByLabel('Postleitzahl').fill('258');
  await interest.getByRole('button', { name: 'Interesse anmelden' }).click();
  await expect(interest.getByText('Bitte geben Sie eine Postleitzahl mit 5 Ziffern ein.')).toBeVisible();
  await expect(interest.getByLabel('Postleitzahl')).toHaveAttribute('aria-invalid', 'true');
  await interest.getByLabel('Postleitzahl').fill('25845');
  await interest.getByRole('button', { name: 'Interesse anmelden' }).dblclick();
  await expect(page.getByRole('status').filter({ hasText: 'Danke! Wir melden uns per E-Mail' }).first()).toBeVisible();
  await expect(interest.getByText(/Angemeldet: Wir benachrichtigen Sie für .+ im Umkreis von 30 km\./)).toBeVisible();

  // Gehpartner-Gesuch anlegen – Pflichtfeld wird am Feld erklärt
  const partner = page.getByRole('region', { name: /Gehpartner finden/ });
  await partner.getByRole('button', { name: 'Gesuch veröffentlichen' }).click();
  await expect(partner.getByLabel('Wann haben Sie Zeit?')).toHaveAttribute('aria-invalid', 'true');
  await expect(partner.getByText('Bitte schreiben Sie kurz, wann Sie Zeit haben.')).toBeVisible();
  await partner.getByLabel('Wann haben Sie Zeit?').fill('Dienstag und Donnerstag vormittags');
  await partner.getByLabel('Ein paar Worte dazu (freiwillig)').fill('Gern am Deich entlang, etwa eine Stunde.');
  await partner.getByRole('button', { name: 'Gesuch veröffentlichen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ihr Gesuch ist gespeichert und für Personen in der Nähe sichtbar.' }).first()).toBeVisible();
  await expect(partner.getByRole('button', { name: 'Gesuch speichern' })).toBeVisible();
  await expectNoA11yViolations(page);

  // Eine zweite Person aus der Gegend findet das Gesuch und fragt an
  const ctx2 = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const b = await ctx2.newPage();
  await signUpViaUi(b, { name: `Hedwig${suffix}`, postalCode: '25813' });
  await b.goto('/in-der-naehe');
  await b.getByRole('region', { name: 'Umkreis erweitern' }).getByRole('radio', { name: '50 km' }).check();
  const partnerB = b.getByRole('region', { name: /Gehpartner finden/ });
  const offer = partnerB.getByRole('listitem').filter({ hasText: nameA });
  await expect(offer).toBeVisible();
  await expect(offer.getByText(/etwa \d+ km entfernt/)).toBeVisible();
  await expect(offer.getByText('Dienstag und Donnerstag vormittags')).toBeVisible();
  // keine Kontaktdaten
  await expect(offer.getByText(/@|25845/)).toHaveCount(0);
  await offer.getByRole('button', { name: `${nameA} anfragen` }).click();
  const dialog = b.getByRole('dialog', { name: `Anfrage an ${nameA}` });
  await expect(dialog).toBeVisible();
  await expectNoA11yViolations(b);
  await dialog.getByLabel('Ihre Nachricht').fill('Hallo, ich gehe auch gern am Deich. Dienstag passt mir gut!');
  await dialog.getByRole('button', { name: 'Anfrage senden' }).click();
  await expect(b.getByRole('status').filter({ hasText: `Ihre Anfrage an ${nameA} wurde gesendet.` }).first()).toBeVisible();
  await ctx2.close();

  // A sieht die Anfrage
  await page.reload();
  await expect(page.getByText(/An mich \(1 offen\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Annehmen und Termin festlegen' })).toBeVisible();
});
