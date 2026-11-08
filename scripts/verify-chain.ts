// Read-only, no secrets. Checks a deployed instance against the committed wasm and init file.
// Usage: tsx scripts/verify-chain.ts [--only live|fast] [--contract <id> --init <file>] [--no-keys-check]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pinned, base58, finalHeight } from './lib/rpc.ts';

const ONE = 10n ** 18n;
const WASM = 'contracts/anyone-can-rug/res/anyone_can_rug.wasm';

export interface Check { name: string; ok: boolean; detail: string }

function r(p0: bigint, a: bigint, x: bigint): bigint {
  const num = 2n * p0 * ONE * x + a * x * x;
  const den = 2n * ONE * ONE;
  return (num + den - 1n) / den;
}

export async function checkInstance(contract: string, initFile: string, opts: { keys: boolean }): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail = '') => checks.push({ name, ok, detail });
  const height = await finalHeight();
  const c = new Pinned(contract, height);

  const keys = await c.query<any>({ request_type: 'view_access_key_list' });
  if (opts.keys) add('account has zero access keys', keys.keys.length === 0, `${keys.keys.length} keys at block ${height}`);

  const account = await c.query<any>({ request_type: 'view_account' });
  const expected = base58(createHash('sha256').update(readFileSync(WASM)).digest());
  add('code hash equals committed wasm', account.code_hash === expected, account.code_hash);

  const init = JSON.parse(readFileSync(initFile, 'utf8')).params;
  const params = await c.view<any>('get_params');
  add('get_params equals the init file', JSON.stringify(sorted(params)) === JSON.stringify(sorted(init)));

  const s = await c.view<any>('get_state');
  const p0 = BigInt(params.p0);
  const a = BigInt(params.a);
  add('reserve == r(x), recomputed here', BigInt(s.reserve) === r(p0, a, BigInt(s.x)), s.reserve);
  add('x >= supply', BigInt(s.x) >= BigInt(s.supply));
  add('contract is solvent (surplus positive)', s.surplus.positive === true, `${s.surplus.positive ? '+' : '-'}${s.surplus.abs} at block ${height}`);

  const meta = await c.view<any>('ft_metadata');
  add('ft_metadata is ft-1.0.0 with 18 decimals', meta.spec === 'ft-1.0.0' && meta.decimals === 18);

  let supply = 0n;
  let pot = 0n;
  let burned = 0n;
  let inOrder = true;
  const rugBurns: bigint[] = [];
  const len = await c.view<number>('get_journal_len');
  for (let from = 0; from < len; from += 100) {
    for (const e of await c.view<any[]>('get_journal', { from_index: from, limit: 100 })) {
      if (e.block > height) inOrder = false;
      if (e.kind === 'buy') { supply += BigInt(e.tokens); pot += BigInt(e.fee); }
      else if (e.kind === 'sell') { supply -= BigInt(e.tokens); pot += BigInt(e.fee); }
      else if (e.kind === 'rug') { supply -= BigInt(e.tokens); burned += BigInt(e.tokens); pot = 0n; rugBurns.push(BigInt(e.tokens)); }
      else if (e.kind === 'payout_failed') pot += BigInt(e.near);
    }
  }
  add('journal replays to ft_total_supply', supply === BigInt(s.supply), `${len} entries`);
  add('journal replays to the pot', pot === BigInt(s.pot));
  add('x - supply equals the sum of rug burns', BigInt(s.x) - BigInt(s.supply) === burned, burned.toString());
  add('journal blocks are not in the future', inOrder);

  const rugsLen = await c.view<number>('get_rugs_len');
  add('rug count equals round_id - 1', rugsLen === s.round_id - 1, `${rugsLen} rugs, round ${s.round_id}`);
  let burnsMatch = rugBurns.length === rugsLen;
  for (let from = 0; from < rugsLen; from += 50) {
    const rugs = await c.view<any[]>('get_rugs', { from_index: from, limit: 50 });
    rugs.forEach((g, i) => { if (BigInt(g.burned) !== rugBurns[from + i]) burnsMatch = false; });
  }
  add('each rug record matches its journal entry', burnsMatch);
  return checks;
}

function sorted(o: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));
}

export function instanceList(): { key: string; contract: string; init: string }[] {
  const raw = JSON.parse(readFileSync('web/public/instances.json', 'utf8'));
  const list: any[] = Array.isArray(raw) ? raw : (raw.instances ?? Object.entries(raw).map(([key, v]: any) => ({ key, ...v })));
  return list.map((i) => ({ key: i.key ?? i.id ?? i.name, contract: i.contract ?? i.contractId ?? i.account, init: `deploy/${i.key ?? i.id ?? i.name}.json` }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const keys = !process.argv.includes('--no-keys-check');
  const targets = arg('--contract')
    ? [{ key: arg('--contract')!, contract: arg('--contract')!, init: arg('--init') ?? 'deploy/fast.json' }]
    : instanceList().filter((t) => !arg('--only') || t.key === arg('--only'));
  let failed = 0;
  for (const t of targets) {
    console.log(`\n${t.key}: ${t.contract}`);
    for (const c of await checkInstance(t.contract, t.init, { keys })) {
      console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
      if (!c.ok) failed++;
    }
  }
  process.exit(failed ? 1 : 0);
}
