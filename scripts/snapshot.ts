// Writes web/public/snapshots/{fast,live}.json: a frozen copy the page shows, labelled as frozen,
// when the RPC cannot be reached. Every value is read at one final block. Reads only.
import { readFileSync, writeFileSync } from 'node:fs';
import { finalHeight, Pinned } from './lib/rpc';

const { instances } = JSON.parse(readFileSync('web/public/instances.json', 'utf8')) as { instances: Record<string, { contractId: string }> };

const JOURNAL = 200;
const RUGS = 50;

for (const [key, { contractId }] of Object.entries(instances)) {
  const block = await finalHeight();
  const c = new Pinned(contractId, block);
  const [state, params, gapBuy, gapHolder, jLen, rLen] = await Promise.all([
    c.view('get_state'), c.view('get_params'), c.view('get_gap_buy'), c.view('get_gap_holder'),
    c.view<number>('get_journal_len'), c.view<number>('get_rugs_len'),
  ]);
  const [journal, rugs] = await Promise.all([
    c.view('get_journal', { from_index: Math.max(0, jLen - JOURNAL), limit: JOURNAL }),
    c.view('get_rugs', { from_index: Math.max(0, rLen - RUGS), limit: RUGS }),
  ]);
  writeFileSync(`web/public/snapshots/${key}.json`, JSON.stringify({ takenAt: Date.now(), block, state, params, gapBuy, gapHolder, journal, rugs }));
  console.log(`${key}: ${contractId} at block ${block}, ${journal.length} journal entries, ${rugs.length} rugs`);
}
