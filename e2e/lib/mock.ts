// Chain mock over page.route: real captured rc1 responses, edited per scenario.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, Route } from '@playwright/test';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'rc1');
const load = (name: string) => JSON.parse(readFileSync(join(FIX, `${name}.json`), 'utf8'));

export const NEAR = 10n ** 24n;
export const ONE = 10n ** 18n;
export type Zone = 'locked' | 'cold' | 'warm' | 'live';

export interface TxPlan {
  failure?: string;
  hash?: string;
  /** Effects applied when the transaction lands. */
  effect?: (m: MockChain) => void;
}

export class MockChain {
  params = load('get_params');
  state = load('get_state');
  gapBuy = load('get_gap_buy');
  gapHolder = load('get_gap_holder');
  gapExit = { feasible: false, positive: false, abs: '0', tokens_needed: '0', t_required: '0', pot: '0' };
  journal: any[] = load('get_journal');
  rugs: any[] = load('get_rugs');
  account = load('view_account');
  keys = load('view_access_key_list');
  balances = new Map<string, bigint>();
  nearBalances = new Map<string, bigint>();
  down = false;
  stateFails = 0;
  missing = false;
  nextTx: TxPlan = {};
  sent: any[] = [];
  queries: string[] = [];
  faucet: { status: number; body: string } | 'network' = { status: 200, body: '{"ok":true}' };
  supplyOverride: string | null = null;
  blockHeight = 276900000;

  setPot(pot: bigint) {
    this.state.pot = pot.toString();
  }

  /** Coherent numbers for a zone, cost and pot in yocto. `rug_fee` matches the rc1 params. */
  setZone(zone: Zone) {
    const rugFee = BigInt(this.params.rug_fee);
    const cost = (8n * NEAR) / 10n;
    const pot = { locked: (2n * NEAR) / 100n, cold: (2n * NEAR) / 10n, warm: (66n * NEAR) / 100n, live: (12n * NEAR) / 10n }[zone];
    const value = pot - rugFee - cost;
    this.state.pot = pot.toString();
    this.gapBuy = {
      ...this.gapBuy, pot: pot.toString(), feasible: zone !== 'locked', positive: value >= 0n,
      abs: (value < 0n ? -value : value).toString(), cost: cost.toString(),
      deposit_needed: ((82n * NEAR) / 100n).toString(), min_out: (40000n * ONE).toString(),
      tokens_needed: (24000n * ONE).toString(), t_required: (25000n * ONE).toString(),
    };
    this.state.t_required = (25000n * ONE).toString();
    this.gapHolder = { ...this.gapHolder, feasible: zone !== 'locked', positive: value >= 0n, abs: (value < 0n ? -value : value).toString(), pot: pot.toString(), tokens_needed: this.state.t_required, t_required: this.state.t_required };
  }

  /** Adds a journal entry and keeps get_state coherent. */
  pushEntry(kind: 'buy' | 'sell' | 'rug', account: string, tokens: bigint, near: bigint, ts: number) {
    let supply = BigInt(this.state.supply);
    supply += kind === 'buy' ? tokens : -tokens;
    this.journal.push({ kind, account, tokens: tokens.toString(), near: near.toString(), fee: '0', supply_after: supply.toString(), x_after: this.state.x, pot_after: this.state.pot, ts_ms: ts, block: this.blockHeight });
    this.state.supply = supply.toString();
    this.state.journal_len = this.journal.length;
  }

  rugBy(account: string, ts: number) {
    const pot = BigInt(this.state.pot);
    const burned = BigInt(this.state.t_required);
    const payout = pot - BigInt(this.params.rug_fee);
    this.rugs.push({ round_id: this.state.round_id, rugger: account, burned: burned.toString(), payout: payout.toString(), pot_before: pot.toString(), supply_before: this.state.supply, x_after: this.state.x, ts_ms: ts, block: this.blockHeight });
    this.pushEntry('rug', account, burned, payout, ts);
    this.state.round_id += 1;
    this.state.rugs_count = this.rugs.length;
    this.state.pot = '0';
    this.gapBuy.pot = '0';
    this.gapBuy.positive = false;
    this.gapBuy.feasible = false;
  }

  private viewResult(method: string, args: any): unknown {
    switch (method) {
      case 'get_state': return this.state;
      case 'get_params': return this.params;
      case 'get_gap_buy': return this.gapBuy;
      case 'get_gap_holder': return this.gapHolder;
      case 'get_gap_exit': return this.gapExit;
      case 'get_rugs': return this.rugs.slice(args.from_index, args.from_index + Math.min(args.limit, 50));
      case 'get_journal': return this.journal.slice(args.from_index, args.from_index + Math.min(args.limit, 100));
      case 'ft_total_supply': return this.supplyOverride ?? this.state.supply;
      case 'ft_balance_of': return (this.balances.get(args.account_id) ?? 0n).toString();
      case 'quote_buy': return ((BigInt(args.near_in) * 50000n * ONE) / NEAR).toString();
      case 'quote_sell': return ((BigInt(args.amount) * NEAR) / (50000n * ONE)).toString();
      default: throw new Error(`mock: unhandled view ${method}`);
    }
  }

  private query(params: any): unknown {
    if (params.request_type === 'call_function') {
      const args = params.args_base64 ? JSON.parse(Buffer.from(params.args_base64, 'base64').toString()) : {};
      this.queries.push(params.method_name);
      return { result: [...Buffer.from(JSON.stringify(this.viewResult(params.method_name, args)))], logs: [], block_height: this.blockHeight, block_hash: this.account.block_hash };
    }
    if (params.request_type === 'view_account') {
      if (params.account_id === this.state._contract) return this.account;
      const near = this.nearBalances.get(params.account_id);
      if (near === undefined) {
        if (/^rugger-|e2e/.test(params.account_id)) return { amount: (10n * NEAR).toString(), locked: '0', code_hash: '11111111111111111111111111111111', storage_usage: 300, block_height: this.blockHeight, block_hash: this.account.block_hash };
        return this.account;
      }
      return { amount: near.toString(), locked: '0', code_hash: '11111111111111111111111111111111', storage_usage: 300, block_height: this.blockHeight, block_hash: this.account.block_hash };
    }
    if (params.request_type === 'view_access_key_list') return this.keys;
    if (params.request_type === 'view_access_key') return { nonce: 1, permission: 'FullAccess', block_hash: this.account.block_hash, block_height: this.blockHeight };
    throw new Error(`mock: unhandled query ${params.request_type}`);
  }

  private sendTx(): unknown {
    const plan = this.nextTx;
    this.sent.push(plan);
    if (plan.effect && !plan.failure) plan.effect(this);
    return {
      final_execution_status: 'EXECUTED_OPTIMISTIC',
      status: plan.failure ? { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: `Smart contract panicked: ${plan.failure}` } } } } } : { SuccessValue: '' },
      transaction: { hash: plan.hash ?? 'MockTxHash1111111111111111111111111111111111', signer_id: 'x', actions: [] },
      transaction_outcome: { id: plan.hash ?? 'MockTxHash1111111111111111111111111111111111', block_hash: this.account.block_hash, proof: [], outcome: { logs: [], receipt_ids: [], gas_burnt: 1, tokens_burnt: '1', executor_id: 'x', status: { SuccessValue: '' } } },
      receipts_outcome: [],
    };
  }

  handle(body: any): { result?: unknown; error?: unknown } {
    switch (body.method) {
      case 'query':
        if (body.params.request_type === 'call_function' && body.params.method_name === 'get_state' && this.stateFails > 0) {
          this.stateFails--;
          return { error: { name: 'REQUEST_VALIDATION_ERROR' } };
        }
        if (this.missing) return { error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCOUNT', info: {} }, message: 'Server error', data: 'account does not exist while viewing' } };
        return { result: this.query(body.params) };
      case 'block': return { result: { header: { hash: this.account.block_hash, height: this.blockHeight, timestamp: 1 }, chunks: [] } };
      case 'gas_price': return { result: { gas_price: '100000000' } };
      case 'send_tx':
      case 'broadcast_tx_commit': return { result: this.sendTx() };
      default: return { error: { name: 'METHOD_NOT_FOUND', cause: { name: 'METHOD_NOT_FOUND' }, message: `mock: ${body.method}` } };
    }
  }
}

export async function installChain(page: Page, m: MockChain) {
  const rpc = async (route: Route) => {
    if (m.down) return route.abort('failed');
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const body = JSON.parse(route.request().postData() ?? '{}');
    const out = m.handle(body);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, ...out }) });
  };
  await page.route('https://test.rpc.fastnear.com/**', rpc);
  await page.route('https://rpc.testnet.near.org/**', rpc);
  await page.route('https://archival-rpc.testnet.fastnear.com/**', rpc);
  // A byte-for-byte copy of web/public/sim/summary.json (enforced in pages.spec), so tests see the real numbers.
  await page.route('**/sim/summary.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(join(FIX, '..', 'sim-summary.json')) }));
  await page.route('https://tx.test.fastnear.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ account_txs: [{ transaction_hash: 'MockResolved11111111111111111111111111111111', tx_block_height: 276800000, is_signer: true }] }) }),
  );
  await page.route('https://helper.nearprotocol.com/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (m.faucet === 'network') return route.abort('failed');
    return route.fulfill({ status: m.faucet.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: m.faucet.body });
  });
}
