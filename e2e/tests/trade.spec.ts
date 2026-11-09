import { test, expect, shot, open, expectTargets, NOW } from '../lib/fixtures';
import { NEAR, ONE } from '../lib/mock';

async function burner(page: import('@playwright/test').Page) {
  await page.getByTestId('try-no-wallet').click();
  await expect(page.getByTestId('burner-status')).toContainText('Free account ready: 10 test NEAR');
  return (await page.getByTestId('account-id').getAttribute('title'))!;
}

test('buy with a burner: quote, Signing, Done, link', async ({ page, m }) => {
  m.setZone('cold');
  await open(page);
  await page.getByTestId('dock-buy').click();
  await shot(page, '10-buy-empty');
  const id = await burner(page);
  await page.getByTestId('buy-amount').fill('0.5');
  await expect(page.getByTestId('buy-quote-tokens')).toContainText('25,000');
  await expect(page.getByTestId('buy-quote-fee')).toContainText('0.01');
  m.nextTx = { hash: 'BuyTxHash111', effect: (mm) => mm.pushEntry('buy', id, 25000n * ONE, NEAR / 2n, NOW) };
  await shot(page, '11-buy-ready');
  await expectTargets(page);
  await page.getByTestId('buy-submit').click();
  await expect(page.getByTestId('buy-submit')).toHaveText('Done');
  await expect(page.getByTestId('tx-link')).toHaveAttribute('href', /txns\/BuyTxHash111/);
  await expect(page.getByTestId('tx-printed')).toContainText('MINT');
  await shot(page, '12-buy-done');
});

test('buy: invalid, too low, insufficient balance', async ({ page, m }) => {
  m.setZone('cold');
  await open(page);
  await page.getByTestId('dock-buy').click();
  await burner(page);
  const input = page.getByTestId('buy-amount');
  await input.fill('abc');
  await expect(page.getByText("That's not an amount.")).toBeVisible();
  await expect(page.getByTestId('buy-submit')).toBeDisabled();
  await input.fill('0.001');
  await expect(page.getByText(/minimum buy/)).toBeVisible();
  await input.fill('50');
  await expect(page.getByTestId('insufficient')).toContainText('NEAR short');
  await shot(page, '13-buy-insufficient');
});

test('buy that the contract refuses shows tx-error', async ({ page, m }) => {
  m.setZone('cold');
  await open(page);
  await page.getByTestId('dock-buy').click();
  await burner(page);
  await page.getByTestId('buy-amount').fill('0.5');
  await expect(page.getByTestId('buy-quote-tokens')).toContainText('25,000');
  m.nextTx = { failure: 'E_SLIPPAGE: min_out not met' };
  await page.getByTestId('buy-submit').click();
  await expect(page.getByTestId('tx-error')).toContainText('The price moved');
  await shot(page, '14-buy-error');
});

test('sell: quote and Done', async ({ page, m }) => {
  m.setZone('cold');
  await open(page);
  await page.getByTestId('dock-sell').click();
  const id = await burner(page);
  m.balances.set(id, 1000n * ONE);
  await page.waitForTimeout(100);
  await page.reload();
  await page.getByTestId('dock-sell').click();
  await expect(page.getByTestId('account-balance')).toContainText('1,000');
  await page.getByTestId('sell-amount').fill('500');
  await expect(page.getByTestId('sell-quote-near')).toContainText('0.01');
  m.nextTx = { hash: 'SellHash1', effect: (mm) => mm.pushEntry('sell', id, 500n * ONE, NEAR / 100n, NOW) };
  await page.getByTestId('sell-submit').click();
  await expect(page.getByTestId('sell-submit')).toHaveText('Done');
  await shot(page, '15-sell-done');
});

test('forget burner', async ({ page, m }) => {
  m.setZone('cold');
  await open(page);
  await page.getByTestId('dock-buy').click();
  await burner(page);
  await page.getByTestId('burner-forget').click();
  await expect(page.getByTestId('try-no-wallet')).toBeVisible();
});

test.describe('faucet failures', () => {
  test.use({ allowConsole: ['Failed to load resource'] });

  test('429 shows the delay and the fallbacks', async ({ page, m }) => {
    m.setZone('cold');
    m.faucet = { status: 429, body: '{"message":"Rate limit exceeded, retry in 8 hours"}' };
    await open(page);
    await page.getByTestId('dock-buy').click();
    await page.getByTestId('try-no-wallet').click();
    await expect(page.getByTestId('faucet-error')).toContainText('Faucet is busy.');
    await expect(page.getByTestId('faucet-error')).toContainText('8 hours');
    await expect(page.getByTestId('wallet-connect')).toBeVisible();
    await shot(page, '16-faucet-429');
  });

  test('network error: same message, no delay', async ({ page, m }) => {
    m.setZone('cold');
    m.faucet = 'network';
    await open(page);
    await page.getByTestId('dock-buy').click();
    await page.getByTestId('try-no-wallet').click();
    await expect(page.getByTestId('faucet-error')).toContainText('Faucet is busy.');
    await expect(page.getByTestId('faucet-error')).not.toContainText('hours');
  });
});

test('Escape closes a sheet', async ({ page, m }) => {
  m.setZone('cold');
  await open(page);
  await page.getByTestId('dock-buy').click();
  await expect(page.getByTestId('buy-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('buy-sheet')).toHaveCount(0);
});
