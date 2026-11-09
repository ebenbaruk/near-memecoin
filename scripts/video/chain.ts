// Chain side of the demo shoot, on the dedicated instance film.acr-ops.testnet (same wasm as the others).
// The extra actor is bot-6.acr-bots.testnet: its suffix gives it the BOT badge on the page, like every demo bot.
// Usage: node scripts/video/chain.ts setup | state | buy <near> | wash <rounds> <near> | until-live [margin] | rug | cleanup
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, teraToGas, type KeyPairString } from 'near-api-js';

export const CONTRACT = process.env.FILM_CONTRACT_ID ?? 'film.acr-ops.testnet';
export const BOT = 'bot-6.acr-bots.testnet';
const RPC = process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com';
const OPERATOR = 'acr-ops.testnet';
const BOTS_PARENT = 'acr-bots.testnet';
const CRED = (id: string) => `${homedir()}/.near-credentials/testnet/${id}.json`;
const provider = new JsonRpcProvider({ url: RPC });
const GAS = teraToGas('100');
export const NEAR = 10n ** 24n;
const B = (v: string | number | bigint) => BigInt(v);
type Json = Record<string, any>;

export function account(id: string): Account {
  const key = JSON.parse(readFileSync(CRED(id), 'utf8')).private_key as KeyPairString;
  return new Account(id, provider, KeyPairSigner.fromSecretKey(key));
}

export async function view<T = Json>(method: string, args: Json = {}): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'query',
      params: { request_type: 'call_function', finality: 'optimistic', account_id: CONTRACT, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') },
    }),
  });
  const body = (await res.json()) as Json;
  if (body.error || body.result?.error) throw new Error(JSON.stringify(body.error ?? body.result.error));
  return JSON.parse(Buffer.from(body.result.result).toString()) as T;
}

async function send(a: Account, receiverId: string, acts: ReturnType<typeof actions.transfer>[]) {
  const r = await a.signAndSendTransaction({ receiverId, actions: acts, waitUntil: 'EXECUTED_OPTIMISTIC', throwOnFailure: false });
  const failure = (r.status as Json).Failure ?? (r.receipts_outcome as Json[]).map((o) => o.outcome.status.Failure).find(Boolean);
  if (failure) throw new Error(`${r.transaction_outcome.id}: ${JSON.stringify(failure)}`);
  return r.transaction_outcome.id as string;
}
const fc = (method: string, args: Json, deposit: bigint) => actions.functionCall(method, args, GAS, deposit);

export interface Snap { round: number; pot: bigint; rugPrice: bigint; take: bigint; feasible: boolean; supply: bigint }
export async function snap(accountId?: string): Promise<Snap> {
  const [s, g, p] = await Promise.all([view('get_state'), view('get_gap_buy', { account_id: accountId ?? null }), view('get_params')]);
  const rugPrice = B(g.cost) + B(p.rug_fee);
  return { round: s.round_id, pot: B(s.pot), rugPrice, take: B(s.pot) - rugPrice, feasible: g.feasible, supply: B(s.supply) };
}
const fmt = (y: bigint) => (Number(y / 10n ** 18n) / 1e6).toFixed(4);
export const show = (s: Snap) => `round ${s.round} pot ${fmt(s.pot)} rug price ${fmt(s.rugPrice)} take ${fmt(s.take)} feasible ${s.feasible}`;

export const buy = (near: bigint) => send(account(BOT), CONTRACT, [fc('buy', { min_out: '0' }, near)]);
export async function sellAll() {
  const bal = B(await view<string>('ft_balance_of', { account_id: BOT }));
  if (bal === 0n) return null;
  return send(account(BOT), CONTRACT, [fc('sell', { amount: bal.toString(), min_out: '0' }, 1n)]);
}
/** A round trip pays the fee twice into the pot without moving the supply much. */
export async function wash(near: bigint) {
  await buy(near);
  await new Promise((r) => setTimeout(r, 1500));
  return sellAll();
}
/** Buy then rug in one transaction, exactly as the page and the bots do. */
export async function rug() {
  const g = await view('get_gap_buy', { account_id: BOT });
  const s = await view('get_state');
  const p = await view('get_params');
  const minPayout = B(s.pot) - B(p.rug_fee);
  const maxBurn = (B(g.t_required) * 105n) / 100n;
  return send(account(BOT), CONTRACT, [
    fc('buy', { min_out: '0' }, (B(g.deposit_needed) * 101n) / 100n),
    fc('rug', { round_id: s.round_id, min_payout: (minPayout * 95n / 100n).toString(), max_burn: maxBurn.toString() }, 1n),
  ]);
}

/** Creates the top-level account the page asked the faucet for, paid by the operator instead (the faucet rate-limits per IP). */
export async function createBurner(id: string, publicKey: string, near: bigint) {
  return send(account(OPERATOR), 'testnet', [fc('create_account', { new_account_id: id, new_public_key: publicKey }, near)]);
}
export async function deleteBurner(id: string, secret: string) {
  const a = new Account(id, provider, KeyPairSigner.fromSecretKey(secret as KeyPairString));
  const bal = B(await view<string>('ft_balance_of', { account_id: id }).catch(() => '0'));
  if (bal > 0n) await send(a, CONTRACT, [fc('sell', { amount: bal.toString(), min_out: '0' }, 1n)]).catch(() => null);
  return send(a, id, [actions.deleteAccount(OPERATOR)]);
}

async function setup() {
  if (existsSync(CRED(BOT))) return console.log(`${BOT} already set up`);
  await send(account(OPERATOR), BOTS_PARENT, [actions.transfer(3n * NEAR)]);
  const key = KeyPair.fromRandom('ed25519');
  await send(account(BOTS_PARENT), BOT, [actions.createAccount(), actions.transfer(6n * NEAR), actions.addFullAccessKey(key.getPublicKey())]);
  writeFileSync(CRED(BOT), JSON.stringify({ account_id: BOT, public_key: key.getPublicKey().toString(), private_key: key.toString() }), { mode: 0o600 });
  console.log(`${BOT} created`);
}

/** Washes until the take is at least `margin` NEAR above zero. */
export async function untilLive(margin: bigint, near = 2n * NEAR, onStep?: (s: Snap) => void) {
  for (let i = 0; i < 30; i++) {
    const s = await snap();
    onStep?.(s);
    if (s.feasible && s.take >= margin) return s;
    if (s.supply === 0n || s.pot < s.rugPrice / 3n) await wash(near);
    else await wash(near / 2n);
  }
  throw new Error('pot never passed the rug price');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, a1, a2] = process.argv.slice(2);
  const near = (v: string | undefined, d: string) => BigInt(Math.round(Number(v ?? d) * 1e6)) * 10n ** 18n;
  if (cmd === 'setup') await setup();
  else if (cmd === 'state') console.log(show(await snap()));
  else if (cmd === 'buy') console.log(await buy(near(a1, '1')));
  else if (cmd === 'wash') for (let i = 0; i < Number(a1 ?? 1); i++) { await wash(near(a2, '1')); console.log(show(await snap())); }
  else if (cmd === 'until-live') console.log(show(await untilLive(near(a1, '0.02'), 2n * NEAR, (s) => console.log(show(s)))));
  else if (cmd === 'rug') console.log(await rug());
  else if (cmd === 'cleanup') { await sellAll().catch(() => null); await send(account(BOT), BOT, [actions.deleteAccount(OPERATOR)]); console.log(`${BOT} deleted, NEAR back to ${OPERATOR}`); }
  else console.log('usage: setup | state | buy <near> | wash <rounds> <near> | until-live [margin] | rug | cleanup');
}
