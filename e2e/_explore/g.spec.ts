import { test, expect } from '@playwright/test';
import { signUpViaUi } from '../helpers';
const snap = async (page, label) => { await page.waitForTimeout(800); console.log('=== '+label+' '+page.url()); console.log((await page.locator('main').ariaSnapshot()).split('\n').filter(l=>!/\/url|listitem:$/.test(l)).join('\n')); };
test('g', async ({ page }) => {
  test.setTimeout(120000);
  await signUpViaUi(page, { name: 'Ursula', postalCode: '34121' });
  await page.goto('/gruppen/neu');
  await page.getByRole('button', { name: /Morgenrunde im Park/ }).click();
  await page.getByLabel('Name der Gruppe').fill('Testrunde Fulda');
  await page.getByRole('button', { name: 'Gruppe gründen' }).click();
  console.log('STATUS', await page.getByRole('status').allTextContents());
  await page.getByLabel('Strecke in km (freiwillig)').fill('5,5');
  await page.getByLabel('Name des Treffpunkts').fill('Auedamm, Brücke');
  await page.getByLabel('Adresse').fill('Auedamm 1, 34121 Kassel');
  await page.getByRole('button', { name: 'Termin anlegen' }).click();
  
  console.log('STATUS', await page.getByRole('status').allTextContents());
  await page.waitForURL(/walks\/[0-9a-f-]+$/); const gid = (await page.getByRole('link',{name:/Zurück zur Gruppe/}).getAttribute('href')).split('/')[2];
  await page.goto('/gruppen/'+gid); await snap(page,'group');
  await page.goto('/gruppen/'+gid+'/verwaltung'); await snap(page,'admin');


});
