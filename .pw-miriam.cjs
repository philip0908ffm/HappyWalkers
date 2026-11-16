// Vorübergehendes Prüfskript (Miriam) – wird am Ende gelöscht.
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-user-HappyWalkers/62baa3c4-ec4a-50f2-87d9-f63ab1a8e36d/scratchpad';
const BASE = 'http://localhost:5201';
const LOG = SP + '/server.log';
const only = process.argv[2];

async function axe(page, name) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  for (const v of r.violations) console.log(`AXE ${name}: ${v.id} – ${v.help} :: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}
async function noHScroll(page, name) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  if (w[0] > w[1]) console.log(`HSCROLL ${name}: ${w[0]} > ${w[1]}`);
}
async function shot(page, name, path, vps = [[1366, 768], [640, 900], [820, 1180]]) {
  for (const [w, h] of vps) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(BASE + path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SP}/shots/${name}-${w}.png`, fullPage: true });
    await noHScroll(page, `${name}-${w}`);
    if (w === 1366) await axe(page, name);
  }
}
async function login(page, email) {
  await page.goto(BASE + '/anmelden');
  await page.getByLabel('Ihre E-Mail-Adresse').fill(email);
  await page.getByRole('button', { name: 'Anmelde-Link senden' }).click();
  await page.waitForTimeout(1500);
  const log = fs.readFileSync(LOG, 'utf8');
  const links = [...log.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]).filter((u) => u.includes('magic-link') || u.includes('token'));
  const link = links.at(-1);
  await page.goto(link.replace('http://localhost:5201', BASE).replace('http://localhost:3201', BASE));
  await page.waitForTimeout(1500);
  if (page.url().includes('/willkommen')) {
    await page.getByLabel('Wie dürfen wir Sie nennen?').fill('Erika');
    await page.getByLabel('Ihre Postleitzahl').fill('34117');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Los geht/ }).click();
    await page.waitForTimeout(1500);
  }
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('401') && console.log('CONSOLE', m.text().slice(0, 200)));
  const anon = [
    ['home-anon', '/'],
    ['walks-list', '/walks?plz=34117'],
    ['walks-map', '/walks?plz=34117&ansicht=karte'],
    ['groups-anon', '/gruppen?plz=34117'],
    ['group-anon', '/gruppen/demo-group-karlsaue'],
  ];
  if (!only || only === 'anon') for (const [n, p] of anon) await shot(page, n, p);
  if (only === 'anon') return browser.close();
  await login(page, process.env.EMAIL || 'erika.m@example.org');
  console.log('URL nach Login', page.url());
  const steps = (process.env.STEPS || 'home').split(',');
  for (const s of steps) {
    const [n, p] = s.split('=');
    await shot(page, n, p || '/');
  }
  await browser.close();
})();
