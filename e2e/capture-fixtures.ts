// Captures real responses from the rc1 testnet instance into e2e/fixtures/rc1/.
// Usage: npx tsx e2e/capture-fixtures.ts [contract-id]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTRACT = process.argv[2] ?? 'rc1.acr-ops.testnet';
const RPC = process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'rc1');
mkdirSync(OUT, { recursive: true });

async function rpc(params: object): Promise<any> {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params }) });
  const body = (await res.json()) as any;
  if (body.error || body.result?.error) throw new Error(JSON.stringify(body.error ?? body.result.error));
  return body.result;
}
async function view(method: string, args: object = {}) {
  const r = await rpc({ request_type: 'call_function', finality: 'final', account_id: CONTRACT, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  return JSON.parse(Buffer.from(r.result).toString());
}
const save = (name: string, value: unknown) => writeFileSync(join(OUT, `${name}.json`), JSON.stringify(value, null, 2) + '\n');

const state = await view('get_state');
save('get_state', state);
save('get_params', await view('get_params'));
save('get_gap_buy', await view('get_gap_buy'));
save('get_gap_holder', await view('get_gap_holder'));
save('ft_metadata', await view('ft_metadata'));
save('ft_total_supply', await view('ft_total_supply'));
const journal = [];
for (let i = 0; i < state.journal_len; i += 100) journal.push(...(await view('get_journal', { from_index: i, limit: 100 })));
save('get_journal', journal);
save('get_rugs', await view('get_rugs', { from_index: 0, limit: 50 }));
save('view_account', await rpc({ request_type: 'view_account', finality: 'final', account_id: CONTRACT }));
save('view_access_key_list', await rpc({ request_type: 'view_access_key_list', finality: 'final', account_id: CONTRACT }));
console.log(`captured ${CONTRACT}: journal ${journal.length}, rugs ${state.rugs_count}, round ${state.round_id}`);
