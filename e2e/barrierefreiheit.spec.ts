import { expect, test as base, type Page } from '@playwright/test';
import { expectNoA11yViolations, expectNoHorizontalScroll, setupRichUser, type RichUser } from './helpers';

/**
 * axe (WCAG 2.2 A/AA) auf jeder Hauptseite – angemeldet mit gefülltem Konto und abgemeldet.
 * Zusätzlich: jede Seite hat genau eine Hauptüberschrift und die Hauptnavigation mit 5 Punkten.
 */

async function ready(page: Page, h1?: RegExp | string) {
  const heading = page.getByRole('heading', { level: 1 });
  if (h1) await expect(heading.filter({ hasText: h1 }).first()).toBeVisible();
  else await expect(heading.first()).toBeVisible();
  await expect(page.getByText('Wird geladen …')).toHaveCount(0);
  await expect(heading).toHaveCount(1);
}

let rich: RichUser;

/** `page` ist im Block „angemeldet“ die vorbereitete Person (Sitzung aus `setupRichUser`). */
const test = base.extend<{ page: Page }>({
  page: async ({ browser, page }, use, info) => {
    if (!info.titlePath.includes('angemeldet')) return use(page);
    const ctx = await browser.newContext({ storageState: rich.storageState, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
    const p = await ctx.newPage();
    await use(p);
    await ctx.close();
  },
});

test.describe('angemeldet', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async ({ browser }) => {
    rich = await setupRichUser(browser);
  });

  const pages: [name: string, path: () => string, h1?: RegExp | string][] = [
    ['Start (angemeldet)', () => '/', /Hallo Erika/],
    ['Walks – Liste', () => '/walks', 'Walks in Ihrer Nähe'],
    ['Walk-Detail (Mitglied, zugesagt)', () => `/walks/${rich.walkId}`],
    ['Walk-Formular', () => '/walks/neu', 'Neuen Walk-Termin anlegen'],
    ['Walk drucken', () => `/walks/${rich.walkId}/drucken`],
    ['Gruppen', () => '/gruppen'],
    ['Gruppen-Detail (Mitglied)', () => '/gruppen/demo-group-karlsaue', 'Morgenrunde Karlsaue'],
    ['Gruppen-Detail (Leitung)', () => `/gruppen/${rich.groupId}`, /Prüfgruppe/],
    ['Gruppe gründen', () => '/gruppen/neu', 'Gruppe gründen'],
    ['Gruppe bearbeiten', () => `/gruppen/${rich.groupId}/bearbeiten`],
    ['Gruppenverwaltung', () => `/gruppen/${rich.groupId}/verwaltung`, 'Gruppe verwalten'],
    ['Aushang', () => `/gruppen/${rich.groupId}/aushang`, /Prüfgruppe/],
    ['Einladung (angemeldet)', () => '/einladung/WALK-WESTEN', 'Sie sind eingeladen!'],
    ['Walk eintragen', () => '/walk-eintragen', 'Walk eintragen'],
    ['Eingetragener Walk', () => `/eintraege/${rich.activityId}`],
    ['Vitrine', () => '/abzeichen', 'Meine Vitrine'],
    ['Mitmach-Aktion', () => `/challenges/${rich.challengeId}`],
    ['Profil', () => '/profil', 'Mein Profil'],
    ['Person', () => '/personen/demo-user-renate', 'Renate'],
    ['Nachrichten', () => '/profil/nachrichten'],
    ['In der Nähe', () => '/in-der-naehe', 'Keine Gruppe in der Nähe?'],
    ['Premium (aktiv)', () => '/premium', 'Premium'],
    ['Fortschritt (Premium)', () => '/fortschritt', 'Mein Fortschritt'],
    ['Einstellungen', () => '/profil/einstellungen', 'Einstellungen'],
    ['Wer sieht was', () => '/wer-sieht-was'],
    ['Datenschutz', () => '/datenschutz'],
    ['Impressum', () => '/impressum'],
    ['Hilfe', () => '/hilfe'],
    ['Seite nicht gefunden', () => '/gibt-es-nicht'],
  ];

  for (const [name, path, h1] of pages) {
    test(`axe: ${name}`, async ({ page }) => {
      await page.goto(path());
      await ready(page, h1);
      await expectNoA11yViolations(page);
    });
  }

  test('axe: Walks – Karte', async ({ page }) => {
    await page.goto('/walks');
    await ready(page);
    await page.getByRole('tab', { name: 'Karte' }).click();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('axe: Erfolgsseite nach dem Eintragen', async ({ page }) => {
    await page.goto('/walk-eintragen');
    const form = page.getByRole('form', { name: 'Angaben zu Ihrem Walk' });
    await form.getByRole('textbox', { name: 'Minuten' }).fill('40');
    await form.getByLabel('Strecke in Kilometern').fill('3,1');
    await form.getByRole('button', { name: 'Walk speichern' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Geschafft – 3,1 km!' })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('320 CSS-Pixel Breite (400 % Zoom): kein waagerechtes Scrollen, Navigation vollständig', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 320, height: 640 });
    for (const [, path] of pages) {
      await page.goto(path());
      await ready(page);
      await expectNoHorizontalScroll(page);
      const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
      for (const l of await nav.getByRole('link').all()) {
        const b = (await l.boundingBox())!;
        expect(b.x, `${path()}: Navigationspunkt links abgeschnitten`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, `${path()}: Navigationspunkt rechts abgeschnitten`).toBeLessThanOrEqual(320);
      }
    }
  });

  test('Hauptnavigation: genau 5 Punkte mit Text, aktuelle Seite markiert', async ({ page }) => {
    await page.goto('/gruppen');
    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
    const links = nav.getByRole('link');
    await expect(links).toHaveCount(5);
    await expect(links).toHaveText(['Start', 'Walks', 'Gruppen', 'Abzeichen', 'Profil']);
    for (const l of await links.all()) {
      await expect(l.locator('svg')).toHaveCount(1); // Symbol UND Text
      const box = await l.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await expect(nav.getByRole('link', { name: 'Gruppen' })).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('abgemeldet', () => {
  const pages: [string, string, (RegExp | string)?][] = [
    ['Start (abgemeldet)', '/'],
    ['Anmelden', '/anmelden', 'Anmelden'],
    ['Walks (abgemeldet)', '/walks', 'Walks in Ihrer Nähe'],
    ['Gruppen (abgemeldet)', '/gruppen'],
    ['Gruppen-Detail (abgemeldet)', '/gruppen/demo-group-karlsaue', 'Morgenrunde Karlsaue'],
    ['Einladung (abgemeldet)', '/einladung/WALK-KARLSA', 'Sie sind eingeladen!'],
    ['Einladung ungültig', '/einladung/WALK-GIBTSNICHT', 'Einladung nicht mehr gültig'],
    ['Premium (abgemeldet)', '/premium', 'Premium'],
    ['Wer sieht was (abgemeldet)', '/wer-sieht-was'],
    ['Hilfe (abgemeldet)', '/hilfe'],
  ];
  for (const [name, path, h1] of pages) {
    test(`axe: ${name}`, async ({ page }) => {
      await page.goto(path);
      await ready(page, h1);
      await expectNoA11yViolations(page);
    });
  }

  test('axe: Walk-Detail (abgemeldet)', async ({ page }) => {
    const r = await page.request.get('/api/v1/walks?postalCode=34117').then((x) => x.json());
    await page.goto(`/walks/${r.walks[0].id}`);
    await ready(page);
    await expect(page.getByRole('link', { name: 'Anmelden und zusagen' })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
