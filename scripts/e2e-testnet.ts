// End-to-end check of a deployed instance with real testnet transactions.
// Usage: npx tsx scripts/e2e-testnet.ts <contract-id>
// Creates two throwaway sub-accounts of the operator and deletes them at the end.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, teraToGas, type KeyPairString } from 'near-api-js';

const RPC = process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com';
const contractId = process.argv[2];
if (!contractId) throw new Error('usage: e2e-testnet.ts <contract-id>');
const provider = new JsonRpcProvider({ url: RPC });
const GAS = teraToGas('100');

type Json = Record<string, any>;

async function view<T = Json>(method: string, args: Json = {}): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'query',
      params: {
        request_type: 'call_function', finality: 'optimistic', account_id: contractId,
        method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      },
    }),
  });
  const body = (await res.json()) as Json;
  if (body.error || body.result?.error) throw new Error(JSON.stringify(body.error ?? body.result.error));
  return JSON.parse(Buffer.from(body.result.result).toString()) as T;
}

// Throwaway sub-accounts of the operator: the public faucet rate-limits per IP for hours.
function operator(): Account {
  const id = process.env.OPERATOR_ID ?? 'acr-ops.testnet';
  const key = process.env.OPERATOR_KEY ?? JSON.parse(readFileSync(`${homedir()}/.near-credentials/testnet/${id}.json`, 'utf8')).private_key;
  return new Account(id, provider, KeyPairSigner.fromSecretKey(key as KeyPairString));
}

async function burner(tag: string, near: bigint): Promise<Account> {
  const op = operator();
  const key = KeyPair.fromRandom('ed25519');
  const id = `e2e${tag}${Date.now().toString(36)}.${op.accountId}`;
  await op.signAndSendTransaction({
    receiverId: id,
    actions: [actions.createAccount(), actions.transfer(near), actions.addFullAccessKey(key.getPublicKey())],
    waitUntil: 'EXECUTED_OPTIMISTIC',
  });
  return new Account(id, provider, KeyPairSigner.fromSecretKey(key.toString() as KeyPairString));
}

async function refund(a: Account) {
  const beneficiary = process.env.OPERATOR_ID ?? 'acr-ops.testnet';
  await a.signAndSendTransaction({ receiverId: a.accountId, actions: [actions.deleteAccount(beneficiary)], waitUntil: 'EXECUTED_OPTIMISTIC' });
}

function fc(method: string, args: Json, deposit: bigint) {
  return actions.functionCall(method, args, GAS, deposit);
}

async function send(a: Account, acts: ReturnType<typeof fc>[]) {
  const r = await a.signAndSendTransaction({ receiverId: contractId, actions: acts, waitUntil: 'EXECUTED_OPTIMISTIC', throwOnFailure: false });
  const failure = JSON.stringify((r.status as Json).Failure ?? (r.receipts_outcome as Json[]).map((o) => o.outcome.status.Failure).find(Boolean) ?? '');
  const gas = (r.receipts_outcome as Json[]).reduce((sum, o) => sum + BigInt(o.outcome.gas_burnt), BigInt(r.transaction_outcome.outcome.gas_burnt));
  return { hash: r.transaction_outcome.id, failure, gasT: Number(gas / 10n ** 9n) / 1000, logs: (r.receipts_outcome as Json[]).flatMap((o) => o.outcome.logs as string[]) };
}

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

const NEAR = 10n ** 24n;
const burners: Account[] = [];
// Whatever happens below, throwaway accounts give their NEAR back to the operator.
async function refundAll() {
  for (const a of burners.splice(0)) await refund(a).catch((e) => console.log(`refund ${a.accountId}: ${e}`));
}
process.on('uncaughtException', (e) => { console.error(e); void refundAll().finally(() => process.exit(2)); });
process.on('unhandledRejection', (e) => { console.error(e); void refundAll().finally(() => process.exit(2)); });
const before0 = await view('get_state').catch((e) => { throw new Error(`contract not readable, nothing was funded: ${e}`); });
void before0;
const alice = await burner('a', 4n * NEAR); burners.push(alice);
const bob = await burner('b', 2n * NEAR); burners.push(bob);
console.log(`accounts: ${alice.accountId}, ${bob.accountId}`);

const before = await view('get_state');

// Plain buy.
let tx = await send(alice, [fc('buy', { min_out: '0' }, 3n * NEAR)]);
check('buy succeeds', tx.failure === '""', `tx ${tx.hash}, ${tx.gasT} Tgas`);
check('buy emits NEP-141 ft_mint', tx.logs.some((l) => l.includes('"event":"ft_mint"') && l.includes('"memo":"buy"')));
check('buy emits anyone_can_rug event', tx.logs.some((l) => l.includes('"standard":"anyone_can_rug"') && l.includes('"event":"buy"')));
// The RPC is load-balanced: a read right after a transaction can hit a replica that is behind.
let balance = 0n;
for (let i = 0; i < 12 && balance === 0n; i++) {
  if (i) await new Promise((r) => setTimeout(r, 1000));
  balance = BigInt(await view<string>('ft_balance_of', { account_id: alice.accountId }));
}
check('tokens minted', balance > 0n, balance.toString());

// Slippage is refused and refunds.
tx = await send(alice, [fc('buy', { min_out: (10n ** 36n).toString() }, NEAR / 10n)]);
check('min_out refused with E_SLIPPAGE', tx.failure.includes('E_SLIPPAGE'));

// Sell.
const sellAmount = balance / 10n;
const quote = BigInt(await view<string>('quote_sell', { amount: sellAmount.toString() }));
const nearBefore = (await alice.getState()).balance.available;
tx = await send(alice, [fc('sell', { amount: sellAmount.toString(), min_out: quote.toString() }, 1n)]);
check('sell succeeds at the quote', tx.failure === '""', `tx ${tx.hash}, ${tx.gasT} Tgas`);
await new Promise((r) => setTimeout(r, 3000));
const nearAfter = (await alice.getState()).balance.available;
check('sell pays NEAR out', nearAfter > nearBefore, `${nearBefore} -> ${nearAfter}`);

// A rug by someone without tokens reverts.
let state = await view('get_state');
tx = await send(bob, [fc('rug', { round_id: state.round_id, min_payout: '0', max_burn: state.t_required }, 1n)]);
check('rug without tokens refused', tx.failure.includes('E_INSUFFICIENT_TOKENS'));

// Wrong round reverts.
tx = await send(alice, [fc('rug', { round_id: state.round_id + 7, min_payout: '0', max_burn: state.t_required }, 1n)]);
check('stale round refused', tx.failure.includes('E_ROUND_STALE'));

// Atomic batch where the rug fails: nothing stays.
const gap = await view('get_gap_buy', { account_id: bob.accountId });
state = await view('get_state');
const bobNearBefore = (await bob.getState()).balance.available;
tx = await send(bob, [
  fc('buy', { min_out: gap.min_out }, BigInt(gap.deposit_needed)),
  fc('rug', { round_id: state.round_id + 1, min_payout: '0', max_burn: gap.t_required }, 1n),
]);
check('failed batch reports the rug error', tx.failure.includes('E_ROUND_STALE'));
const bobTokens = BigInt(await view<string>('ft_balance_of', { account_id: bob.accountId }));
check('failed batch minted nothing', bobTokens === 0n, bobTokens.toString());
await new Promise((r) => setTimeout(r, 3000));
const bobNearAfter = (await bob.getState()).balance.available;
check('failed batch refunded the deposit', bobNearBefore - bobNearAfter < NEAR / 20n, `lost ${bobNearBefore - bobNearAfter} yocto`);

// Successful atomic buy + rug. Spec page rule: deposit x1.01, max_burn x1.01.
const fresh = await view('get_gap_buy', { account_id: bob.accountId });
state = await view('get_state');
const params = await view('get_params');
if (!fresh.feasible) {
  console.log(`note: pot below minimum, topping up with wash trades`);
}
let guard = 0;
while (!(await view('get_gap_buy', { account_id: bob.accountId })).feasible && guard++ < 6) {
  await send(alice, [fc('buy', { min_out: '0' }, 2n * NEAR)]);
}
const g2 = await view('get_gap_buy', { account_id: bob.accountId });
state = await view('get_state');
check('gap_buy is feasible', g2.feasible === true, `pot ${state.pot}, deposit ${g2.deposit_needed}`);
const pad = (v: bigint) => (v * 101n) / 100n + 1n;
const rugsBefore = state.rugs_count as number;
tx = await send(bob, [
  fc('buy', { min_out: '0' }, pad(BigInt(g2.deposit_needed))),
  fc('rug', { round_id: state.round_id, min_payout: '0', max_burn: pad(BigInt(g2.t_required)).toString() }, 1n),
]);
check('buy + rug in one transaction succeeds', tx.failure === '""', `tx ${tx.hash}, ${tx.gasT} Tgas ${tx.failure}`);
check('rug emits NEP-141 ft_burn', tx.logs.some((l) => l.includes('"event":"ft_burn"') && l.includes('"memo":"rug"')));
check('rug emits anyone_can_rug event', tx.logs.some((l) => l.includes('"event":"rug"')));
await new Promise((r) => setTimeout(r, 2000));
const after = await view('get_state');
check('round advanced', after.round_id === state.round_id + 1);
check('pot is zero', BigInt(after.pot) === 0n, after.pot);
check('reserve unchanged by rug', after.reserve === state.reserve || BigInt(after.reserve) > BigInt(state.reserve));
check('rug recorded', after.rugs_count === rugsBefore + 1);
check('surplus positive', after.surplus.positive === true, after.surplus.abs);
const rugs = await view<Json[]>('get_rugs', { from_index: rugsBefore, limit: 50 });
check('rug names the rugger', rugs[0]?.rugger === bob.accountId);

// A second rug on the old round loses the race and costs only gas.
tx = await send(alice, [fc('rug', { round_id: state.round_id, min_payout: '0', max_burn: g2.t_required }, 1n)]);
check('loser of the race reverts', tx.failure.includes('E_ROUND_STALE'));

// Private and disabled methods.
tx = await send(bob, [fc('on_payout', { account_id: bob.accountId, amount: '1', kind: 'rug' }, 0n)]);
check('on_payout is private', tx.failure.toLowerCase().includes('private'), tx.failure.slice(0, 80));
tx = await send(bob, [fc('ft_resolve_transfer', { sender_id: alice.accountId, receiver_id: bob.accountId, amount: '1' }, 0n)]);
check('ft_resolve_transfer is private', tx.failure.toLowerCase().includes('private'), tx.failure.slice(0, 80));
tx = await send(bob, [fc('storage_unregister', { force: true }, 1n)]);
check('storage_unregister is disabled', tx.failure.includes('E_UNREGISTER_DISABLED'));

// Journal replay against live state.
let supply = 0n;
let pot = 0n;
const len = await view<number>('get_journal_len');
for (let from = 0; from < len; from += 100) {
  for (const e of await view<Json[]>('get_journal', { from_index: from, limit: 100 })) {
    if (e.kind === 'buy') { supply += BigInt(e.tokens); pot += BigInt(e.fee); }
    if (e.kind === 'sell') { supply -= BigInt(e.tokens); pot += BigInt(e.fee); }
    if (e.kind === 'rug') { supply -= BigInt(e.tokens); pot = 0n; }
    if (e.kind === 'payout_failed') { pot += BigInt(e.near); }
  }
}
const final = await view('get_state');
check('journal replays to supply', supply.toString() === final.supply, `${len} entries`);
check('journal replays to pot', pot.toString() === final.pot);
check('params unchanged', JSON.stringify(await view('get_params')) === JSON.stringify(params));
console.log(before.journal_len === undefined ? '' : `journal grew from ${before.journal_len} to ${final.journal_len}`);

await refundAll();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
