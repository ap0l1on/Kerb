import { test } from '@playwright/test';

test('screenshot sandline', async ({ page }) => {
  await page.goto('/');
  await page.click('text=PLAY');
  await page.click('.card[data-id="canyon-1"]');
  await page.waitForTimeout(4500); // sweep + countdown + driving
  await page.keyboard.down('w');
  await page.waitForTimeout(2500);
  await page.keyboard.up('w');
  await page.screenshot({ path: '/tmp/kerb-sandline.png' });
});
