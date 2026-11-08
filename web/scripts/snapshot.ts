// Frozen copy of an instance (web/public/snapshots/<key>.json), RPC only.
// Usage: npm run -w web snapshot [fast|live ...]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, '..', 'public', 'snapshots');
const RPC = process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com';
const inst = JSON.parse(readFileSync(join(ROOT, '..', 'public', 'instances.json'), 'utf8')) as { instances: Record<string, { contractId: string }> };

async function view(contract: string, method: string, args: object = {}): Promise<{ value: any; block: number }> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') } }),
  });
  const body = (await res.json()) as any;
  if (body.error || body.result?.error) throw new Error(JSON.stringify(body.error ?? body.result.error));
  return { value: JSON.parse(Buffer.from(body.result.result).toString()), block: body.result.block_height };
}

mkdirSync(OUT, { recursive: true });
for (const key of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(inst.instances)) {
  const contract = inst.instances[key].contractId;
  try {
    const { value: state, block } = await view(contract, 'get_state');
    const journal = [];
    for (let i = 0; i < state.journal_len; i += 100) journal.push(...(await view(contract, 'get_journal', { from_index: i, limit: 100 })).value);
    const rugs = [];
    for (let i = 0; i < state.rugs_count; i += 50) rugs.push(...(await view(contract, 'get_rugs', { from_index: i, limit: 50 })).value);
    const copy = {
      takenAt: Date.now(), block, state,
      params: (await view(contract, 'get_params')).value,
      gapBuy: (await view(contract, 'get_gap_buy')).value,
      gapHolder: (await view(contract, 'get_gap_holder')).value,
      journal, rugs,
    };
    writeFileSync(join(OUT, `${key}.json`), JSON.stringify(copy));
    console.log(`${key}: ${contract} block ${block}, ${journal.length} journal entries`);
  } catch (e) {
    console.log(`${key}: skipped (${(e as Error).message.slice(0, 100)})`);
  }
}
