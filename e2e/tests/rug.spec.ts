import { test, expect, shot, open, expectTargets, NOW } from '../lib/fixtures';
import { NEAR, ONE } from '../lib/mock';

async function burner(page: import('@playwright/test').Page) {
  await page.getByTestId('try-no-wallet').click();
  await expect(page.getByTestId('burner-status')).toContainText('Burner ready: 10 NEAR');
  return (await page.getByTestId('account-id').getAttribute('title'))!;
}

async function holdRug(page: import('@playwright/test').Page, ms = 2200) {
  const box = (await page.getByTestId('rug-hold').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('rug sheet: frozen quote, buy and rug, hold, YOU RUGGED IT', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('dock-rug').click();
  await expect(page.getByTestId('rug-sheet')).toBeVisible();
  await shot(page, '20-rug-disconnected');
  const id = await burner(page);
  await expect(page.getByTestId('rug-round')).toHaveText('4');
  await expect(page.getByTestId('rug-pot-seen')).toContainText('1.2 NEAR');
  await expect(page.getByTestId('rug-burn-tokens')).toContainText('25,000');
  await expect(page.getByTestId('rug-tokens-to-buy')).toContainText('24,000');
  await expect(page.getByTestId('rug-net')).toContainText('+0.394');
  await expect(page.getByTestId('rug-min-payout')).toContainText('1.194');
  await expectTargets(page);
  await shot(page, '21-rug-ready');
  m.nextTx = { hash: 'RugHash111', effect: (mm) => mm.rugBy(id, NOW) };
  const box = (await page.getByTestId('rug-hold').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await shot(page, '22-rug-holding');
  await page.waitForTimeout(1300);
  await page.mouse.up();
  await expect(page.getByTestId('rug-climax')).toBeVisible();
  await expect(page.getByTestId('rug-climax-winner')).toHaveText('YOU RUGGED IT', { timeout: 6000 });
  await page.waitForTimeout(3600);
  await expect(page.getByTestId('rug-climax-next')).toBeVisible();
  await shot(page, '23-you-rugged-it');
  expect(m.sent.length).toBe(1);
  await page.getByTestId('rug-climax-next').click();
  await expect(page.getByTestId('rug-climax')).toHaveCount(0);
  await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', 'locked');
});

test('releasing the hold button cancels', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('dock-rug').click();
  await burner(page);
  await expect(page.getByTestId('rug-hold')).toBeEnabled();
  await holdRug(page, 400);
  await page.waitForTimeout(200);
  expect(m.sent.length).toBe(0);
  await expect(page.getByTestId('rug-sheet')).toBeVisible();
});

test('holding Space on the keyboard works', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('dock-rug').click();
  const id = await burner(page);
  await expect(page.getByTestId('rug-hold')).toBeEnabled();
  m.nextTx = { hash: 'KeyboardRug', effect: (mm) => mm.rugBy(id, NOW) };
  await page.getByTestId('rug-hold').focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(2200);
  await page.keyboard.up('Space');
  await expect(page.getByTestId('rug-climax')).toBeVisible();
});

test('two-step confirm', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('dock-rug').click();
  const id = await burner(page);
  await page.getByTestId('rug-two-step-toggle').check();
  m.nextTx = { hash: 'TwoStep1', effect: (mm) => mm.rugBy(id, NOW) };
  await page.getByTestId('rug-hold').click();
  await expect(page.getByTestId('rug-confirm')).toBeVisible();
  await shot(page, '24-rug-two-step');
  await page.getByTestId('rug-confirm').click();
  await expect(page.getByTestId('rug-climax')).toBeVisible();
});

test('negative gap: warning and Rug it anyway', async ({ page, m }) => {
  m.setZone('cold');
  await open(page);
  await page.getByTestId('dock-rug').click();
  await burner(page);
  await expect(page.getByTestId('rug-loss-warning')).toContainText('You would lose 0.606 NEAR doing this.');
  await expect(page.getByTestId('rug-hold')).toContainText('Rug it anyway');
  await shot(page, '25-rug-loss');
});

test('advanced: min payout can be lowered', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('dock-rug').click();
  await burner(page);
  await page.getByTestId('rug-advanced').locator('summary').click();
  await page.getByTestId('rug-advanced').locator('input').fill('1');
  await expect(page.getByTestId('rug-min-payout')).toHaveText('1 NEAR');
});

test('tokens already held: plain rug, nothing to buy', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('dock-rug').click();
  const id = await burner(page);
  m.balances.set(id, 30000n * ONE);
  await page.keyboard.press('Escape');
  await page.getByTestId('dock-rug').click();
  await expect(page.getByTestId('rug-tokens-to-buy')).toHaveText('0');
  await expect(page.getByText('Buy and rug in one transaction')).toHaveCount(0);
});

test('race lost: E_ROUND_STALE from the chain', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('dock-rug').click();
  await burner(page);
  await expect(page.getByTestId('rug-hold')).toBeEnabled();
  m.nextTx = { failure: 'E_ROUND_STALE: not the current round', effect: undefined };
  const plan = m.nextTx;
  m.nextTx = { ...plan };
  const orig = m.handle.bind(m);
  m.handle = (body: any) => {
    if (body.method === 'send_tx') m.rugBy('bot-3.acr-bots.testnet', NOW);
    return orig(body);
  };
  await holdRug(page);
  await expect(page.getByTestId('race-lost')).toBeVisible();
  await expect(page.getByTestId('race-lost-winner')).toHaveText('bot-3.acr-bots.testnet rugged round 4 first.');
  await expect(page.getByTestId('race-lost')).toContainText('Your deposit is back. You only paid gas.');
  await shot(page, '26-race-lost');
  await page.getByTestId('race-lost-new-round').click();
  await expect(page.getByTestId('race-lost')).toHaveCount(0);
});

test('race lost: the round moved before signing, nothing is sent', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('dock-rug').click();
  await burner(page);
  await expect(page.getByTestId('rug-hold')).toBeEnabled();
  m.rugBy('someone.testnet', NOW);
  await holdRug(page);
  await expect(page.getByTestId('race-lost')).toBeVisible();
  await expect(page.getByTestId('race-lost')).toContainText('Nothing was signed.');
  expect(m.sent.length).toBe(0);
});

test('E_BURN_ABOVE_MAX re-quotes without the race-lost screen', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('dock-rug').click();
  await burner(page);
  await expect(page.getByTestId('rug-hold')).toBeEnabled();
  m.nextTx = { failure: 'E_BURN_ABOVE_MAX: threshold above max_burn' };
  await holdRug(page);
  await expect(page.getByText('The price moved, so this is a fresh quote.')).toBeVisible();
  await expect(page.getByTestId('race-lost')).toHaveCount(0);
  await expect(page.getByTestId('rug-hold')).toBeVisible();
});

test('pot below the minimum: rug is held back', async ({ page, m }) => {
  m.setZone('locked');
  await open(page);
  await page.getByTestId('dock-rug').click();
  await burner(page);
  await expect(page.getByText('The pot needs 0.050 NEAR before anyone can take it.').first()).toBeVisible();
  await expect(page.getByTestId('rug-hold')).toBeDisabled();
});

test('insufficient funds for the batch', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await page.getByTestId('dock-rug').click();
  const id = await burner(page);
  m.nearBalances.set(id, NEAR / 10n);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await page.reload();
  await page.getByTestId('dock-rug').click();
  await expect(page.getByTestId('insufficient')).toContainText('NEAR short');
  await expect(page.getByTestId('rug-hold')).toBeDisabled();
  await shot(page, '27-rug-insufficient');
});

test('spectator climax: the round moves, a named thief', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', 'live');
  m.rugBy('bot-3.acr-bots.testnet', NOW);
  const climax = page.getByTestId('rug-climax');
  await expect(climax).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('rug-climax-winner')).toContainText('bot-3.acr-bots.testnet STOLE 1.194 NEAR');
  const atLeast = (p: number) => page.waitForFunction((v) => Number(document.querySelector('[data-testid="rug-climax"]')?.getAttribute('data-phase')) >= v, p, { polling: 16, timeout: 15000 });
  await atLeast(2);
  await shot(page, '28a-climax-floor', { allowAnimations: true });
  await atLeast(3);
  await shot(page, '28-climax-bag', { allowAnimations: true });
  await atLeast(4);
  await shot(page, '29-climax-wanted', { allowAnimations: true });
  await atLeast(5);
  await expect(page.getByTestId('rug-climax-share')).toBeVisible();
  await shot(page, '30-climax-end');
  await expect(page.getByTestId('rug-climax-poster')).toBeVisible();
  await page.getByTestId('rug-climax-next').click();
  await expect(page.getByTestId('rug-climax')).toHaveCount(0);
});

test('climax can be skipped with a tap', async ({ page, m }) => {
  m.setZone('live');
  await open(page);
  await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', 'live');
  m.rugBy('bot-1.acr-bots.testnet', NOW);
  await page.getByTestId('rug-climax').waitFor({ timeout: 15000 });
  await page.getByTestId('rug-climax').click({ force: true, position: { x: 40, y: 400 } });
  await expect(page.getByTestId('rug-climax-next')).toBeVisible();
  await expect(page.getByTestId('rug-climax-skip')).toHaveCount(0);
});

test('replay=1 runs the climax on the latest rug', async ({ page, m }) => {
  m.setZone('cold');
  await page.goto('/?i=fast&replay=1#/');
  await expect(page.getByTestId('rug-climax')).toBeVisible();
  await expect(page.getByTestId('rug-climax-winner')).toContainText(/STOLE/);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('climax is a fade to the static poster', async ({ page, m }) => {
    m.setZone('live');
    await open(page);
    await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', 'live');
    m.rugBy('bot-2.acr-bots.testnet', NOW);
    await expect(page.getByTestId('rug-climax')).toHaveAttribute('data-reduced', '1', { timeout: 15000 });
    await expect(page.getByTestId('rug-climax-next')).toBeVisible();
    await shot(page, '31-climax-reduced');
  });
});
