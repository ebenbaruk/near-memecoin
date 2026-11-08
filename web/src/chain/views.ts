// Typed view calls. Everything economic comes from here: the page does no curve maths.
import { rpc, QueryError } from './rpc';
import type { Gap, GapBuy, JournalEntry, Params, RugRecord, State } from './types';

interface CallResult { result: number[]; block_height: number }

const encoder = new TextEncoder();
const toBase64 = (s: string) => btoa(String.fromCharCode(...encoder.encode(s)));

export async function viewAt<T>(contract: string, method: string, args: object = {}): Promise<{ value: T; block: number }> {
  const res = await rpc<CallResult>('query', {
    request_type: 'call_function',
    finality: 'optimistic',
    account_id: contract,
    method_name: method,
    args_base64: toBase64(JSON.stringify(args)),
  });
  return { value: JSON.parse(new TextDecoder().decode(new Uint8Array(res.result))) as T, block: res.block_height };
}

const view = async <T>(contract: string, method: string, args: object = {}) => (await viewAt<T>(contract, method, args)).value;

export const getParams = (c: string) => view<Params>(c, 'get_params');
export const getState = (c: string) => viewAt<State>(c, 'get_state');
export const getGapBuy = (c: string, account?: string | null) =>
  view<GapBuy>(c, 'get_gap_buy', account ? { account_id: account } : {});
export const getGapHolder = (c: string) => view<Gap>(c, 'get_gap_holder');
export const getGapExit = (c: string, account: string) => view<Gap>(c, 'get_gap_exit', { account_id: account });
export const getRugs = (c: string, from: number, limit: number) =>
  view<RugRecord[]>(c, 'get_rugs', { from_index: from, limit });
export const getJournal = (c: string, from: number, limit: number) =>
  view<JournalEntry[]>(c, 'get_journal', { from_index: from, limit });
export const quoteBuy = (c: string, nearIn: bigint, account?: string | null) =>
  view<string>(c, 'quote_buy', account ? { near_in: nearIn.toString(), account_id: account } : { near_in: nearIn.toString() });
export const quoteSell = (c: string, amount: bigint) => view<string>(c, 'quote_sell', { amount: amount.toString() });
export const ftBalance = (c: string, account: string) => view<string>(c, 'ft_balance_of', { account_id: account });
export const ftTotalSupply = (c: string) => view<string>(c, 'ft_total_supply');

export interface AccountView { amount: string; locked: string; storage_usage: number; code_hash: string }

export async function viewAccount(account: string): Promise<AccountView | null> {
  try {
    return await rpc<AccountView>('query', { request_type: 'view_account', finality: 'optimistic', account_id: account });
  } catch (e) {
    if (e instanceof QueryError && e.cause_ === 'UNKNOWN_ACCOUNT') return null;
    throw e;
  }
}

export async function accessKeys(account: string): Promise<{ public_key: string; access_key: { permission: unknown } }[]> {
  const res = await rpc<{ keys: { public_key: string; access_key: { permission: unknown } }[] }>('query', {
    request_type: 'view_access_key_list',
    finality: 'optimistic',
    account_id: account,
  });
  return res.keys;
}

const STORAGE_BYTE_COST = 10n ** 19n;
/** Spendable NEAR: balance minus what its own storage keeps locked. */
export function spendable(a: AccountView): bigint {
  const amount = BigInt(a.amount);
  const storage = BigInt(a.storage_usage) * STORAGE_BYTE_COST;
  const locked = BigInt(a.locked);
  const held = storage > locked ? storage - locked : 0n;
  return amount > held ? amount - held : 0n;
}
