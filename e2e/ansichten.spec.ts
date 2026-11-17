import { expect, test as base, type Page } from '@playwright/test';
import { expectNoA11yViolations, expectNoHorizontalScroll, setupRichUser, type RichUser } from './helpers';

/**
 * Läuft in den Projekten „laptop“, „zoom-200“ (640 CSS-px ≙ 200 % Zoom) und „tablet“ (820×1180):
 * kein waagerechtes Scrollen, Hauptnavigation immer sichtbar, Klickflächen ≥ 44×44 px.
 */
let rich: RichUser;

const test = base.extend<{ page: Page }>({
  page: async ({ browser, page, viewport, hasTouch }, use, info) => {
    if (!info.titlePath.some((t) => t.includes('angemeldet'))) return use(page);
    const ctx = await browser.newContext({ storageState: rich.storageState, viewport, hasTouch, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
    const p = await ctx.newPage();
    await use(p);
    await ctx.close();
  },
});

async function ready(page: Page) {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByText('Wird geladen …')).toHaveCount(0);
  await page.waitForTimeout(300); // Bilder/Schriften setzen sich
}

/** Hauptknöpfe (.btn) und Navigationspunkte: mindestens 44×44 px. */
async function expectTargetSizes(page: Page) {
  const small = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('main .btn, main button, nav a, main [role=tab], main input[type=checkbox], main input[type=radio]'));
    return els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false; // unsichtbar
        // Auswahlfelder zählen mit ihrer ganzen Beschriftung als Klickfläche
        const target = el.matches('input') ? (el.closest('label') ?? el) : el;
        const t = target.getBoundingClientRect();
        return t.width < 44 || t.height < 44;
      })
      .map((el) => {
        const target = el.matches('input') ? (el.closest('label') ?? el) : el;
        const t = target.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}.${el.className} „${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)}“ ${Math.round(t.width)}×${Math.round(t.height)}`;
      });
  });
  expect(small, `Zu kleine Klickflächen auf ${page.url()}:\n${small.join('\n')}`).toEqual([]);
}

async function expectMainNav(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  const links = nav.getByRole('link');
  await expect(links).toHaveCount(5);
  for (const l of await links.all()) {
    await expect(l).toBeVisible();
    await expect(l).toBeInViewport();
  }
}

test.describe('angemeldet', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async ({ browser }) => {
    rich = await setupRichUser(browser);
  });

  const pages: [string, () => string][] = [
    ['Start', () => '/'],
    ['Walks', () => '/walks'],
    ['Walk-Detail', () => `/walks/${rich.walkId}`],
    ['Walk-Formular', () => '/walks/neu'],
    ['Gruppen', () => '/gruppen'],
    ['Gruppen-Detail', () => '/gruppen/demo-group-karlsaue'],
    ['Gruppenverwaltung', () => `/gruppen/${rich.groupId}/verwaltung`],
    ['Walk eintragen', () => '/walk-eintragen'],
    ['Vitrine', () => '/abzeichen'],
    ['Profil', () => '/profil'],
    ['In der Nähe', () => '/in-der-naehe'],
    ['Fortschritt', () => '/fortschritt'],
    ['Einstellungen', () => '/profil/einstellungen'],
    ['Wer sieht was', () => '/wer-sieht-was'],
  ];

  for (const [name, path] of pages) {
    test(`${name}: kein waagerechtes Scrollen, Navigation sichtbar, Klickflächen`, async ({ page }) => {
      await page.goto(path());
      await ready(page);
      await expectNoHorizontalScroll(page);
      await expectMainNav(page);
      await expectTargetSizes(page);
    });
  }

  test('Walks – Karte passt in die Breite', async ({ page }) => {
    await page.goto('/walks');
    await ready(page);
    await page.getByRole('tab', { name: 'Karte' }).click();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('Schriftgröße „Sehr groß“: weiterhin kein waagerechtes Scrollen', async ({ page }) => {
    await page.goto('/profil/einstellungen');
    await ready(page);
    // Die Auswahl wird über den gemeinsamen Zustand gesetzt (einen Takt später) – daher click() + Prüfung
    await page.getByRole('radio', { name: 'Sehr groß' }).click();
    await expect(page.getByRole('radio', { name: 'Sehr groß' })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-font', 'sehr-gross');
    for (const p of ['/', '/walks', `/walks/${rich.walkId}`, '/walk-eintragen', '/abzeichen', '/gruppen/demo-group-karlsaue']) {
      await page.goto(p);
      await ready(page);
      await expectNoHorizontalScroll(page);
      await expectMainNav(page);
    }
    await page.goto('/profil/einstellungen');
    await ready(page);
    await page.getByRole('radio', { name: 'Normal' }).click();
    await expect(page.getByRole('radio', { name: 'Normal' })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-font', 'normal');
  });

  test('Bestätigung (Toast) verdeckt weder Kopf noch untere Navigation; Seitenwechsel räumt auf', async ({ page }) => {
    await page.goto('/profil/einstellungen');
    await ready(page);
    await page.getByRole('radio', { name: 'Groß', exact: true }).click();
    const toast = page.locator('.toast').filter({ hasText: /gespeichert/ }).first();
    await expect(page.getByRole('status').filter({ hasText: /gespeichert/ }).first()).toBeVisible();
    await expect(toast).toBeVisible();
    await page.waitForTimeout(300); // Kopfhöhe nach Schriftwechsel neu gemessen
    const header = await page.locator('.app-header').boundingBox();
    const box = await toast.boundingBox();
    expect(header && box).toBeTruthy();
    // unterhalb des Kopfes (keine Überlappung)
    expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    // und nicht über der Hauptnavigation (am schmalen Bildschirm unten fest)
    const nav = await page.getByRole('navigation', { name: 'Hauptnavigation' }).boundingBox();
    const overlaps = box!.x < nav!.x + nav!.width && nav!.x < box!.x + box!.width && box!.y < nav!.y + nav!.height && nav!.y < box!.y + box!.height;
    expect(overlaps).toBe(false);

    // Zurück auf „Normal“ – höchstens 2 Meldungen gleichzeitig
    await page.getByRole('radio', { name: 'Normal' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-font', 'normal');
    expect(await page.locator('.toast').count()).toBeLessThanOrEqual(2);
    // Seitenwechsel: alte Meldungen verschwinden
    await page.waitForTimeout(1600);
    await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Start' }).click();
    await ready(page);
    await expect(page.locator('.toast')).toHaveCount(0);
  });

  test('axe in dieser Ansicht: Start, Walk-Detail, Walk eintragen', async ({ page }) => {
    for (const p of ['/', `/walks/${rich.walkId}`, '/walk-eintragen']) {
      await page.goto(p);
      await ready(page);
      await expectNoA11yViolations(page);
    }
  });
});

test.describe('abgemeldet', () => {
  for (const path of ['/anmelden', '/', '/premium', '/einladung/WALK-KARLSA']) {
    test(`${path}: kein waagerechtes Scrollen, Klickflächen`, async ({ page }) => {
      await page.goto(path);
      await ready(page);
      await expectNoHorizontalScroll(page);
      await expectTargetSizes(page);
    });
  }
});

test('Ansicht hat die erwartete Breite', async ({ page }, info) => {
  await page.goto('/anmelden');
  const w = await page.evaluate(() => window.innerWidth);
  const expected = { laptop: 1366, 'zoom-200': 640, tablet: 820 }[info.project.name];
  expect(w).toBe(expected);
});
