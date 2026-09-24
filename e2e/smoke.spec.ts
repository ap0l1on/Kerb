import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

test('title opens track select, which opens Sandline', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('.wordmark')).toBeVisible();
  await page.click('text=PLAY');
  await expect(page.locator('.group-label').first()).toBeVisible();
  await page.click('.card[data-id="canyon-1"]');
  await expect(page.locator('#hud .timer')).toBeVisible();
  await page.waitForTimeout(2500);
  expect(errors.filter((e) => !e.includes('cloudflare') && !e.includes('net::'))).toEqual([]);
});

test('R restarts the run', async ({ page }) => {
  await page.goto('/');
  await page.click('text=PLAY');
  await page.click('.card[data-id="canyon-1"]');
  await page.waitForTimeout(3000); // sweep + countdown
  const t1 = await page.locator('#hud .timer').textContent();
  await page.waitForTimeout(1500);
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  const t2 = await page.locator('#hud .timer').textContent();
  expect(t1).not.toBeNull();
  expect(t2).not.toBeNull();
});

test('challenge link loads a ghost, broken link warns', async ({ page }) => {
  await page.goto('/#t=canyon-1&g=broken!!');
  await expect(page.locator('#toast')).toContainText('This challenge link is broken');
  await expect(page.locator('#hud')).toBeVisible();
});

test('challenge link with a real ghost loads it', async ({ page }) => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const code = readFileSync(join(root, 'public', 'ghosts', 'canyon-1.kghost'), 'utf8').trim();
  await page.goto(`/#t=canyon-1&g=${code}`);
  await expect(page.locator('#toast')).toContainText("Racing a friend's", { timeout: 15000 });
  await expect(page.locator('#hud')).toBeVisible();
});

test('mobile gate shows at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#gate')).toBeVisible();
  await expect(page.locator('#gate')).toContainText('made for keyboards');
});
