import { test, expect, shot, open, expectTargets, NOW } from '../lib/fixtures';

const THREE = ['Every trade drops 2% into the pot.', 'and the whole pot is yours.', "Anyone can. Right now. That's the coin."];

test('first visit: pot, price, 3 lines visible without clicking, disclosure', async ({ page, m }) => {
  m.setZone('cold');
  await open(page);
  await expect(page.getByTestId('instance-banner')).toContainText('FAST DEMO INSTANCE');
  await expect(page.getByRole('heading', { name: /STEAL THIS POT/ })).toContainText('NEAR.');
  await expect(page.getByTestId('pot-value')).toHaveText('0.200');
  await expect(page.getByTestId('rug-price-value')).toHaveText('0.800');
  for (const line of THREE) await expect(page.getByTestId('explainer')).toContainText(line);
  await expect(page.getByTestId('disclosure-short')).toContainText('Testnet only.');
  await expect(page.getByTestId('round-number')).toHaveText('4');
  await page.waitForTimeout(1000);
  await expectTargets(page);
  await shot(page, '01-pot-cold');
});

test('first screen fits 390x664', async ({ page, m }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  m.setZone('warm');
  await open(page);
  await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', 'warm');
  await page.waitForTimeout(1000);
  for (const id of ['instance-banner', 'gap-gauge', 'last-event', 'dock-buy', 'dock-rug', 'nav-proof']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.y + box!.height, `${id} inside 664`).toBeLessThanOrEqual(664);
  }
  const dockTop = (await page.getByTestId('dock-rug').boundingBox())!.y;
  const eventBottom = await page.getByTestId('last-event').evaluate((e) => e.getBoundingClientRect().bottom);
  expect(eventBottom, 'last event above the dock').toBeLessThanOrEqual(dockTop);
  await shot(page, '02-pot-664');
});

for (const [zone, text] of [
  ['locked', 'The pot needs 0.050 NEAR before anyone can take it.'],
  ['cold', 'Not worth stealing. Yet.'],
  ['warm', 'Getting close.'],
  ['live', 'RUGGABLE. +0.394 NEAR.'],
] as const) {
  test(`gap zone ${zone}`, async ({ page, m }) => {
    m.setZone(zone);
    await open(page);
    await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', zone);
    await expect(page.getByTestId('gap-zone')).toHaveText(text);
    await page.waitForTimeout(1200);
    await shot(page, `03-zone-${zone}`);
  });
}

test('empty round after a rug', async ({ page, m }) => {
  await open(page);
  await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', 'locked');
  await expect(page.getByTestId('gap-zone')).toContainText("Pot's empty. Rug #3 just happened.");
  await page.waitForTimeout(800);
  await shot(page, '04-pot-empty-round');
});

test('gap details and explainer open', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('gap-details').locator('summary').click();
  await expect(page.getByTestId('gap-detail-hold')).toContainText('NEAR');
  await expect(page.getByTestId('gap-detail-whale')).toContainText(/\.testnet|NEAR/);
  await page.getByTestId('explainer-whats-a-rug').locator('summary').click();
  await expect(page.getByTestId('explainer-whats-a-rug')).toContainText('run off with the money');
  await page.getByTestId('explainer').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot(page, '05-below-fold');
});

test('loading state: skeleton, then the slow notice', async ({ page, m }) => {
  m.setZone('cold');
  const release = new Promise<void>((r) => setTimeout(r, 4000));
  await page.route('https://test.rpc.fastnear.com/**', async (route) => {
    await release;
    await route.fallback();
  });
  await open(page);
  await expect(page.getByTestId('state-view')).toContainText('Reading the chain');
  await shot(page, '06-loading');
  await expect(page.getByTestId('gap-zone')).toBeVisible();
});

test.describe('failures', () => {
  test.use({ allowConsole: ['Failed to load resource'] });

  test('rpc down on load: frozen copy, dock disabled', async ({ page, m }) => {
    m.down = true;
    await open(page);
    await expect(page.getByTestId('frozen-copy-banner')).toContainText('Chain unreachable. Showing frozen copy from');
    await expect(page.getByTestId('frozen-copy-banner')).toContainText('block');
    await expect(page.getByTestId('dock-buy')).toBeDisabled();
    await expect(page.getByTestId('dock-rug')).toBeDisabled();
    await page.waitForTimeout(500);
    await shot(page, '07-rpc-down');
  });

  test('rpc down after loading: frozen copy keeps the last data', async ({ page, m }) => {
    m.setZone('warm');
    await open(page);
    await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', 'warm');
    m.down = true;
    await expect(page.getByTestId('frozen-copy-banner')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('pot-value')).toHaveText('0.660');
  });

  test('failover: a failing endpoint is invisible', async ({ page, m }) => {
    m.setZone('cold');
    await page.route('https://test.rpc.fastnear.com/**', (route) => route.abort('failed'));
    await open(page);
    await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', 'cold');
    await expect(page.getByTestId('frozen-copy-banner')).toHaveCount(0);
  });

  test('stale data shows the age', async ({ page, m }) => {
    m.setZone('warm');
    await open(page);
    await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', 'warm');
    await page.clock.setFixedTime(NOW + 30000);
    m.stateFails = 1000;
    await expect(page.getByTestId('stale-indicator')).toContainText('Stale', { timeout: 6000 });
    await shot(page, '08-stale');
  });

  test('instance not responding links to the other one', async ({ page, m }) => {
    m.missing = true;
    await open(page);
    await expect(page.getByTestId('state-view')).toContainText("This instance isn't responding.");
    await expect(page.getByRole('link', { name: 'Open the other instance' })).toHaveAttribute('href', '?i=live');
    await shot(page, '09-instance-missing');
  });
});
