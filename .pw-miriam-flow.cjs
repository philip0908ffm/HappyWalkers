const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-user-HappyWalkers/62baa3c4-ec4a-50f2-87d9-f63ab1a8e36d/scratchpad';
const BASE = 'http://localhost:5201';
async function axe(page, name) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  for (const v of r.violations) console.log(`AXE ${name}: ${v.id} – ${v.help} :: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}
async function snap(page, name) {
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
  await page.screenshot({ path: `${SP}/shots/${name}.png`, fullPage: true });
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  if (w[0] > w[1]) console.log(`HSCROLL ${name}: ${w[0]} > ${w[1]}`);
  await axe(page, name);
}
async function login(page, email, name, skipGoto) {
  if (!skipGoto) await page.goto(BASE + '/anmelden');
  await page.getByLabel('Ihre E-Mail-Adresse').fill(email);
  await page.getByRole('button', { name: 'Anmelde-Link senden' }).click();
  await page.waitForTimeout(1500);
  const log = fs.readFileSync(SP + '/server.log', 'utf8');
  const link = [...log.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]).filter((u) => u.includes('token')).at(-1);
  await page.goto(link);
  await page.waitForTimeout(2000);
  if (page.url().includes('/willkommen')) {
    await page.getByLabel('Wie dürfen wir Sie nennen?').fill(name);
    await page.getByLabel('Ihre Postleitzahl').fill('34117');
    await page.waitForTimeout(800);
    const g = page.getByText('Freiwillige Angaben'); if (await g.count()) { await g.click().catch(() => {}); }
    const frau = page.getByLabel('Frau', { exact: true }); if (await frau.count()) await frau.check().catch(() => {});
    await page.getByRole('button', { name: /Los geht/ }).click();
    await page.waitForTimeout(1500);
  }
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin', viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('401') && console.log('CONSOLE', m.text().slice(0, 200)));
  await login(page, `erika${Date.now()}@example.org`, 'Erika');
  console.log('nach Login', page.url());
  await page.goto(BASE + '/'); await snap(page, 'u-home');
  await page.goto(BASE + '/gruppen/demo-group-karlsaue');
  await page.getByRole('button', { name: 'Gruppe beitreten' }).click();
  await page.waitForTimeout(1200);
  console.log('Toast:', await page.locator('.toast').allTextContents());
  await snap(page, 'u-group-member');
  // ersten Termin öffnen und zusagen
  await page.locator('.walk-card__title a').first().click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /zusagen/ }).click();
  await page.waitForTimeout(1200);
  console.log('Toast:', await page.locator('.toast').allTextContents(), 'Fokus:', await page.evaluate(() => document.activeElement?.textContent));
  await snap(page, 'u-walk-going');
  await page.setViewportSize({ width: 640, height: 900 }); await snap(page, 'u-walk-going-640'); await page.setViewportSize({ width: 1366, height: 900 });
  // Absagen-Dialog
  await page.getByRole('button', { name: /absagen/ }).first().click();
  await page.waitForTimeout(300);
  console.log('Dialog-Fokus:', await page.evaluate(() => document.activeElement?.textContent));
  await page.screenshot({ path: `${SP}/shots/u-dialog.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('Fokus nach Esc:', await page.evaluate(() => document.activeElement?.textContent));
  // Gruppe gründen
  await page.goto(BASE + '/gruppen/neu'); await snap(page, 'u-group-new-1');
  await page.locator('.template-tile').first().click();
  await page.waitForTimeout(300);
  await page.getByLabel('Name der Gruppe').fill('Zügig am Fuldaufer');
  await snap(page, 'u-group-new-2');
  await page.getByRole('button', { name: 'Gruppe gründen' }).last().click();
  await page.waitForTimeout(2500);
  console.log('nach Gründung', page.url(), await page.locator('.toast').allTextContents());
  const gid = new URL(page.url()).searchParams.get('gruppe');
  await snap(page, 'u-walkform-tpl');
  await page.goto(BASE + `/gruppen/${gid}/verwaltung`); await snap(page, 'u-admin');
  await page.setViewportSize({ width: 640, height: 900 }); await snap(page, 'u-admin-640'); await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(BASE + `/gruppen/${gid}/aushang`); await snap(page, 'u-poster');
  await page.emulateMedia({ media: 'print' }); await page.screenshot({ path: `${SP}/shots/u-poster-print.png`, fullPage: true }); await page.emulateMedia({ media: 'screen' });
  await page.goto(BASE + `/walks/neu?${new URLSearchParams({gruppe: gid, wochentag:'2', uhrzeit:'10:00', dauer:'60', tempo:'zuegig', titel:'Dienstagsrunde'})}`); await page.waitForTimeout(1000);
  await page.getByLabel('Name des Treffpunkts').fill('Parkplatz Fuldaufer');
  await page.getByLabel('Adresse').fill('Fuldaufer 1, 34117 Kassel');
  await page.getByRole('button', { name: 'Termin anlegen' }).click();
  await page.waitForTimeout(2000);
  console.log('nach Termin', page.url(), await page.locator('.toast').allTextContents());
  const wid = page.url().split('/').pop();
  await page.goto(BASE + `/walks/${wid}/drucken`); await snap(page, 'u-walkprint');
  await page.goto(BASE + '/'); await snap(page, 'u-home2');
  await page.goto(BASE + '/walks/demo-walk-distanz-sonntag'); await snap(page, 'u-distance');
  // Einladung als neue Person
  const code = await (await page.request.get(BASE + `/api/v1/groups/${gid}/invite`)).json();
  console.log('Code', code.code);
  const ctx2 = await browser.newContext({ locale: 'de-DE', viewport: { width: 820, height: 1180 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + `/einladung/${code.code}`); await snap(p2, 'u-invite-anon');
  await p2.getByRole('link', { name: 'Anmelden und beitreten' }).click(); await p2.waitForTimeout(800);
  await login(p2, `gast${Date.now()}@example.org`, 'Gisela', true);
  console.log('nach Login Gast', p2.url());
  await p2.waitForTimeout(800); await snap(p2, 'u-invite-signedin');
  await p2.getByRole('button', { name: 'Gruppe beitreten' }).click(); await p2.waitForTimeout(1500);
  console.log('Gast in', p2.url(), await p2.locator('.toast').allTextContents());
  await browser.close();
})();
