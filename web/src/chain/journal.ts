import { B } from '../format/near';
import type { JournalEntry } from './types';

export interface AuditResult { ok: boolean; events: number; computed: bigint; supply: bigint }

/** sum(mints) - sum(burns), straight from the journal. */
export function replaySupply(entries: JournalEntry[]): bigint {
  let s = 0n;
  for (const e of entries) {
    if (e.kind === 'buy') s += B(e.tokens);
    else if (e.kind === 'sell' || e.kind === 'rug') s -= B(e.tokens);
  }
  return s;
}

export function audit(entries: JournalEntry[], supply: bigint): AuditResult {
  const computed = replaySupply(entries);
  return { ok: computed === supply, events: entries.length, computed, supply };
}

export function isBot(account: string, suffix: string): boolean {
  return account.endsWith(suffix);
}

/** Largest balance implied by the journal. The page re-reads it with ft_balance_of before use. */
export function topHolder(entries: JournalEntry[]): string | null {
  const net = new Map<string, bigint>();
  for (const e of entries) {
    const amount = B(e.tokens);
    if (e.kind === 'buy') net.set(e.account, (net.get(e.account) ?? 0n) + amount);
    else if (e.kind === 'sell' || e.kind === 'rug') net.set(e.account, (net.get(e.account) ?? 0n) - amount);
  }
  let best: string | null = null;
  let bestAmount = 0n;
  for (const [account, amount] of net) {
    if (amount > bestAmount) {
      best = account;
      bestAmount = amount;
    }
  }
  return best;
}

export function botShare(entries: JournalEntry[], suffix: string): { bots: bigint; total: bigint; pct: number } {
  let bots = 0n;
  let total = 0n;
  for (const e of entries) {
    if (e.kind !== 'buy' && e.kind !== 'sell') continue;
    const near = B(e.near);
    total += near;
    if (isBot(e.account, suffix)) bots += near;
  }
  const pct = total === 0n ? 0 : Number((bots * 10000n) / total) / 100;
  return { bots, total, pct };
}

export async function resolveTxHash(entry: JournalEntry): Promise<string | null> {
  try {
    const res = await fetch('https://tx.test.fastnear.com/v0/account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account_id: entry.account, is_signer: true, limit: 10, desc: true, max_block_height: entry.block }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { account_txs?: { transaction_hash: string; tx_block_height: number; is_signer: boolean }[] };
    const hit = body.account_txs?.find((t) => t.is_signer && t.tx_block_height <= entry.block);
    return hit?.transaction_hash ?? null;
  } catch {
    return null;
  }
}

export const explorerTx = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`;
export const explorerBlock = (block: number) => `https://testnet.nearblocks.io/blocks/${block}`;
export const explorerAccount = (id: string) => `https://testnet.nearblocks.io/address/${id}`;
