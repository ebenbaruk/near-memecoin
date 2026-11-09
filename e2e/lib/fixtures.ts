import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Page } from '@playwright/test';
import { installChain, MockChain } from './mock';

export const NOW = new Date('2026-11-16T12:00:00Z').getTime();
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-results', 'shots');

export interface Options {
  /** console.error text fragments allowed in this test (RPC failure tests only). */
  allowConsole: string[];
}

export const test = base.extend<Options & { m: MockChain }>({
  allowConsole: [[], { option: true }],
  m: async ({ page, allowConsole }, use) => {
    const m = new MockChain();
    m.state._contract = 'rc1.acr-ops.testnet';
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !allowConsole.some((f) => msg.text().includes(f))) consoleErrors.push(msg.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.clock.setFixedTime(NOW);
    await installChain(page, m);
    await use(m);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw, 'horizontal overflow').toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(pageErrors, 'page errors').toEqual([]);
    expect(consoleErrors, 'console errors').toEqual([]);
  },
});

export { expect };

export async function shot(page: Page, name: string, opts: { allowAnimations?: boolean; fullPage?: boolean } = {}) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), animations: opts.allowAnimations ? 'allow' : 'disabled', fullPage: opts.fullPage });
}

/** The game is at #/play; #/ is the landing page. */
export async function open(page: Page, hash = '#/play') {
  await page.goto(`/?i=fast${hash}`);
}

export async function expectTargets(page: Page) {
  const small = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, a[href], summary, input')) {
      const label = el.tagName === 'INPUT' ? el.closest('label') : null;
      const r = (label ?? el).getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      if (r.height < 44 && el.getAttribute('aria-hidden') !== 'true') out.push(`${el.tagName}.${el.className} "${el.textContent?.slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      else if (r.width < 44) out.push(`${el.tagName}.${el.className} "${el.textContent?.slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  expect(small, 'touch targets').toEqual([]);
}
