// Demo bots: one action every few minutes per instance, using public methods only.
// Env: BOT_ACCOUNTS and BOT_KEYS (comma separated, same order), FAST_CONTRACT_ID, LIVE_CONTRACT_ID,
// NEAR_RPC_URL, BOTS_ENABLED. Keys only ever come from the environment.
import 'dotenv/config';
import { Account, JsonRpcProvider, KeyPairSigner, actions, teraToGas, type KeyPairString } from 'near-api-js';
import { decide, rugAction, type Action, type Market, type Profile, type Tuning } from './decide.ts';
import { sfc32 } from './rng.ts';

const RPC = process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com';
const GAS = teraToGas('100');
const NEAR = 10n ** 24n;
const milli = (n: bigint) => (n * NEAR) / 1000n;

if (process.env.BOTS_ENABLED === '0') {
  console.log('bots disabled');
  process.exit(0);
}

const ids = (process.env.BOT_ACCOUNTS ?? '').split(',').filter(Boolean);
const keys = (process.env.BOT_KEYS ?? '').split(',').filter(Boolean);
if (!ids.length || ids.length !== keys.length) throw new Error('BOT_ACCOUNTS and BOT_KEYS must list the same accounts');

const PROFILES: Profile[] = ['rugger', 'buyer', 'seller', 'washer', 'accumulator', 'buyer'];
const provider = new JsonRpcProvider({ url: RPC });

interface Instance { contract: string; tuning: Tuning; rugFee: bigint; tickMs: [number, number] }
const instances: Instance[] = [
  process.env.FAST_CONTRACT_ID && {
    contract: process.env.FAST_CONTRACT_ID,
    tuning: { minTrade: milli(40n), maxTrade: milli(500n), rugMargin: milli(2n), supplyTarget: 200_000n * 10n ** 18n },
    rugFee: milli(6n),
    tickMs: [5 * 60_000, 10 * 60_000] as [number, number],
  },
  process.env.LIVE_CONTRACT_ID && {
    contract: process.env.LIVE_CONTRACT_ID,
    tuning: { minTrade: milli(100n), maxTrade: milli(1500n), rugMargin: milli(5n), supplyTarget: 500_000n * 10n ** 18n },
    rugFee: milli(6n),
    tickMs: [20 * 60_000, 40 * 60_000] as [number, number],
  },
].filter(Boolean) as Instance[];

const bots = ids.map((id, i) => ({
  id,
  profile: PROFILES[i % PROFILES.length]!,
  account: new Account(id, provider, KeyPairSigner.fromSecretKey(keys[i] as KeyPairString)),
}));
type Bot = (typeof bots)[number];

async function view<T = any>(contract: string, method: string, args: object = {}): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'query',
      params: { request_type: 'call_function', finality: 'optimistic', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as any;
  if (body.error || body.result?.error) throw new Error(JSON.stringify(body.error ?? body.result.error));
  return JSON.parse(Buffer.from(body.result.result).toString()) as T;
}

async function market(inst: Instance, bot: Bot): Promise<Market> {
  const [s, gapBuy, gapHolder, balance, acct] = await Promise.all([
    view(inst.contract, 'get_state'),
    view(inst.contract, 'get_gap_buy', { account_id: bot.id }),
    view(inst.contract, 'get_gap_holder'),
    view<string>(inst.contract, 'ft_balance_of', { account_id: bot.id }),
    bot.account.getState(),
  ]);
  return {
    round: s.round_id,
    pot: BigInt(s.pot),
    tRequired: BigInt(s.t_required),
    supply: BigInt(s.supply),
    gapBuy: { feasible: gapBuy.feasible, positive: gapBuy.positive, abs: BigInt(gapBuy.abs), depositNeeded: BigInt(gapBuy.deposit_needed), tRequired: BigInt(gapBuy.t_required) },
    gapHolder: { feasible: gapHolder.feasible, positive: gapHolder.positive, abs: BigInt(gapHolder.abs) },
    balance: BigInt(balance),
    near: BigInt(acct.balance.available),
  };
}

async function send(inst: Instance, bot: Bot, action: Action) {
  const fc = (m: string, a: object, d: bigint) => actions.functionCall(m, a, GAS, d);
  const list =
    action.kind === 'buy' ? [fc('buy', { min_out: '0' }, action.deposit)]
    : action.kind === 'sell' ? [fc('sell', { amount: action.amount.toString(), min_out: '0' }, 1n)]
    : action.kind === 'rug' ? [fc('rug', { round_id: action.round, min_payout: action.minPayout.toString(), max_burn: action.maxBurn.toString() }, 1n)]
    : action.kind === 'buy_rug' ? [fc('buy', { min_out: '0' }, action.deposit), fc('rug', { round_id: action.round, min_payout: action.minPayout.toString(), max_burn: action.maxBurn.toString() }, 1n)]
    : [];
  if (!list.length) return;
  const r = await bot.account.signAndSendTransaction({ receiverId: inst.contract, actions: list, waitUntil: 'EXECUTED_OPTIMISTIC', throwOnFailure: false });
  const failure = (r.status as any).Failure ?? (r.receipts_outcome as any[]).map((o) => o.outcome.status.Failure).find(Boolean);
  console.log(`${new Date().toISOString()} ${inst.contract} ${bot.id} ${action.kind} ${failure ? `FAILED ${JSON.stringify(failure).slice(0, 160)}` : r.transaction_outcome.id}`);
}

const seed = Number(process.env.BOT_SEED ?? 20261114);
let busy = false;

async function act(inst: Instance, rand: () => number) {
  if (busy) return;
  busy = true;
  try {
    const bot = bots[Math.floor(rand() * bots.length)]!;
    const m = await market(inst, bot);
    const action = decide(bot.profile, m, inst.tuning, inst.rugFee, rand);
    if (action.kind === 'idle') console.log(`${new Date().toISOString()} ${bot.id} idle: ${action.why}`);
    else await send(inst, bot, action);
  } catch (e) {
    console.log(`${new Date().toISOString()} tick error: ${String(e).slice(0, 200)}`);
  } finally {
    busy = false;
  }
}

// The rugger watches every minute: this is the attentive bot the page warns about.
async function watch(inst: Instance) {
  if (busy) return;
  const ruggers = bots.filter((b) => b.profile === 'rugger');
  busy = true;
  try {
    for (const bot of ruggers) {
      const m = await market(inst, bot);
      const action = rugAction(m, inst.tuning, inst.rugFee);
      if (action) {
        await send(inst, bot, action);
        break;
      }
    }
  } catch (e) {
    console.log(`${new Date().toISOString()} watch error: ${String(e).slice(0, 200)}`);
  } finally {
    busy = false;
  }
}

for (const [i, inst] of instances.entries()) {
  const rand = sfc32(seed + i);
  const loop = async () => {
    await act(inst, rand);
    const [lo, hi] = inst.tickMs;
    setTimeout(loop, lo + rand() * (hi - lo));
  };
  setTimeout(loop, 2000 + i * 5000);
  setInterval(() => void watch(inst), 60_000);
}
console.log(`bots running: ${bots.length} accounts on ${instances.map((x) => x.contract).join(', ')}`);
