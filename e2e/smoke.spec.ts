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

test('dark mode: toggle rethemes the galaxy and persists across reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  await expect(page.locator('canvas#scene')).toBeVisible();
  await expect(page.locator('.hud-strip .status')).toContainText(/move/i, { timeout: 10_000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');

  await page.locator('.theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // The WebGL scene actually rethemes: dark-gray background dominates, warm (orange-family) pixels appear.
  const { darkBg, warm } = await page.evaluate(async () => {
    const c = document.getElementById('scene') as HTMLCanvasElement;
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext;
    const W = c.width, H = c.height;
    const px = new Uint8Array(W * H * 4);
    let darkBg = 0, warm = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let d = 0, w = 0;
      for (let p = 0; p < px.length; p += 4) {
        const r = px[p]!, g = px[p + 1]!, b = px[p + 2]!;
        // Dark theme's clear color (0x1e2125) round-trips through three.js's sRGB
        // output encoding to ~rgb(96,101,106) on readback — not literally near-black.
        // 150 sits with a wide margin above that and well below the light theme's
        // pure-white (255,255,255) corner, so it cleanly discriminates the two themes.
        if (r < 150 && g < 150 && b < 150) d++;
        if (r > 120 && r > b + 30) w++;
      }
      darkBg = Math.max(darkBg, d); warm = Math.max(warm, w);
    }
    return { darkBg, warm };
  });
  expect(darkBg).toBeGreaterThan(10_000);
  expect(warm).toBeGreaterThan(200);

  await page.reload(); // stored theme + pre-paint bootstrap + late obstacles under dark
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('canvas#scene')).toBeVisible();
});

test('nose-pointing: a coasting dart curves toward where you point', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?mode=world');
  const readout = page.locator('.flight-readout');
  await page.locator('canvas#scene').click();
  await expect(readout).toHaveText(/X/, { timeout: 8000 });

  // 800ms hold (not the full 1500ms a naive read of "coast from ~60 u/s" suggests):
  // src/core/field.ts seeds a deterministic "greeter" obstacle dead-ahead on the +z
  // spawn axis (z=130, radius 12 -> collides at z<~118). A 1500ms hold reaches maxSpeed
  // (80 u/s) and, with the residual coast before the drag's yaw redirects the heading,
  // rams that obstacle -- a real physics collision that stomps the velocity to near-zero
  // BEFORE the coast-curve phase even starts, unrelated to alignVelocity. 800ms keeps
  // the dart's peak Z in the high-80s, comfortably short of the obstacle.
  await page.keyboard.down('w');
  await page.waitForTimeout(800);
  await page.keyboard.up('w'); // coast from ~65 u/s

  const size = page.viewportSize()!;
  const cx = size.width / 2, cy = size.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 320, cy, { steps: 8 }); // drag right: yaw the nose ~90°
  await page.waitForTimeout(400);

  // Sampling window shortened from 1200/1500ms to 400/700ms: with linearDamping 0.8,
  // coast speed decays fast (time constant ~1.25s) -- by 1200ms post-drag the dart had
  // already decayed to single-digit u/s, so the ORIGINAL x1/x2 gap (taken at 1200ms and
  // 2700ms after the drag) sampled the plateaued tail of the curve and saw ~0 delta even
  // with the curving mechanism working correctly. Sampling at 400ms/1100ms instead
  // catches the dart while it still carries real speed (mid-20s u/s), where the momentum
  // curving onto the new heading is clearly visible.
  const xAt = async () => parseInt((await readout.textContent())?.match(/X\s*([+-]\d+)/)?.[1] ?? '0', 10);
  const x1 = await xAt();
  await page.waitForTimeout(700); // still coasting, no thrust keys
  const x2 = await xAt();
  await page.mouse.up();
  expect(Math.abs(x2 - x1)).toBeGreaterThan(4); // momentum curved onto the new heading without thrust
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
