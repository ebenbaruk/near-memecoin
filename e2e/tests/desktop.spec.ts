import { test, expect, shot, open, NOW } from '../lib/fixtures';
import { NEAR, ONE } from '../lib/mock';

async function burner(page: import('@playwright/test').Page) {
  await page.getByTestId('try-no-wallet').click();
  await expect(page.getByTestId('account-id')).toBeVisible();
  return (await page.getByTestId('account-id').getAttribute('title'))!;
}

const vp = (page: import('@playwright/test').Page) => page.viewportSize()!;

for (const zone of ['locked', 'cold', 'warm', 'live'] as const) {
  test(`game fits one screen, ${zone}`, async ({ page, m }) => {
    m.setZone(zone);
    await open(page);
    await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', zone);
    await page.waitForTimeout(800);
    const { width, height } = vp(page);
    const size = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth }));
    expect(size.h, 'no vertical scroll').toBeLessThanOrEqual(height);
    expect(size.w, 'no horizontal scroll').toBeLessThanOrEqual(width);
    for (const id of ['gap-gauge', 'the-sum', 'rail', 'dock-buy', 'dock-sell', 'dock-rug', zone === 'live' ? 'rug-sheet' : 'buy-sheet', 'next-line', 'live-log', 'nav-judges']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.y + box!.height, `${id} inside the viewport`).toBeLessThanOrEqual(height);
      expect(box!.x + box!.width, `${id} inside the viewport`).toBeLessThanOrEqual(width);
    }
    const rail = await page.getByTestId('rail').evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(rail, 'the sidebar does not need its own scroll').toBeLessThanOrEqual(1);
    await expect(page.locator('.bottomnav')).toHaveCount(0);
    await expect(page.locator('.sheet-root')).toHaveCount(0);
    const clipped = await page.locator('.desk-head h1, .desk-head p').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));
    expect(clipped, 'title is not cut').toEqual([]);
    await shot(page, `d${width}-play-${zone}`);
  });
}

test('pot, rug price and the take add up on screen', async ({ page, m }) => {
  m.setZone('warm');
  await open(page);
  await expect(page.getByTestId('pot-value')).toHaveText('0.660');
  await expect(page.getByTestId('rug-price-value')).toHaveText('0.806');
  await expect(page.getByTestId('gap-value')).toHaveText('-0.146');
  await expect(page.getByTestId('gap-zone')).toHaveText('Getting close.');
  await expect(page.getByTestId('the-sum')).toContainText('The contract calls this the gap.');
  await expect(page.getByTestId('explainer')).toContainText('Every trade adds 2% to the pot.');
  await expect(page.getByTestId('disclosure-short')).toContainText('Testnet only.');
  await expect(page.getByTestId('round-number')).toHaveText('4');
});

test('trade inline: quote, sign, the journal line prints', async ({ page, m }) => {
  m.setZone('cold');
  await open(page);
  await expect(page.getByTestId('buy-sheet')).toBeVisible();
  const id = await burner(page);
  await page.getByTestId('buy-amount').fill('0.5');
  await expect(page.getByTestId('buy-quote-tokens')).toContainText('25,000');
  m.nextTx = { hash: 'BuyTxDesk1', effect: (mm) => mm.pushEntry('buy', id, 25000n * ONE, NEAR / 2n, NOW) };
  await page.getByTestId('buy-submit').click();
  await expect(page.getByTestId('buy-submit')).toHaveText('Done');
  await expect(page.getByTestId('tx-printed')).toContainText('MINT');
  await expect(page.getByTestId('live-log-row').first()).toContainText('MINT');
  await shot(page, `d${vp(page).width}-buy-done`);
  await page.getByTestId('trade-again').click();
  await expect(page.getByTestId('buy-amount')).toHaveValue('');
  await page.getByTestId('dock-sell').click();
  await expect(page.getByTestId('sell-sheet')).toBeVisible();
  await expect(page.getByTestId('buy-sheet')).toHaveCount(0);
});

test('rug inline: quote, hold, climax, next round', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('dock-rug').click();
  await expect(page.getByTestId('rug-sheet')).toBeVisible();
  const id = await burner(page);
  await expect(page.getByTestId('rug-net')).toContainText('+0.394');
  await expect(page.getByTestId('rug-hold')).toBeEnabled();
  const { height } = vp(page);
  const hold = (await page.getByTestId('rug-hold').boundingBox())!;
  expect(hold.y + hold.height, 'the hold button is on screen').toBeLessThanOrEqual(height);
  await shot(page, `d${vp(page).width}-rug-ready`);
  m.nextTx = { hash: 'RugDesk1', effect: (mm) => mm.rugBy(id, NOW) };
  await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2200);
  await page.mouse.up();
  await expect(page.getByTestId('rug-climax')).toBeVisible();
  await expect(page.getByTestId('rug-climax-winner')).toHaveText('YOU RUGGED IT', { timeout: 6000 });
  await expect(page.getByTestId('rug-climax-next')).toBeVisible({ timeout: 8000 });
  await page.getByTestId('rug-climax-next').click();
  await expect(page.getByTestId('rug-climax')).toHaveCount(0);
  await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', 'locked');
  await expect(page.getByTestId('buy-sheet')).toBeVisible();
});

test('spectator climax and the race lost screen', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('dock-rug').click();
  await burner(page);
  await expect(page.getByTestId('rug-hold')).toBeEnabled();
  m.rugBy('someone.testnet', NOW);
  await expect(page.getByTestId('race-lost')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('race-lost-new-round').click();
  await expect(page.getByTestId('race-lost')).toHaveCount(0);
  m.setZone('live');
  m.rugBy('bot-3.acr-bots.testnet', NOW);
  await expect(page.getByTestId('rug-climax')).toBeVisible({ timeout: 15000 });
});

for (const [name, hash, id] of [
  ['landing', '#/', 'landing'],
  ['wall', '#/wall', 'rug-wall'],
  ['log', '#/log', 'journal'],
  ['rules', '#/proof/rules', 'proof-tab-rules'],
  ['sim', '#/proof/sim', 'sim-assumption-banner'],
  ['verify', '#/proof/verify', 'proof-tab-verify'],
] as const) {
  test(`${name}: full width, top navigation`, async ({ page, m }) => {
    m.setZone('warm');
    await open(page, hash);
    await expect(page.getByTestId(id)).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('nav-judges')).toBeVisible();
    await expect(page.locator('.bottomnav')).toHaveCount(0);
    const main = await page.locator('main').first().boundingBox();
    expect(main!.width, 'the page uses the whole width').toBeGreaterThanOrEqual(vp(page).width - 1);
    await shot(page, `d${vp(page).width}-${name}`);
  });
}

test('top navigation reaches every route', async ({ page, m }) => {
  m.setZone('cold');
  await open(page);
  for (const [nav, id] of [['wall', 'rug-wall'], ['log', 'journal'], ['proof', 'proof-tab-rules'], ['pot', 'gap-gauge'], ['home', 'landing']] as const) {
    await page.getByTestId(`nav-${nav}`).click();
    await expect(page.getByTestId(id)).toBeVisible();
  }
});

test('the page paints before the art manifest arrives', async ({ page, m }) => {
  m.setZone('cold');
  let release = () => {};
  const hold = new Promise<void>((r) => (release = r));
  await page.route('**/art/manifest.json', async (route) => { await hold; await route.fallback(); });
  await open(page);
  await expect(page.getByRole('heading', { name: /STEAL THIS POT/ })).toBeVisible();
  await expect(page.getByTestId('pot-value')).toHaveText('0.200');
  release();
  await expect(page.getByTestId('gap-zone')).toBeVisible();
});

test.describe('failures', () => {
  test.use({ allowConsole: ['Failed to load resource'] });
  test('rpc down: frozen copy, actions disabled', async ({ page, m }) => {
    m.down = true;
    await open(page);
    await expect(page.getByTestId('frozen-copy-banner')).toBeVisible();
    await expect(page.getByTestId('dock-buy')).toBeDisabled();
    await expect(page.getByTestId('dock-rug')).toBeDisabled();
    await shot(page, `d${vp(page).width}-rpc-down`);
  });
});

test('rug tab, locked: the button says so, no loss warning, nothing scrolls', async ({ page, m }) => {
  m.setZone('locked');
  await open(page);
  await page.getByTestId('dock-rug').click();
  await expect(page.getByTestId('rug-hold')).toContainText('Locked until 0.05 NEAR');
  await expect(page.getByTestId('rug-hold')).toBeDisabled();
  await expect(page.getByTestId('rug-loss-warning')).toHaveCount(0);
  const over = await page.locator('.console-body').evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(over).toBeLessThanOrEqual(1);
});

test('the Next line acts: the throwaway account, then the buy tab', async ({ page, m }) => {
  m.setZone('locked');
  await open(page);
  await expect(page.getByTestId('next-line')).toContainText('get a free throwaway account');
  await page.getByTestId('next-line').click();
  await expect(page.getByTestId('next-line')).toContainText('of trading unlocks the pot', { timeout: 8000 });
  await page.getByTestId('dock-sell').click();
  await page.getByTestId('next-line').click();
  await expect(page.getByTestId('buy-sheet')).toBeVisible();
});

test('climax end: the buttons stay clear of the stamp', async ({ page, m }) => {
  m.setZone('live');
  await page.goto('/?i=fast&replay=1#/play');
  await page.getByTestId('rug-climax-skip').click({ timeout: 15000 });
  await expect(page.getByTestId('rug-climax-share')).toBeVisible();
  const stamp = (await page.locator('.climax-rugged').boundingBox())!;
  const share = (await page.getByTestId('rug-climax-share').boundingBox())!;
  const next = (await page.getByTestId('rug-climax-next').boundingBox())!;
  expect(share.x).toBeGreaterThanOrEqual(stamp.x + stamp.width);
  expect(share.height).toBe(next.height);
  expect(next.x - (share.x + share.width)).toBe(16);
});
