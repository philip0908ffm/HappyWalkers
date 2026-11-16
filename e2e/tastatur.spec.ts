import { expect, test, type Locator, type Page } from '@playwright/test';
import { signUpViaUi } from './helpers';

/** Drückt Tab, bis `target` den Fokus hat – so erreicht auch eine Tastatur-Nutzerin das Element. */
async function tabTo(page: Page, target: Locator, max = 80) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return i + 1;
  }
  throw new Error(`Nach ${max}× Tab nicht erreicht: ${target}`);
}

/** Fokusrahmen sichtbar: Umriss von mindestens 2 px oder ein Schatten. */
async function expectVisibleFocus(page: Page) {
  const style = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement as Element);
    return { outlineStyle: cs.outlineStyle, outlineWidth: parseFloat(cs.outlineWidth), boxShadow: cs.boxShadow };
  });
  const ok = (style.outlineStyle !== 'none' && style.outlineWidth >= 2) || (style.boxShadow && style.boxShadow !== 'none');
  expect(ok, `Fokus nicht sichtbar: ${JSON.stringify(style)}`).toBeTruthy();
}

test('Sprunglink führt zum Inhalt, Fokus ist überall sichtbar', async ({ page }) => {
  await signUpViaUi(page, { name: 'Erika' });
  await page.goto('/walks');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Zum Inhalt springen' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#inhalt$/);
  // Der nächste Tab-Stopp liegt im Hauptinhalt, nicht in der Navigation
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('main'))).toBeTruthy();

  // Fokus auf den ersten 15 Tab-Stopps sichtbar
  await page.goto('/walks');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    await expectVisibleFocus(page);
  }
});

test('Zusagen nur mit der Tastatur (Tab + Enter)', async ({ page }) => {
  await signUpViaUi(page, { name: 'Erika' });
  await page.goto('/gruppen/demo-group-karlsaue');
  const join = page.getByRole('region', { name: 'Mitmachen' }).getByRole('button', { name: 'Gruppe beitreten' });
  await tabTo(page, join);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: /Willkommen in der Gruppe/ }).first()).toBeVisible();

  const walkLink = page.getByRole('region', { name: 'Nächste Termine' }).getByRole('link').nth(1);
  await tabTo(page, walkLink, 120);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/walks\//);
  const yes = page.getByRole('button', { name: 'Ich bin dabei – zusagen' });
  await expect(yes).toBeVisible();
  await tabTo(page, yes);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Sie sind dabei!' })).toBeFocused();
});

test('Walk eintragen und speichern nur mit der Tastatur', async ({ page }) => {
  await signUpViaUi(page, { name: 'Erika' });
  await page.goto('/walk-eintragen');
  const form = page.getByRole('form', { name: 'Angaben zu Ihrem Walk' });
  await tabTo(page, form.getByRole('textbox', { name: 'Stunden' }));
  await page.keyboard.type('1');
  await page.keyboard.press('Tab');
  await expect(form.getByRole('textbox', { name: 'Minuten' })).toBeFocused();
  await page.keyboard.type('10');
  await tabTo(page, form.getByLabel('Strecke in Kilometern'));
  await page.keyboard.type('6,3');
  const save = form.getByRole('button', { name: 'Walk speichern' });
  await tabTo(page, save);
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Geschafft – 6,3 km!' })).toBeVisible();
});

test('Dialoge: Fokus wandert hinein, Escape schließt, Fokus kehrt zurück', async ({ page }) => {
  await signUpViaUi(page, { name: 'Erika' });
  await page.goto('/premium');
  const open = page.getByRole('button', { name: /Premium abschließen/ });
  await tabTo(page, open);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Premium abschließen?' });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog,[role=dialog]'))).toBeTruthy();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
});
