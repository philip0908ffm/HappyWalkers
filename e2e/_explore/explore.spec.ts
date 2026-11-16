import { test } from '@playwright/test';
import { signUpViaUi } from '../helpers';
const pages = (process.env.PAGES ?? '/').split(',');
test('explore', async ({ page }) => {
  test.setTimeout(120000);
  if (process.env.AUTH) await signUpViaUi(page, { name: 'Erika', postalCode: '34117' });
  for (const p of pages) {
    await page.goto(p);
    await page.waitForTimeout(1200);
    console.log('=== ' + p + ' -> ' + page.url());
    console.log(await page.locator('body').ariaSnapshot());
  }
});
