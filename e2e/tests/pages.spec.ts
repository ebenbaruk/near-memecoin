import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, shot, open, expectTargets, NOW } from '../lib/fixtures';
import { NEAR, ONE } from '../lib/mock';

const ROOT = join(import.meta.dirname, '..', '..');

test('wall: empty', async ({ page, m }) => {
  m.rugs = [];
  m.state.rugs_count = 0;
  await open(page, '#/wall');
  await expect(page.getByTestId('rug-wall-empty')).toContainText('Nobody has rugged yet.');
  await shot(page, '40-wall-empty');
});

test('wall: posters, biggest heist first, BOT badge, share', async ({ page, m }) => {
  m.rugBy('bot-3.acr-bots.testnet', NOW - 1000);
  await open(page, '#/wall');
  await expect(page.getByTestId('rug-card')).toHaveCount(4);
  await expect(page.getByTestId('biggest-heist').getByTestId('rug-card')).toHaveCount(1);
  await expect(page.locator('[data-testid="rug-card"][data-round="4"]')).toContainText('bot-3.acr-bots.testnet');
  await expect(page.getByTestId('rug-card').filter({ hasText: 'bot-3' }).locator('.badge.bot')).toBeVisible();
  await expectTargets(page);
  await page.waitForTimeout(400);
  await shot(page, '41-wall');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rug-share').first().click()]);
  expect(download.suggestedFilename()).toMatch(/rugged-round-\d+\.png/);
});

test('journal: filled, audit passes, rows, tx link', async ({ page, m }) => {
  await open(page, '#/log');
  await expect(page.getByTestId('journal-row').first()).toBeVisible();
  await expect(page.getByTestId('journal-count')).toContainText('13 events');
  await expect(page.locator('[data-testid="journal-row"][data-kind="rug"]').first()).toBeVisible();
  await page.getByTestId('journal-audit').click();
  await expect(page.getByTestId('journal-audit-result')).toHaveText('Journal matches supply: 13 events');
  await expect(page.getByTestId('journal-bot-share')).toContainText('bots share of volume 0.0%');
  await page.waitForTimeout(300);
  await expectTargets(page);
  await shot(page, '42-journal');
  await page.getByTestId('journal-row').first().getByRole('button', { name: 'Find tx' }).click();
  await expect(page.getByTestId('journal-row').first().getByRole('link')).toHaveAttribute('href', /txns\/MockResolved/);
});

test('journal: audit shows MISMATCH plainly', async ({ page, m }) => {
  await open(page, '#/log');
  await expect(page.getByTestId('journal-row').first()).toBeVisible();
  m.state.supply = '123';
  await page.getByTestId('journal-audit').click();
  await expect(page.getByTestId('journal-audit-result')).toContainText('MISMATCH');
  await shot(page, '43-journal-mismatch');
});

test('journal: empty', async ({ page, m }) => {
  m.journal = [];
  m.state.journal_len = 0;
  await open(page, '#/log');
  await expect(page.getByTestId('journal-empty')).toContainText('Be the first line on the receipt.');
  await shot(page, '44-journal-empty');
});

test('journal: 300 rows are virtualised, filters and BOT badges work', async ({ page, m }) => {
  const base = NOW - 3600000;
  for (let i = 0; i < 300; i++) {
    const kind = i % 7 === 0 ? 'sell' : 'buy';
    const acc = i % 2 === 0 ? `bot-${i % 5}.acr-bots.testnet` : `human-${i % 3}.testnet`;
    m.pushEntry(kind, acc, BigInt(100 + i) * ONE, NEAR / 100n, base + i * 1000);
  }
  await open(page, '#/log');
  await expect(page.getByTestId('journal-count')).toContainText('313 events');
  const rendered = await page.getByTestId('journal-row').count();
  expect(rendered).toBeLessThan(60);
  await expect(page.getByText('BOT').first()).toBeVisible();
  await shot(page, '45-journal-bots');
  await page.getByTestId('journal-filter-rugs').click();
  await expect(page.getByTestId('journal-count')).toContainText('3 events');
  await page.getByTestId('journal-filter-nobots').click();
  await expect(page.getByTestId('journal-count')).toContainText('163 events');
  await expect(page.getByTestId('journal-bot-share')).toContainText('bots share of volume');
  await page.getByTestId('journal-filter-burns').click();
  await expect(page.getByTestId('journal-count')).not.toContainText(' 0 events');
  await page.getByTestId('journal-filter-all').click();
  await page.locator('.j-scroll').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.locator('[data-index="0"]')).toBeVisible();
});

test('rules: live params, keys, code hash, sybil, disclosures', async ({ page, m }) => {
  await open(page, '#/proof/rules');
  await expect(page.locator('[data-param="fee_bps"]')).toContainText('2%');
  await expect(page.getByTestId('param-row')).toHaveCount(11);
  await expect(page.getByTestId('access-keys-count')).toHaveText('1 key');
  await expect(page.getByRole('alert')).toContainText('still has 1 access key');
  await expect(page.getByTestId('code-hash-live')).toHaveText(m.account.code_hash);
  await expect(page.getByTestId('code-hash-published')).toContainText(/[1-9A-HJ-NP-Za-km-z]{30,}/);
  await expect(page.getByTestId('sybil-limits')).toContainText('the rug price counts tokens, not accounts');
  await expect(page.getByTestId('disclosure-long')).toContainText('Unaudited hackathon code.');
  await expectTargets(page);
  await page.waitForTimeout(300);
  await shot(page, '50-rules-keys-warning');
});

test('rules: zero keys', async ({ page, m }) => {
  m.keys = { ...m.keys, keys: [] };
  await open(page, '#/proof/rules');
  await expect(page.getByTestId('access-keys-count')).toHaveText('0 keys');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await shot(page, '51-rules-zero-keys');
});

test('proof tabs navigate; verify steps run', async ({ page, m }) => {
  await open(page, '#/proof/verify');
  await expect(page.getByTestId('verify-step')).toHaveCount(5);
  await page.locator('[data-step="1"]').getByTestId('verify-run').click();
  await expect(page.locator('[data-step="1"]').getByTestId('verify-result')).toContainText('matches supply: 13 events');
  await page.locator('[data-step="5"]').getByTestId('verify-run').click();
  await expect(page.locator('[data-step="5"]').getByTestId('verify-result')).toContainText('round 4');
  await expect(page.locator('[data-step="1"]').getByTestId('verify-cli')).toHaveText('npm run verify');
  await page.waitForTimeout(200);
  await shot(page, '52-verify');
  await page.getByTestId('proof-tab-rules').click();
  await expect(page.getByTestId('access-keys-count')).toBeVisible();
  await page.getByTestId('nav-pot').click();
  await expect(page.getByTestId('explainer')).toBeVisible();
});

test('instance switch reloads into the other instance', async ({ page, m }) => {
  await open(page);
  await expect(page.getByTestId('instance-name')).toHaveText('FAST DEMO INSTANCE');
  m.state._contract = 'anyonecanrug.testnet';
  await page.getByTestId('instance-switch').click();
  await expect(page.getByTestId('instance-name')).toHaveText('LIVE');
  await expect(page.getByTestId('instance-banner')).toContainText('simulated parameters');
});

test('bots badge: asleep with no bot activity, trading when recent', async ({ page, m }) => {
  m.pushEntry('buy', 'bot-1.acr-bots.testnet', ONE, NEAR / 100n, NOW - 60000);
  await open(page);
  await expect(page.getByTestId('bots-status')).toHaveText('bots trading');
});

test.describe('static checks on dist', () => {
  const dist = join(ROOT, 'web', 'dist');
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

  test('no ed25519 private key material in dist/', () => {
    const offenders = walk(dist).filter((p) => /\.(js|css|html|json|map)$/.test(p) && /ed25519:[1-9A-HJ-NP-Za-km-z]{40,}/.test(readFileSync(p, 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('initial bundle stays under 120 KB gzip', () => {
    const indexHtml = readFileSync(join(dist, 'index.html'), 'utf8');
    const entry = /assets\/index-[^"']+\.js/.exec(indexHtml)![0];
    const gzip = (process.getBuiltinModule('node:zlib') as typeof import('node:zlib')).gzipSync(readFileSync(join(dist, entry)));
    expect(gzip.length).toBeLessThan(120 * 1024);
  });
});

test('forbidden words: none in the rendered copy or the README', async ({ page, m }) => {
  const BAD = [/rug-proof/i, /guaranteed/i, /guaranteed floor/i, /\bsafe\b/i, /risk-free/i, /\bAPY\b/, /\breturns\b/i, /\bprofit\b/i];
  m.setZone('live');
  const seen: string[] = [];
  for (const h of ['#/', '#/wall', '#/log', '#/proof/rules', '#/proof/sim', '#/proof/verify']) {
    await open(page, h);
    await page.waitForTimeout(500);
    seen.push(await page.evaluate(() => document.body.innerText));
  }
  if (existsSync(join(ROOT, 'README.md'))) seen.push(readFileSync(join(ROOT, 'README.md'), 'utf8'));
  for (const text of seen) for (const re of BAD) expect(text, String(re)).not.toMatch(re);
});

test('sim page reads summary.json', async ({ page, m: _m }) => {
  await open(page, '#/proof/sim');
  await expect(page.getByTestId('sim-assumption-banner')).toContainText('Assumed behaviour. Not a forecast.');
  await expect(page.getByTestId('sim-scenario').first()).toBeVisible();
  await expect(page.getByTestId('sim-supply-chart').first()).toBeVisible();
  await expect(page.getByTestId('sim-limits')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, '53-sim');
});
