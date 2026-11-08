// A real run on the fast instance, no secret needed: creates a throwaway faucet account, buys, sells,
// then buys and rugs in one transaction, and prints explorer links.
// Usage: npm run try:testnet [-- --contract <id>]
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, teraToGas, type KeyPairString } from 'near-api-js';
import { RPC_URL, rpc } from './lib/rpc.ts';
import { instanceList } from './verify-chain.ts';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const contract = arg('--contract') ?? instanceList().find((t) => t.key === 'fast')!.contract;
const OPERATOR = process.env.OPERATOR_ID ?? 'acr-ops.testnet';
const provider = new JsonRpcProvider({ url: RPC_URL });
const GAS = teraToGas('100');
const NEAR = 10n ** 24n;
const link = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;

// Optimistic finality: the state must include the transaction that just executed.
async function view<T = any>(method: string, args: object = {}): Promise<T> {
  const r = await rpc<any>('query', {
    request_type: 'call_function', finality: 'optimistic', account_id: contract, method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  });
  if (r.error) throw new Error(r.error);
  return JSON.parse(Buffer.from(r.result).toString()) as T;
}

async function faucetBurner(): Promise<Account> {
  const key = KeyPair.fromRandom('ed25519');
  const id = `rugger-${Math.random().toString(16).slice(2, 10)}.testnet`;
  const res = await fetch('https://helper.nearprotocol.com/account', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: key.getPublicKey().toString() }),
  });
  if (!res.ok) {
    console.error(`The public testnet faucet refused the account (HTTP ${res.status}): ${(await res.text()).slice(0, 120)}`);
    console.error('It rate-limits per IP. Retry later, or from another network. Nothing was spent.');
    process.exit(3);
  }
  await new Promise((r) => setTimeout(r, 3000));
  return new Account(id, provider, KeyPairSigner.fromSecretKey(key.toString() as KeyPairString));
}

// Maintainer path, used to test this script while the faucet rate-limits our own IP.
async function operatorBurner(): Promise<Account> {
  const creds = JSON.parse(readFileSync(`${homedir()}/.near-credentials/testnet/${OPERATOR}.json`, 'utf8'));
  const op = new Account(OPERATOR, provider, KeyPairSigner.fromSecretKey(creds.private_key as KeyPairString));
  const key = KeyPair.fromRandom('ed25519');
  const id = `rugger${Date.now().toString(36)}.${OPERATOR}`;
  await op.signAndSendTransaction({ receiverId: id, actions: [actions.createAccount(), actions.transfer(10n * NEAR), actions.addFullAccessKey(key.getPublicKey())] });
  return new Account(id, provider, KeyPairSigner.fromSecretKey(key.toString() as KeyPairString));
}

const me = process.argv.includes('--from-operator') ? await operatorBurner() : await faucetBurner();
console.log(`Throwaway account: ${me.accountId}\nContract: ${contract}\n`);

async function tx(label: string, calls: [string, object, bigint][]) {
  const r = await me.signAndSendTransaction({
    receiverId: contract,
    actions: calls.map(([m, a, d]) => actions.functionCall(m, a, GAS, d)),
    waitUntil: 'EXECUTED_OPTIMISTIC',
    throwOnFailure: false,
  });
  const failure = (r.status as any).Failure ?? (r.receipts_outcome as any[]).map((o) => o.outcome.status.Failure).find(Boolean);
  if (failure) throw new Error(`${label} failed: ${JSON.stringify(failure).slice(0, 300)}`);
  console.log(`${label}\n  ${link(r.transaction_outcome.id)}`);
  return r;
}

async function run() {
  await tx('Bought with 2 NEAR', [['buy', { min_out: '0' }, 2n * NEAR]]);
  const bal = BigInt(await view<string>('ft_balance_of', { account_id: me.accountId }));
  const sellAmount = bal / 4n;
  await tx('Sold a quarter of it', [['sell', { amount: sellAmount.toString(), min_out: '0' }, 1n]]);

  let gap = await view('get_gap_buy', { account_id: me.accountId });
  for (let i = 0; i < 3 && !gap.feasible; i++) {
    await tx('Pot below the minimum: buying again to fill it', [['buy', { min_out: '0' }, NEAR]]);
    gap = await view('get_gap_buy', { account_id: me.accountId });
  }
  const state = await view('get_state');
  const pad = (v: bigint) => (v * 101n) / 100n + 1n;
  await tx(`Rugged round ${state.round_id}: buy + burn + take the pot in one transaction`, [
    ['buy', { min_out: '0' }, pad(BigInt(gap.deposit_needed))],
    ['rug', { round_id: state.round_id, min_payout: '0', max_burn: pad(BigInt(gap.t_required)).toString() }, 1n],
  ]);

  const rugs = await view<any[]>('get_rugs', { from_index: Math.max(0, state.rugs_count), limit: 50 });
  const mine = rugs.find((g) => g.rugger === me.accountId);
  if (!mine) throw new Error('the rug is not in get_rugs');
  console.log(`\nget_rugs names ${mine.rugger}: burned ${mine.burned} base units, took ${mine.payout} yocto.`);
  const after = await view('get_state');
  console.log(`Round is now ${after.round_id}, pot ${after.pot}.`);
}

let failure: unknown;
await run().catch((e) => { failure = e; });
await new Promise((r) => setTimeout(r, 3000));
await me.signAndSendTransaction({ receiverId: me.accountId, actions: [actions.deleteAccount(OPERATOR)] }).then(
  () => console.log('Throwaway account deleted.'),
  (e) => console.log(`could not delete the throwaway account: ${e}`),
);
if (failure) throw failure;
