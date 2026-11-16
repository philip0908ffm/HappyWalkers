import { expect, test } from '@playwright/test';
import { dbQuery, expectNoA11yViolations, signUpFromLoginPage, signUpViaUi } from './helpers';

/**
 * Gruppenleitung: Gruppe mit Vorlage gründen, wiederkehrenden Termin anlegen, per Einladungslink einladen
 * (zweite Person im eigenen Browser-Kontext), Walk bestätigen → zählt für die Teilnehmerin,
 * Mitglied entfernen (Bestätigungsdialog), Aushang mit QR-Code.
 */
test('Gruppenleitung: gründen, Termin, einladen, bestätigen, entfernen, Aushang', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const groupName = `Testrunde Fulda ${Date.now() % 100000}`;
  await signUpViaUi(page, { name: 'Ursula', postalCode: '34121' });

  // Gruppe mit Vorlage gründen
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Gruppen' }).click();
  await page.goto('/gruppen/neu');
  await expect(page.getByRole('heading', { level: 1, name: 'Gruppe gründen' })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: /^Morgenrunde im Park/ }).click();
  await expect(page.getByText('Schritt 2 von 2')).toBeVisible();
  await expect(page.getByLabel('Beschreibung (freiwillig)')).not.toBeEmpty();
  await expect(page.getByRole('checkbox', { name: /Den Termin aus der Vorlage gleich anlegen/ })).toBeChecked();
  await page.getByLabel('Name der Gruppe').fill(groupName);
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Gruppe gründen' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Die Gruppe „${groupName}“ ist gegründet!` })).toBeVisible();

  // Wiederkehrender Termin aus der Vorlage
  await expect(page.getByRole('heading', { level: 1, name: 'Neuen Walk-Termin anlegen' })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Wiederkehrender Termin/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Dienstag' })).toBeChecked();
  await page.getByLabel('Strecke in km (freiwillig)').fill('5,5');
  await page.getByLabel('Name des Treffpunkts').fill('Auedamm, an der Brücke');
  await page.getByLabel('Adresse').fill('Auedamm 1, 34121 Kassel');
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'Termin anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Der wiederkehrende Termin ist angelegt.' }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/walks\/[0-9a-f-]+$/);
  const walkId = page.url().split('/walks/')[1];
  await expect(page.getByRole('region', { name: 'Treffpunkt' }).getByText('Auedamm, an der Brücke')).toBeVisible();

  // Gruppenseite: 8 Wochen Termine, Einladungslink
  await page.getByRole('link', { name: `Zurück zur Gruppe „${groupName}“` }).click();
  await expect(page.getByRole('heading', { level: 1, name: groupName })).toBeVisible();
  const groupUrl = new URL(page.url()).pathname;
  await expect(page.getByRole('region', { name: 'Nächste Termine' }).getByRole('article')).toHaveCount(8);
  const inviteUrl = await page.getByRole('textbox', { name: 'Einladungslink' }).inputValue();
  expect(inviteUrl).toMatch(/\/einladung\/WALK-[A-Z0-9]+$/);
  await expectNoA11yViolations(page);

  // Zweite Person folgt dem Einladungslink in eigenem Browser
  const ctx2 = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const member = await ctx2.newPage();
  const invitePath = new URL(inviteUrl).pathname;
  await member.goto(invitePath);
  await expect(member.getByRole('heading', { level: 1, name: 'Sie sind eingeladen!' })).toBeVisible();
  await expect(member.getByRole('heading', { level: 2, name: groupName })).toBeVisible();
  await expectNoA11yViolations(member);
  await member.getByRole('link', { name: 'Anmelden und beitreten' }).click();
  await signUpFromLoginPage(member, { name: 'Hannelore', postalCode: '34121' });
  await expect(member).toHaveURL(new RegExp(`${invitePath}$`));
  await expect(member.getByText('Schön, dass Sie da sind, Hannelore! Mit einem Klick sind Sie dabei.')).toBeVisible();
  // Nach der Rückkehr: Knopf groß oben, Fokus liegt darauf – Beitritt bleibt ein bewusster Klick
  await expect(member.getByRole('button', { name: 'Gruppe beitreten' })).toBeFocused();
  await member.getByRole('button', { name: 'Gruppe beitreten' }).click();
  await expect(member).toHaveURL(new RegExp(`${groupUrl}$`));
  await expect(member.getByRole('status').filter({ hasText: 'Willkommen in der Gruppe!' }).first()).toBeVisible();
  await expect(member.getByRole('heading', { level: 1, name: groupName })).toBeVisible();

  // Mitglied sieht Treffpunkt und sagt zu
  await member.goto(`/walks/${walkId}`);
  await expect(member.getByRole('region', { name: 'Treffpunkt' }).getByText('Auedamm 1, 34121 Kassel')).toBeVisible();
  await member.getByRole('button', { name: 'Ich bin dabei – zusagen' }).click();
  await expect(member.getByRole('heading', { name: 'Sie sind dabei!' })).toBeVisible();

  // Der Walk hat stattgefunden (Testvorbereitung: Beginn in die Vergangenheit legen)
  await dbQuery(`UPDATE walks SET starts_at = now() - interval '2 hours' WHERE id = $1`, [walkId]);

  // Gruppenleitung bestätigt den Walk
  await page.goto(`/walks/${walkId}`);
  const confirmBox = page.getByRole('region', { name: 'Für die Gruppenleitung' });
  await expect(confirmBox.getByRole('heading', { level: 3, name: /Walk bestätigen/ })).toBeVisible();
  await expect(confirmBox).toBeVisible();
  await expect(confirmBox.getByRole('checkbox', { name: /Hannelore/ })).toBeChecked();
  await expectNoA11yViolations(page);
  await confirmBox.getByRole('button', { name: 'Walk bestätigen', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Bestätigt – zählt jetzt für 1 Person.' }).first()).toBeVisible();

  // … und der Walk zählt für die Teilnehmerin
  await member.goto('/abzeichen');
  const groupBadge = member.getByRole('article', { name: 'Erster Gruppen-Walk' });
  await expect(groupBadge.getByText('Bronze · erreicht')).toBeVisible();
  await expect(member.getByRole('region', { name: 'Mein Stand' }).getByRole('listitem').filter({ hasText: /^1\s*Walk in der Gruppe$/ })).toBeVisible();

  // Mitglied entfernen – mit Bestätigungsdialog
  await page.goto(`${groupUrl}/verwaltung`);
  await expect(page.getByRole('heading', { level: 1, name: 'Gruppe verwalten' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '2 Mitglieder' })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: /^Entfernen\s*: Hannelore$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Hannelore aus der Gruppe entfernen?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Die Person wird nicht benachrichtigt.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Ja, entfernen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Hannelore ist aus der Gruppe entfernt.' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '1 Mitglied' })).toBeVisible();

  // Entfernte Person sieht keine Treffpunkte mehr (nächster Termin der Serie)
  await member.goto(groupUrl);
  await member.getByRole('region', { name: 'Nächste Termine' }).getByRole('link').first().click();
  await expect(member.getByText('Den Treffpunkt sehen Sie, sobald Sie Mitglied der Gruppe sind.')).toBeVisible();
  await expect(member.getByText('Auedamm 1, 34121 Kassel')).toHaveCount(0);
  await ctx2.close();

  // Aushang mit QR-Code
  await page.goto(groupUrl);
  await page.getByRole('region', { name: 'Gruppe verwalten' }).getByRole('link', { name: 'Aushang drucken' }).click();
  await expect(page).toHaveURL(new RegExp(`${groupUrl}/aushang$`));
  await expect(page.getByRole('heading', { level: 1, name: groupName })).toBeVisible();
  const qr = page.getByRole('img', { name: /QR/ });
  await expect(qr).toBeVisible();
  await expect(page.getByText(new URL(inviteUrl).pathname.split('/').pop()!).first()).toBeVisible();
  await expectNoA11yViolations(page);
});
