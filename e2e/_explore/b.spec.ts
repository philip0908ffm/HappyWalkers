import { test } from '@playwright/test';
import { signUpViaUi } from '../helpers';
const snap = async (page, label) => { await page.waitForTimeout(800); console.log('=== '+label+' '+page.url()); console.log((await page.locator('main').ariaSnapshot()).split('\n').filter(l=>!/listitem:$/.test(l)).join('\n')); };
test('b', async ({ page }) => {
  test.setTimeout(120000);
  await signUpViaUi(page, { name: 'Gerda' });
  await page.goto('/walk-eintragen');
  const form = page.getByRole('form', { name: 'Angaben zu Ihrem Walk' });
  await form.getByRole('textbox', { name: 'Minuten' }).fill('65');
  await form.getByLabel('Strecke in Kilometern').fill('5,2');
  await form.getByRole('button', { name: 'Walk speichern' }).click();
  await page.waitForTimeout(1000);
  await page.goto('/abzeichen'); await page.getByRole('article',{name:'Erster Walk'}).getByRole('button',{name:'Teilen'}).click(); await page.getByRole('button',{name:'Öffentlichen Link erstellen'}).click(); await snap(page,'share');
});
