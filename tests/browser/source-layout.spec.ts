import { expect, test } from '@playwright/test';
import browserPages from '../fixtures/browser-pages.json' with { type: 'json' };

for (const { path, language, excerpt } of [
  { path: browserPages.vpc, language: 'run-python', excerpt: '겹치는 Subnet:' },
  { path: browserPages.fsync, language: 'gdb', excerpt: 'break inode_write_at' },
]) {
  for (const javaScriptEnabled of [true, false]) {
    test(`@core ${language} source stays readable after resize with JavaScript ${javaScriptEnabled}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 1440, height: 900 } });
      try {
        const page = await context.newPage();
        await page.route('**/assets/js/runnable/**', route => route.abort());
        await page.goto(`${baseURL}${path}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
        await page.setViewportSize({ width: 375, height: 812 });
        const source = page.locator(`pre > code.language-${language}`);
        await expect(source).toContainText(excerpt);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
        await source.scrollIntoViewIfNeeded();
        const pre = source.locator('..');
        const sourceOffset = () => source.evaluate(element =>
          element.getBoundingClientRect().left - element.parentElement!.getBoundingClientRect().left);
        const beforeOffset = await sourceOffset();
        // Retry the real gesture while scrolling settles after the viewport change.
        await expect.poll(async () => {
          await pre.hover();
          await page.mouse.wheel(2000, 0);
          return sourceOffset();
        }).toBeLessThan(beforeOffset - 1);
        await expect(page.locator('.rcb')).toHaveCount(0);
      } finally { await context.close(); }
    });
  }
}
