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

test('home in world mode boots the free-fly galaxy canvas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(body(page)).toHaveAttribute('data-mode', 'world');
  await expect(page.locator('canvas#scene')).toBeVisible();
  await expect(page.locator('.hud-strip .status')).toContainText(/move/i, { timeout: 10_000 }); // WASM init can take a moment
});

test('a mission deep-link renders the list surface (portfolio intact)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/missions/maker-bay'); // not the home route -> list
  await expect(body(page)).toHaveAttribute('data-mode', 'list');
  await expect(sections(page)).toHaveCount(6);
  await expect(page.locator('main#content')).toBeVisible();
});

test('the world canvas actually renders the galaxy (non-blank)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(page.locator('canvas#scene')).toBeVisible();
  const darkPixels = await page.evaluate(async () => {
    const c = document.getElementById('scene') as HTMLCanvasElement;
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext;
    const W = c.width, H = c.height;
    const px = new Uint8Array(W * H * 4);
    let best = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let dark = 0;
      for (let p = 0; p < px.length; p += 4) if (px[p]! < 230 || px[p + 1]! < 230 || px[p + 2]! < 230) dark++;
      best = Math.max(best, dark);
    }
    return best;
  });
  expect(darkPixels).toBeGreaterThan(500);
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
  const readout = page.locator('.flight-readout');
  await page.locator('canvas#scene').click();
  // Wait until the physics loop is live (readout populated = key listeners attached),
  // so the single press can't race a still-booting world (heavier with a dense field).
  await expect(readout).toHaveText(/X/, { timeout: 8000 });
  await page.keyboard.press('d'); // one barrel roll + side-step (no forward thrust)
  await expect(async () => {
    const x = parseInt((await readout.textContent())?.match(/X\s*([+-]\d+)/)?.[1] ?? '0', 10);
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
