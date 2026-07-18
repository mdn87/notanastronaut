import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, devices, type Page } from '@playwright/test';

const body = (page: Page) => page.locator('body');
const sections = (page: Page) => page.locator('main#content section');

test('list toggle from world mode switches to list mode and shows all sections', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');

  await expect(body(page)).toHaveAttribute('data-mode', 'world');
  await expect(page.locator('canvas#scene')).toBeVisible();

  await page.getByRole('link', { name: /\[\s*list\s*\]/i }).click();

  await expect(page).toHaveURL(/\/\?mode=list$/);
  await expect(body(page)).toHaveAttribute('data-mode', 'list');
  await expect(sections(page)).toHaveCount(6);
  await expect(page.locator('main#content')).toBeVisible();
});

test('reduced motion defaults to list mode', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(body(page)).toHaveAttribute('data-mode', 'list');
  await expect(sections(page)).toHaveCount(6);
  await expect(page.locator('canvas#scene')).toHaveCount(0);
});

test('reduced motion with explicit world opt-in still enters world mode', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?mode=world');

  await expect(body(page)).toHaveAttribute('data-mode', 'world');
  await expect(page.locator('canvas#scene')).toBeVisible();
});

test('list page passes an axe scan', async ({ page }) => {
  await page.goto('/?mode=list');

  await expect(body(page)).toHaveAttribute('data-mode', 'list');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('prerendered route serves content without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });

  try {
    const page = await context.newPage();
    const response = await page.goto('/missions/maker-bay/');

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('Maker Bay — Not An Astronaut');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://notanastronaut.com/missions/maker-bay',
    );
    await expect(page.locator('#maker-bay')).toContainText('Firmware, toolpaths');
    await expect(sections(page)).toHaveCount(6);
    await expect(page.locator('canvas#scene')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('home in world mode boots the spaceship world and HUD', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(body(page)).toHaveAttribute('data-mode', 'world');
  await expect(page.locator('canvas#scene')).toBeVisible();
  await expect(page.locator('.flight-telemetry')).toContainText(/GRID (OK|WRAP)/, { timeout: 10_000 }); // WASM init can take a moment

  for (const selector of ['.flight-minimap', '.flight-compass', '.flight-telemetry']) {
    await expect(page.locator(selector)).toBeVisible();
    await expect(page.locator(selector)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  }
  await expect(page.locator('.flight-readout')).toHaveCount(0);
});

test('desktop spaceship HUD keeps the compass bottom-centered with side instruments', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?mode=world');

  await expect(page.locator('.flight-telemetry')).toContainText(/GRID (OK|WRAP)/, { timeout: 10_000 });

  const geometry = await page.evaluate(() => {
    const read = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return { left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width };
    };
    return {
      viewportWidth: window.innerWidth,
      compass: read('.flight-compass'),
      minimap: read('.flight-minimap'),
      telemetry: read('.flight-telemetry'),
    };
  });

  expect(Math.abs((geometry.compass.left + geometry.compass.width / 2) - geometry.viewportWidth / 2)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.compass.bottom - geometry.minimap.bottom)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.compass.bottom - geometry.telemetry.bottom)).toBeLessThanOrEqual(2);
});

test('narrow world HUD keeps telemetry clear of the centered compass', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  for (const viewport of [
    { width: 320, height: 480 },
    { width: 375, height: 480 },
    { width: 521, height: 480 },
    { width: 768, height: 480 },
    { width: 769, height: 480 },
    { width: 800, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/?mode=world');
    await expect(body(page)).toHaveAttribute('data-mode', 'world');
    await expect(page.locator('.flight-speed')).toHaveText('0 u/s', { timeout: 10_000 });
    await expect(page.locator('.flight-compass')).toBeVisible();
    await expect(page.locator('.flight-telemetry')).toBeVisible();

    const geometry = await page.evaluate(() => {
      const read = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
      };
      const compass = read('.flight-compass');
      const telemetry = read('.flight-telemetry');
      return {
        viewportWidth: window.innerWidth,
        compass,
        telemetry,
        intersects: compass.left < telemetry.right && compass.right > telemetry.left
          && compass.top < telemetry.bottom && compass.bottom > telemetry.top,
      };
    });

    expect(Math.abs((geometry.compass.left + geometry.compass.width / 2) - geometry.viewportWidth / 2)).toBeLessThanOrEqual(1);
    expect(geometry.intersects).toBe(false);
  }
});

test('a mission deep-link renders the list surface (portfolio intact)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/missions/maker-bay'); // not the home route -> list
  await expect(body(page)).toHaveAttribute('data-mode', 'list');
  await expect(sections(page)).toHaveCount(6);
  await expect(page.locator('main#content')).toBeVisible();
});

test('world mode exposes a rendered canvas grid surface', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  const surface = page.locator('canvas#scene');
  await expect(surface).toBeVisible();
  const dimensions = await surface.evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    return {
      width: canvas.width,
      height: canvas.height,
      hasWebGLContext: Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')),
    };
  });
  expect(dimensions.width).toBeGreaterThan(0);
  expect(dimensions.height).toBeGreaterThan(0);
  expect(dimensions.hasWebGLContext).toBe(true);
});

test('rapier physics: holding W accelerates the dart, releasing glides it back to rest', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(page.locator('canvas#scene')).toBeVisible();

  const speed = page.locator('.flight-speed');
  await expect(speed).toHaveText('0 u/s', { timeout: 10_000 }); // wait for WASM init + HUD mount

  await page.locator('canvas#scene').click(); // focus the document for key events
  await page.keyboard.down('w');
  await expect(async () => {
    const txt = await speed.textContent();
    expect(parseInt(txt ?? '0', 10)).toBeGreaterThan(5);
  }).toPass({ timeout: 4000 });

  await page.keyboard.up('w');
  await expect(async () => {
    const txt = await speed.textContent();
    expect(parseInt(txt ?? '999', 10)).toBeLessThan(2);
  }).toPass({ timeout: 8000 });
});

test('collision: flying into the dot field perturbs the dart (it does not sail through cleanly)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(page.locator('canvas#scene')).toBeVisible();
  const speed = page.locator('.flight-speed');
  await expect(speed).toHaveText('0 u/s');

  await page.locator('canvas#scene').click();
  await page.keyboard.down('w');

  // Sample speed for ~4s at 100ms intervals (~40 samples). Open space => ramp up
  // then hold. A collision in the central field => a visible drop from the peak.
  // Sampling more frequently avoids missing a brief dip; threshold relaxed to >5
  // so a glancing hit still counts (clean flight maxDrop stays ~0).
  let peak = 0, maxDrop = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(100);
    const v = parseInt((await speed.textContent())?.replace(/[^\d-]/g, '') ?? '0', 10);
    peak = Math.max(peak, v);
    maxDrop = Math.max(maxDrop, peak - v);
  }
  await page.keyboard.up('w');
  expect(peak).toBeGreaterThan(5);     // it did accelerate
  expect(maxDrop).toBeGreaterThan(5);  // ...and a collision clearly perturbed the dart
});

test('barrel-roll dodge: a single D press side-steps the dart laterally', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(page.locator('canvas#scene')).toBeVisible();
  const xyz = page.locator('.flight-xyz');
  await page.locator('canvas#scene').click();
  // Wait until the physics loop is live (XYZ telemetry populated = key listeners attached),
  // so the single press can't race a still-booting world (heavier with a dense field).
  await expect(xyz).toHaveText(/X/, { timeout: 8000 });
  await page.keyboard.press('d'); // one barrel roll + side-step (no forward thrust)
  await expect(async () => {
    const x = parseInt((await xyz.textContent())?.match(/X\s*([+-]\d+)/)?.[1] ?? '0', 10);
    expect(Math.abs(x)).toBeGreaterThan(2); // dodged sideways from the lateral impulse
  }).toPass({ timeout: 3000 });
});

test.describe('mobile / coarse pointer', () => {
  const { defaultBrowserType: _unused, ...iphone13 } = devices['iPhone 13'];
  test.use(iphone13);
  test('falls back to the list surface (no free-fly without a fine pointer)', async ({ page }) => {
    await page.goto('/'); // default rules: coarse pointer -> list
    await expect(body(page)).toHaveAttribute('data-mode', 'list');
    await expect(sections(page)).toHaveCount(6);
    await expect(page.locator('main#content')).toBeVisible();
  });
});
