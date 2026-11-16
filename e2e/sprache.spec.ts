import { expect, test, type Page } from '@playwright/test';
import { setupRichUser } from './helpers';

/**
 * Stichprobe: keine Anglizismen in sichtbaren Texten und Beschriftungen (einfache Sprache, Leit-Persona).
 * „Walk“, „Premium“ und „GPX“ sind bewusst gewählte Begriffe und werden in der App erklärt.
 */
const FORBIDDEN = /\b(Leaderboard|Pace|Feeds?|Likes?|Liked|Uploads?|Upload(en|s)?|Recurring|Share[ds]?|Sharing|Login|Logout|Follower|Settings|Dashboard|Badges?|Streak|Tracking|Event)\b/i;

async function visibleText(page: Page) {
  return page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('[aria-label],[title],[placeholder],img[alt]'))
      .map((el) => [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('placeholder'), el.getAttribute('alt')].filter(Boolean).join(' '))
      .join('\n');
    return `${document.body.innerText}\n${labels}\n${document.title}`;
  });
}

function findings(text: string) {
  return text
    .split('\n')
    .filter((line) => FORBIDDEN.test(line))
    // E-Mail-Adressen und Links sind kein Fließtext
    .filter((line) => !/^https?:\/\/|@example\.org/.test(line.trim()));
}

test('Keine Anglizismen auf den Hauptseiten', async ({ browser }) => {
  test.setTimeout(120_000);
  const rich = await setupRichUser(browser);
  const ctx = await browser.newContext({ storageState: rich.storageState, locale: 'de-DE' });
  const page = await ctx.newPage();
  const paths = [
    '/',
    '/walks',
    `/walks/${rich.walkId}`,
    '/walks/neu',
    '/gruppen',
    '/gruppen/demo-group-karlsaue',
    '/gruppen/neu',
    `/gruppen/${rich.groupId}`,
    `/gruppen/${rich.groupId}/verwaltung`,
    `/gruppen/${rich.groupId}/aushang`,
    '/walk-eintragen',
    `/eintraege/${rich.activityId}`,
    '/abzeichen',
    `/challenges/${rich.challengeId}`,
    '/profil',
    '/personen/demo-user-renate',
    '/profil/nachrichten',
    '/in-der-naehe',
    '/premium',
    '/fortschritt',
    '/profil/einstellungen',
    '/wer-sieht-was',
    '/datenschutz',
    '/hilfe',
  ];
  const report: string[] = [];
  for (const p of paths) {
    await page.goto(p);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(page.getByText('Wird geladen …')).toHaveCount(0);
    for (const line of findings(await visibleText(page))) report.push(`${p}: ${line.trim().slice(0, 120)}`);
  }
  // Wahlmöglichkeit „GPX-Datei hochladen“ öffnen (Texte dazu prüfen)
  await page.goto('/walk-eintragen');
  await page.getByRole('radio', { name: /GPX-Datei hochladen/ }).check();
  for (const line of findings(await visibleText(page))) report.push(`/walk-eintragen (GPX): ${line.trim().slice(0, 120)}`);
  await ctx.close();
  expect(report, report.join('\n')).toEqual([]);
});

test('Keine Anglizismen ohne Anmeldung', async ({ page }) => {
  const report: string[] = [];
  for (const p of ['/', '/anmelden', '/walks', '/gruppen', '/einladung/WALK-KARLSA', '/premium', '/impressum']) {
    await page.goto(p);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    for (const line of findings(await visibleText(page))) report.push(`${p}: ${line.trim().slice(0, 120)}`);
  }
  expect(report, report.join('\n')).toEqual([]);
});
