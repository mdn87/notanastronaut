import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
const logs = [];
page.on('console', msg => logs.push(msg.type() + ': ' + msg.text()));
page.on('pageerror', err => errors.push(err.message));

await page.goto('http://localhost:4173/?mode=world');
await page.waitForTimeout(8000);

const bodyMode = await page.getAttribute('body', 'data-mode');
const hasCanvas = await page.locator('canvas#scene').count();
const hasFlightSpeed = await page.locator('.flight-speed').count();

console.log('body data-mode:', bodyMode);
console.log('canvas count:', hasCanvas);
console.log('flight-speed count:', hasFlightSpeed);
console.log('console logs:', JSON.stringify(logs.slice(0, 30), null, 2));
console.log('page errors:', errors);

await browser.close();
