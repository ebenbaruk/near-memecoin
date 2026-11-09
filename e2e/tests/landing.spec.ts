import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, open, expectTargets } from '../lib/fixtures';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vp = (page: import('@playwright/test').Page) => page.viewportSize()!;
const desktop = (page: import('@playwright/test').Page) => vp(page).width >= 1100;

async function landing(page: import('@playwright/test').Page) {
  await open(page, '#/');
  await expect(page.getByTestId('hero')).toBeVisible();
}
/** Waits for the lazily loaded sections below the fold. */
async function below(page: import('@playwright/test').Page) {
  await landing(page);
  await expect(page.getByTestId('judges')).toBeAttached();
}

test('hero: the name, the sentence, the pot and the rug price come from the chain', async ({ page, m }) => {
  m.setZone('warm');
  await landing(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/anyone can\s*rug/i);
  await expect(page.getByTestId('hero-sentence')).toHaveText('A memecoin where every trade feeds a pot, and anyone who destroys 5% of the supply takes all of it.');
  await expect(page.getByTestId('hero-pot')).toHaveText('0.660');
  await expect(page.getByTestId('hero-rug-price')).toHaveText('0.806');
  await expect(page.getByTestId('hero-take')).toHaveText('0.660 − 0.806 = -0.146');
  await expect(page.getByTestId('hero-verdict')).toHaveText('Getting close.');
  await expect(page.getByTestId('hero-mode')).toHaveText('Right now, on chain');
  await expect(page.getByTestId('hero-win')).toContainText('testnet NEAR with no value');
  const proof = page.getByTestId('hero-proof');
  await expect(proof).toContainText('Last thief');
  await expect(proof).toContainText('0.076 NEAR');
  await expect(proof).toContainText('round 3');
  await expect(page.getByTestId('hero-steal')).toHaveText('Right now, stealing it would lose you 0.146 NEAR.');
  await expect(page.getByTestId('hero-analogy')).toContainText('shared jackpot');
  await expect(page.getByTestId('hero')).toHaveAttribute('data-zone', 'warm');
  if (desktop(page)) {
    const { height, width } = vp(page);
    for (const id of ['hero-sentence', 'hero-pot', 'hero-rug-price', 'hero-take', 'hero-win', 'landing-try', 'hero-judges', 'hero-proof', 'hero-whatif']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.y + box!.height, `${id} on the first screen`).toBeLessThanOrEqual(height);
      expect(box!.x + box!.width, `${id} on the first screen`).toBeLessThanOrEqual(width);
    }
    const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
    expect(h1!.x + h1!.width).toBeLessThanOrEqual(width);
  }
});

test('hero: an empty pot is a deliberate state', async ({ page, m }) => {
  void m; // the fixture installs the mock chain
  await landing(page);
  await expect(page.getByTestId('hero-pot')).toHaveText('0.000');
  await expect(page.getByTestId('hero-verdict')).toHaveText('Round 4 just opened. Empty. Yet.');
  await expect(page.getByTestId('hero')).toHaveAttribute('data-zone', 'locked');
});

test('hero: a small pot that is not empty says locked, and never just emptied', async ({ page, m }) => {
  m.setZone('locked');
  await landing(page);
  await expect(page.getByTestId('hero-pot')).toHaveText('0.020');
  await expect(page.getByTestId('hero-verdict')).toHaveText('Locked. Needs 0.05 NEAR before anyone can take it.');
  await expect(page.getByTestId('hero')).not.toContainText('just emptied');
  await expect(page.getByTestId('hero')).toContainText('NEAR, in the contract');
});

test('hero: a full pot shows the take', async ({ page, m }) => {
  m.setZone('live');
  await landing(page);
  await expect(page.getByTestId('hero-verdict')).toHaveText('RUGGABLE. +0.394 NEAR.');
  await expect(page.getByTestId('hero-steal')).toHaveText('Right now, stealing it pays 0.394 NEAR.');
  await expect(page.getByTestId('hero-take')).toHaveText('1.200 − 0.806 = +0.394');
});

test('hero: the what-if is labelled and the live pot stays readable', async ({ page, m }) => {
  m.setZone('cold');
  await landing(page);
  await page.getByTestId('hero-whatif').fill('90');
  await expect(page.getByTestId('hero-mode')).toHaveText('WHAT IF, not on chain');
  await expect(page.getByTestId('hero-live-pot')).toHaveText('Live: 0.200 NEAR');
  await expect(page.getByTestId('hero-pot')).not.toHaveText('0.200');
  await page.getByTestId('hero-whatif').fill('0');
  await expect(page.getByTestId('hero-mode')).toHaveText('Right now, on chain');
  await expect(page.getByTestId('hero-pot')).toHaveText('0.200');
});

test('hero: the button really starts the no-wallet flow', async ({ page, m }) => {
  void m;
  await landing(page);
  const faucet = page.waitForRequest((r) => r.url().includes('helper.nearprotocol.com') && r.method() === 'POST');
  await page.getByTestId('landing-try').click();
  await faucet;
  await expect(page).toHaveURL(/#\/play$/);
});

test.describe('chain down', () => {
  test.use({ allowConsole: ['Failed to load resource'] });
  test('frozen copy shows real numbers and says so', async ({ page, m }) => {
    m.down = true;
    await landing(page);
    await expect(page.getByTestId('hero-mode')).toContainText('Frozen copy');
    const snap = JSON.parse(readFileSync(join(ROOT, 'web/public/snapshots/fast.json'), 'utf8')) as { state: { pot: string } };
    const pot = (Number(BigInt(snap.state.pot) / 10n ** 21n) / 1000).toFixed(3);
    await expect(page.getByTestId('hero-pot')).toHaveText(pot);
    await expect(page.getByTestId('hero-rug-price')).toHaveText(/^\d+\.\d{3}$/);
  });
});

test('judges: the jump reaches the section, and the access is there at every scroll', async ({ page, m }) => {
  void m;
  await below(page);
  await page.getByTestId(desktop(page) ? 'hero-judges' : 'judge-bar-link').click();
  await expect(page).toHaveURL(/#\/judges$/);
  const { height } = vp(page);
  await expect.poll(async () => (await page.getByTestId('judges').boundingBox())?.y ?? 9999).toBeLessThan(height * 0.2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  const jump = page.getByTestId(desktop(page) ? 'nav-judges' : 'judge-bar-link');
  await expect(jump).toBeInViewport();
});

test('a fresh load of #/judges lands on the section, and stays there', async ({ page, m }) => {
  void m;
  await open(page, '#/judges');
  await expect(page.getByTestId('judges')).toBeAttached();
  await page.waitForTimeout(3200);
  const top = (await page.getByTestId('judges').boundingBox())!.y;
  expect(Math.abs(top), `judges top is ${top}`).toBeLessThanOrEqual(80);
});

test('the phone page stays short', async ({ page, m }) => {
  void m;
  test.skip(desktop(page), 'phone only');
  await below(page);
  await page.waitForTimeout(600);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(h).toBeLessThanOrEqual(14200);
});

test('judges strip sits right under the hero', async ({ page, m }) => {
  void m;
  await landing(page);
  const hero = await page.getByTestId('hero').boundingBox();
  const strip = await page.getByTestId('judges-strip').boundingBox();
  expect(strip!.y).toBeLessThanOrEqual(hero!.y + hero!.height + 1);
});

test('judges: the five requirements with their full commands', async ({ page, m }) => {
  void m;
  await below(page);
  const expected = [
    /ft_metadata.*implode/,
    /view_access_key_list.*anyonecanrug\.testnet/,
    'cd contracts/anyone-can-rug && cargo test prop_split_buy_no_advantage',
    'npm ci && npx playwright install chromium && npm run verify',
    'npm run sim -- --quick',
  ];
  for (let i = 0; i < 5; i++) {
    const req = page.getByTestId(`req-${i + 1}`);
    await expect(req).toBeVisible();
    await expect(page.getByTestId(`req-cmd-${i + 1}`).locator('code')).toContainText(expected[i]);
    await expect(req.locator('blockquote')).toBeAttached();
    await expect(req).toContainText('See:');
    expect(await req.locator('.req-links a').count()).toBeGreaterThanOrEqual(2);
  }
  await expect(page.getByTestId('req-cmd-2').locator('code')).toContainText('curl -s https://test.rpc.fastnear.com');
  await expect(page.getByTestId('curl-fast').locator('code')).toContainText('rugfast.acr-ops.testnet', { useInnerText: false });
  await expect(page.getByTestId('req-start-cmd').locator('code')).toContainText('git clone https://github.com/ebenbaruk/near-memecoin');
  await expect(page.getByTestId('req-start')).toContainText('Node 24, curl and jq.');
  await expect(page.getByTestId('req-cmd-2b').locator('code')).toContainText('get_params', { useInnerText: false });
  await expect(page.getByTestId('param-lines')).toContainText('tau_bps 500', { useInnerText: false });
});

test('the moment: the explainer responds, and it starts from the contract', async ({ page, m }) => {
  void m;
  await below(page);
  const take = page.getByTestId('moment-take');
  await page.getByTestId('moment-hour').fill('0');
  // Hour 0 is the live state: the model must print the rug price the contract quotes.
  await expect(page.getByTestId('hero-rug-price')).toHaveText('0.794');
  await expect(take).toHaveText('-0.794');
  await page.getByTestId('moment-hour').fill('60');
  await expect(take).not.toHaveText('-0.794');
  await expect(page.getByTestId('moment-sum')).toContainText('Hour 60');
  await expect(page.getByTestId('moment-stolen')).toHaveCount(0);
  await page.getByTestId('moment-bot').click();
  await expect(page.getByTestId('moment-stolen')).toContainText('STOLEN AT HOUR');
  await expect(page.getByTestId('moment-stolen')).toContainText('POT BACK TO 0.');
});

test('the curve, the sell-down trick and the atomic rug respond', async ({ page, m }) => {
  void m;
  await below(page);
  if (!desktop(page)) {
    await page.locator('#curve summary').first().click();
    await page.locator('#trick summary').first().click();
  }
  const read = page.getByTestId('curve-read');
  const before = await read.innerText();
  await page.getByTestId('curve-rug').click();
  await expect(read).not.toHaveText(before);
  // A rug leaves the reserve and the price where they are.
  const after = await read.innerText();
  const cells = (t: string) => t.split('\n').filter(Boolean);
  expect(cells(after)[1]).toBe(cells(before)[1]); // price
  expect(cells(after)[5]).toBe(cells(before)[5]); // reserve
  expect(cells(after)[3]).not.toBe(cells(before)[3]); // coins in existence

  const real = page.getByTestId('trick-real');
  const r1 = await real.innerText();
  await page.getByTestId('trick-slider').fill('0');
  await expect(real).not.toHaveText(r1);

  await page.getByTestId('atomic-stale').click();
  await expect(page.getByTestId('atomic-bracket')).toHaveText('One transaction: all three un-happen');
  await expect(page.locator('#atomic')).toContainText('E_ROUND_STALE');
});

test('follow the NEAR: buy and sell split, a rug leaves the reserve', async ({ page, m }) => {
  void m;
  await below(page);
  await page.getByTestId('money-amount').fill('5');
  await expect(page.getByTestId('flow-buy')).toContainText('To the pot');
  await expect(page.getByTestId('flow-buy')).toContainText('0.100');
  await expect(page.getByTestId('flow-rug')).toContainText('To whoever rugged');
  await expect(page.locator('.knots').first().locator('i')).toHaveCount(desktop(page) ? 100 : 50);
});

test('live section and simulation read real data', async ({ page, m }) => {
  m.setZone('warm');
  await below(page);
  await expect(page.getByTestId('live-pot')).toHaveText('0.660');
  await expect(page.getByTestId('live-rugprice')).toHaveText('0.806');
  await expect(page.getByTestId('live-take')).toHaveText('-0.146');
  await expect(page.getByTestId('live-last-rug')).toContainText('0.076 NEAR');
  await expect(page.getByTestId('live-log').locator('li').first()).toContainText('RUG');
  // The earlier rounds are labelled like every other line of the page.
  if (desktop(page)) await expect(page.getByTestId('wall-more-row').filter({ has: page.locator('.badge') })).not.toHaveCount(0);
  await expect(page.getByTestId('sim-hits')).toContainText('88%');
  await expect(page.getByTestId('sim-hits')).toContainText('99%');
  await expect(page.getByTestId('sim-multi').locator('article')).toHaveCount(11);
  await expect(page.getByTestId('state-now')).toHaveText('Now');
  await expect(page.locator('[data-zone-tile="warm"] [data-testid="state-now"]')).toBeVisible();
});

test('real round is built from the journal', async ({ page, m }) => {
  void m;
  await below(page);
  const rows = page.getByTestId('real-round').locator('li');
  await expect(rows.last()).toContainText('Rug');
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
});

test('nothing banned or misleading in the copy', async ({ page, m }) => {
  void m;
  await below(page);
  const text = await page.locator('[data-testid=landing]').innerText();
  for (const bad of [/rug-proof/i, /guaranteed/i, /\bsafe\b/i, /risk-free/i, /\bAPY\b/, /\breturns\b/i, /\bprofit\b/i]) expect(text, String(bad)).not.toMatch(bad);
  expect(text).toMatch(/testnet/i);
  expect(text).toMatch(/Bots and whales probably win/);
});

test('every landing image is registered, and nothing unused ships', async () => {
  const src = readFileSync(join(ROOT, 'web/src/landing/art.tsx'), 'utf8');
  const table = src.slice(src.indexOf('LANDING_ART = {'), src.indexOf('} as const'));
  const expected = new Set<string>();
  for (const m of table.matchAll(/'?([a-z0-9-]+)'?: \[\d+, \d+(?:, '(\d+)', \d+)?\]/g)) {
    expected.add(`${m[1]}.webp`);
    if (m[2]) expected.add(`${m[1]}-${m[2]}.webp`);
  }
  const files = new Set(readdirSync(join(ROOT, 'web/public/art/landing')));
  expect([...files].sort()).toEqual([...expected].sort());
  // ...and the page does reference each name.
  const code = readdirSync(join(ROOT, 'web/src/landing'), { recursive: true }).filter((f) => String(f).endsWith('.tsx') || String(f).endsWith('.ts')).map((f) => readFileSync(join(ROOT, 'web/src/landing', String(f)), 'utf8')).join('\n');
  for (const f of expected) {
    const name = f.replace('.webp', '').replace(/-\d+$/, '');
    expect(code.includes(`'${name}'`) || code.includes(`"${name}"`) || /corner-|heap-/.test(name), name).toBeTruthy();
  }
});

test('phone: tap targets', async ({ page, m }) => {
  void m;
  test.skip(desktop(page), 'phone only');
  await below(page);
  await expectTargets(page);
});

test('hero proof: the author\'s own test round says so', async ({ page, m }) => {
  void m;
  await landing(page);
  const proof = page.getByTestId('hero-proof');
  await expect(proof.locator('.badge.test')).toBeVisible();
  await expect(proof).toContainText('our own test, on the real contract');
});

test('a locked pot says nobody can take it, and never prices a theft', async ({ page, m }) => {
  m.setZone('locked');
  await landing(page);
  await expect(page.getByTestId('hero-steal')).toHaveText('Nobody can take it yet. The contract refuses below 0.05 NEAR.');
});

test('just under the minimum, a buy-then-rug clears it: not locked', async ({ page, m }) => {
  m.setZone('cold');
  m.state.pot = (45n * 10n ** 21n).toString(); // 0.045 NEAR, the contract's get_gap_buy says feasible
  await landing(page);
  await expect(page.getByTestId('hero')).toHaveAttribute('data-zone', 'cold');
  await open(page, '#/play');
  await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', 'cold');
});

test('the two-contract buttons are not covered, and the headline is whole', async ({ page, m }) => {
  void m;
  await below(page);
  test.skip(!desktop(page), 'desktop only');
  for (const id of ['show-simulated', 'show-fast']) {
    await page.getByTestId(id).scrollIntoViewIfNeeded();
    const hit = await page.getByTestId(id).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [0.1, 0.5, 0.9].every((f) => document.elementFromPoint(r.x + r.width * f, r.y + r.height / 2) === el);
    });
    expect(hit, id).toBe(true);
  }
  const gap = await page.locator('.sec-idea .giant span').evaluateAll((els) => {
    const thief = document.querySelector('.idea-thief')!.getBoundingClientRect().left;
    return Math.min(...els.map((el) => { const rg = document.createRange(); rg.selectNodeContents(el); return thief - rg.getBoundingClientRect().right; }));
  });
  expect(gap).toBeGreaterThan(0);
});

test('atomic: a refused rug says so, and the floor is named when it applies', async ({ page, m }) => {
  m.setZone('locked');
  await below(page);
  await expect(page.getByTestId('atomic-bracket')).toHaveText('Right now: refused, E_POT_BELOW_MIN');
  await expect(page.getByTestId('atomic-whatif')).toContainText('WHAT IF');
  await page.getByTestId('atomic-stale').click();
  await expect(page.getByTestId('atomic-bracket')).toHaveText('One transaction: all three un-happen');
});

test('atomic: the coins to burn come from the remembered high when it binds', async ({ page, m }) => {
  m.setZone('cold');
  m.state.hwm = (BigInt(m.state.supply) * 2n).toString();
  await below(page);
  await expect(page.locator('#atomic')).toContainText('5% of 90% of the remembered high');
});

test('simulation: what the bars say about fake accounts is said', async ({ page, m }) => {
  void m;
  await below(page);
  if (!desktop(page)) await page.locator('.sim-more summary').click();
  await expect(page.getByTestId('sim-sybil')).toContainText('Fake accounts took 289 of 295 rugs.');
  await expect(page.getByTestId('sim-why')).toContainText('74% on a dead coin, 27% at 2% of base volume');
});

test.describe('summary missing', () => {
  test.use({ allowConsole: ['Failed to load resource'] });
  test('the simulation says it is unavailable', async ({ page, m }) => {
    void m;
    await page.route('**/sim/summary.json', (route) => route.fulfill({ status: 404, body: 'gone' }));
    await below(page);
    await expect(page.getByTestId('sim-state')).toHaveText('Simulation results unavailable. See the README.');
  });
});

test('the headings are there without scrolling', async ({ page, m }) => {
  void m;
  await below(page);
  await page.waitForTimeout(500);
  const hidden = await page.locator('.sec h2, .sec .pop').evaluateAll((els) => els.filter((el) => getComputedStyle(el).opacity !== '1').length);
  expect(hidden).toBe(0);
});

test('hero rug: the cut side of the drawing is never on screen', async ({ page, m }) => {
  await landing(page);
  test.skip(!desktop(page), 'desktop only');
  for (const [width, height] of [[1280, 720], [1366, 768], [1536, 864], [1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width, height });
    for (const zone of ['locked', 'cold', 'warm', 'live'] as const) {
      m.setZone(zone);
      await landing(page);
      await page.waitForTimeout(150);
      const left = await page.locator('.h-rug').evaluate((el) => el.getBoundingClientRect().left);
      expect(left, `${width}x${height} ${zone}`).toBeLessThanOrEqual(-8);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('phone hero, live: the button does not disappear into the pink', async ({ page, m }) => {
  m.setZone('live');
  await landing(page);
  test.skip(desktop(page), 'phone only');
  await expect(page.getByTestId('landing-try')).toHaveCSS('background-color', 'rgb(242, 194, 48)');
});

test('tablet: the prices and the button are on the first screen', async ({ page, m }) => {
  void m;
  test.skip(desktop(page), 'run once');
  for (const [width, height] of [[1024, 768], [768, 1024]]) {
    await page.setViewportSize({ width, height });
    await landing(page);
    for (const id of ['hero-pot', 'hero-rug-price', 'landing-try']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.y + b.height, `${id} at ${width}`).toBeLessThanOrEqual(height);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
});
