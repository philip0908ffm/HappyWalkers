import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, signUpViaUi } from './helpers';

/**
 * Leit-Persona (60 Jahre, Laptop): registrieren → Walks in der Nähe per PLZ finden (Liste und Karte)
 * → Gruppe beitreten → Treffpunkt erst danach sichtbar → zusagen (Doppelklick sicher) → Kalenderdatei.
 * Nutzt die Demo-Gruppe „Morgenrunde Karlsaue“ (offen, Kassel 34117).
 */
test('Persona: Walk finden, Gruppe beitreten, zusagen und in den Kalender übernehmen', async ({ page }) => {
  await signUpViaUi(page, { name: 'Erika', postalCode: '34119' });

  // Walks per PLZ suchen
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Walks' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Walks in Ihrer Nähe' })).toBeVisible();
  const search = page.getByRole('search');
  await search.getByLabel('Postleitzahl oder Ort').fill('34117');
  await search.getByRole('button', { name: 'Suchen' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Walks? bis 15 km von 34117 Kassel/ }).first()).toBeVisible();
  const list = page.getByRole('tabpanel', { name: 'Liste' });
  await expect(list.getByRole('link', { name: 'Dienstags-Runde in der Karlsaue' }).first()).toBeVisible();
  await expectNoA11yViolations(page);

  // Kartenansicht
  await page.getByRole('tab', { name: 'Karte' }).click();
  await expect(page.getByRole('tab', { name: 'Karte' })).toHaveAttribute('aria-selected', 'true');
  const mapPanel = page.getByRole('tabpanel', { name: 'Karte' });
  await expect(mapPanel).toBeVisible();
  await expect(mapPanel.locator('.leaflet-container, [data-testid=map], .map').first()).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole('tab', { name: 'Liste' }).click();

  // Walk öffnen: Treffpunkt noch verborgen
  await list.getByRole('link', { name: 'Dienstags-Runde in der Karlsaue' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dienstags-Runde in der Karlsaue' })).toBeVisible();
  const meeting = page.getByRole('region', { name: 'Treffpunkt' });
  await expect(meeting.getByText('Den Treffpunkt sehen Sie, sobald Sie Mitglied der Gruppe sind.')).toBeVisible();
  await expect(page.getByText('Orangerie, Haupteingang')).toHaveCount(0);
  await expect(page.getByText(/An der Karlsaue 20c/)).toHaveCount(0);
  await expectNoA11yViolations(page);

  // Kalenderdatei vor dem Beitritt enthält keinen Treffpunkt
  const walkUrl = page.url();
  const walkId = walkUrl.split('/walks/')[1];
  const icsBefore = await page.request.get(`/api/v1/walks/${walkId}/ics`);
  expect(icsBefore.ok()).toBeTruthy();
  expect(await icsBefore.text()).not.toContain('Karlsaue 20c');
  // Wer sieht was: Nicht-Mitglieder sehen weder Treffpunkt noch Teilnehmerliste
  const apiBefore = await page.request.get(`/api/v1/walks/${walkId}`).then((r) => r.json());
  expect(apiBefore.walk.meetingPoint).toBeNull();
  expect(apiBefore.walk.participants).toBeNull();

  // Gruppe beitreten
  await meeting.getByRole('button', { name: 'Gruppe beitreten' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Willkommen|beigetreten|Mitglied/ }).first()).toBeVisible();
  await expect(meeting.getByText('Orangerie, Haupteingang')).toBeVisible();
  await expect(meeting.getByText(/An der Karlsaue 20c/)).toBeVisible();

  // Zusagen – Doppelklick darf nichts kaputt machen
  const mitgehen = page.getByRole('region', { name: 'Mitgehen' });
  const yes = mitgehen.getByRole('button', { name: 'Ich bin dabei – zusagen' });
  await expect(yes).toBeVisible();
  const before = await page.request.get(`/api/v1/walks/${walkId}`).then((r) => r.json());
  await yes.dblclick();
  await expect(page.getByRole('status').filter({ hasText: 'Sie sind dabei! Wir haben Sie eingetragen.' }).first()).toBeVisible();
  const going = page.getByRole('heading', { level: 2, name: 'Sie sind dabei!' });
  await expect(going).toBeVisible();
  await expect(going).toBeFocused();
  const after = await page.request.get(`/api/v1/walks/${walkId}`).then((r) => r.json());
  expect(after.walk.myRsvp).toBe('yes');
  expect(after.walk.participantCount).toBe(before.walk.participantCount + 1);
  await expect(page.getByText(/Fehler|Etwas ist schiefgegangen/)).toHaveCount(0);
  await expectNoA11yViolations(page);

  // Kalenderdatei abrufbar – jetzt mit Treffpunkt
  const icsLink = page.getByRole('link', { name: 'In meinen Kalender übernehmen' });
  await expect(icsLink).toHaveAttribute('href', new RegExp(`/walks/${walkId}/ics$`));
  const [download] = await Promise.all([page.waitForEvent('download'), icsLink.click()]);
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  const ics = await page.request.get(`/api/v1/walks/${walkId}/ics`);
  expect(ics.headers()['content-type']).toContain('text/calendar');
  const body = await ics.text();
  expect(body).toContain('BEGIN:VCALENDAR');
  expect(body).toContain('Dienstags-Runde in der Karlsaue');
  expect(body).toContain('Karlsaue 20c');

  // Auf der Startseite erscheint der zugesagte Walk
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Start' }).click();
  await expect(page.getByRole('region', { name: 'Ihre nächsten Walks' }).getByText('Dienstags-Runde in der Karlsaue')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Meine Gruppen' }).getByText('Morgenrunde Karlsaue')).toBeVisible();
});

test('Absagen braucht eine Bestätigung im Dialog', async ({ page }) => {
  await signUpViaUi(page, { name: 'Brigitte', postalCode: '34117' });
  await page.goto('/gruppen/demo-group-karlsaue');
  await page.getByRole('region', { name: 'Mitmachen' }).getByRole('button', { name: 'Gruppe beitreten' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Willkommen|beigetreten|Mitglied/ }).first()).toBeVisible();
  await page.getByRole('region', { name: 'Nächste Termine' }).getByRole('link', { name: 'Freitags-Runde in der Karlsaue' }).first().click();
  await page.getByRole('button', { name: 'Ich bin dabei – zusagen' }).click();
  await expect(page.getByRole('heading', { name: 'Sie sind dabei!' })).toBeVisible();
  await page.getByRole('button', { name: 'Doch nicht dabei – absagen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Möchten Sie wirklich absagen?' });
  await expect(dialog).toBeVisible();
  await expectNoA11yViolations(page);
  await dialog.getByRole('button', { name: 'Nein, ich bleibe dabei' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Sie sind dabei!' })).toBeVisible();
  await page.getByRole('button', { name: 'Doch nicht dabei – absagen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ja, absagen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sie haben abgesagt.' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ich bin dabei – zusagen' })).toBeVisible();
});
