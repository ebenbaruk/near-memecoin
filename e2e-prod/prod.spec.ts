// Production checks: the page as published, against the real chain. Read-only by construction:
// no page.route anywhere, nothing clicked that can sign, and a listener that fails the test on any send.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { B, fmtNearFixed, fmtTokens } from '../web/src/format/near';

const RPCS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'];

interface Instances { default: string; instances: Record<string, { contractId: string }> }

async function rpc<T>(request: APIRequestContext, params: Record<string, unknown>): Promise<T> {
  let last = 'no RPC answered';
  for (const url of RPCS) {
    try {
      const res = await request.post(url, { data: { jsonrpc: '2.0', id: 'e2e-prod', method: 'query', params: { finality: 'final', ...params } } });
      const body = await res.json();
      if (body.result && !body.result.error) return body.result as T;
      last = JSON.stringify(body.error ?? body.result);
    } catch (e) {
      last = (e as Error).message;
    }
  }
  throw new Error(`RPC failed: ${last}`);
}

async function view<T>(request: APIRequestContext, contract: string, method: string, args: object = {}): Promise<T> {
  const out = await rpc<{ result: number[] }>(request, { request_type: 'call_function', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  return JSON.parse(Buffer.from(out.result).toString('utf8')) as T;
}

/** Collects everything that would make a run dishonest: console errors, page errors, any write to the chain. */
function watch(page: Page) {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const body = r.method() === 'POST' ? r.postData() ?? '' : '';
    if (/"method"\s*:\s*"(send_tx|broadcast_tx_\w+)"/.test(body)) writes.push(body.slice(0, 120));
    if (r.url().includes('helper.nearprotocol.com')) writes.push(r.url());
  });
  return {
    assertClean: () => {
      expect(writes, 'the page tried to write to the chain').toEqual([]);
      expect(errors, 'console errors').toEqual([]);
    },
  };
}

let config: Instances;

test.beforeAll(async ({ request, baseURL }) => {
  const res = await request.get(new URL('instances.json', `${baseURL}/`).href);
  expect(res.ok(), 'instances.json is served').toBe(true);
  config = (await res.json()) as Instances;
});

for (const key of ['fast', 'live'] as const) {
  test.describe(`instance ${key}`, () => {
    test('pot and rug price on screen match the chain', async ({ page, request }) => {
      const contract = config.instances[key].contractId;
      const w = watch(page);
      await page.goto(`/?i=${key}#/`);
      await expect(page.getByTestId('pot-value')).toBeVisible();
      await expect(page.getByTestId('rug-price-value')).not.toHaveText('…');
      // Bots trade while this runs, so screen and chain are compared until they agree on one read.
      await expect(async () => {
        const [state, gap] = await Promise.all([
          view<{ pot: string; t_required: string }>(request, contract, 'get_state'),
          view<{ cost: string }>(request, contract, 'get_gap_buy', {}),
        ]);
        await expect(page.getByTestId('pot-value')).toHaveText(fmtNearFixed(B(state.pot)), { timeout: 1500 });
        await expect(page.getByTestId('rug-price-value')).toHaveText(fmtNearFixed(B(gap.cost)), { timeout: 1500 });
        await expect(page.getByTestId('explainer')).toContainText(`Burn ${fmtTokens(B(state.t_required))}`, { timeout: 1500 });
      }).toPass({ timeout: 45000 });
      await expect(page.getByTestId('gap-zone')).toHaveAttribute('data-zone', /^(locked|cold|warm|live)$/);
      w.assertClean();
    });

    test('the journal renders every event the contract holds', async ({ page, request }) => {
      const contract = config.instances[key].contractId;
      const w = watch(page);
      const len = await view<number>(request, contract, 'get_journal_len');
      await page.goto(`/?i=${key}#/log`);
      if (len === 0) {
        await expect(page.getByTestId('journal-empty')).toBeVisible();
      } else {
        await expect(page.getByTestId('journal-row').first()).toBeVisible();
        await expect(page.getByTestId('journal-row').first()).toHaveAttribute('data-kind', /^(buy|sell|rug|payout_failed)$/);
        const shown = Number.parseInt((await page.getByTestId('journal-count').innerText()).replace(/\D+/g, ''), 10);
        expect(shown, 'events shown').toBeGreaterThanOrEqual(len);
      }
      w.assertClean();
    });

    test('zero access keys, on screen and over RPC', async ({ page, request }) => {
      const contract = config.instances[key].contractId;
      const w = watch(page);
      const { keys } = await rpc<{ keys: unknown[] }>(request, { request_type: 'view_access_key_list', account_id: contract });
      await page.goto(`/?i=${key}#/proof/rules`);
      await expect(page.getByTestId('access-keys-count')).toHaveText(`${keys.length} key${keys.length === 1 ? '' : 's'}`);
      expect(keys.length, `${contract} must have no access key left`).toBe(0);
      await expect(page.getByTestId('access-keys-count')).toHaveText('0 keys');
      await expect(page.getByRole('alert')).toHaveCount(0);
      w.assertClean();
    });
  });
}
