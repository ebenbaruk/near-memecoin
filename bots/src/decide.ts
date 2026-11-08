// Pure decision logic for the demo bots. Bots are ordinary players: they call public methods only,
// and a bot rugs only when the public price makes it worthwhile.

export type Profile = 'buyer' | 'seller' | 'accumulator' | 'washer' | 'rugger';

export interface Market {
  round: number;
  pot: bigint;
  tRequired: bigint;
  supply: bigint;
  /** Gap for this bot, from get_gap_buy. */
  gapBuy: { feasible: boolean; positive: boolean; abs: bigint; depositNeeded: bigint; tRequired: bigint };
  /** Gap for a holder of at least T, from get_gap_holder. */
  gapHolder: { feasible: boolean; positive: boolean; abs: bigint };
  balance: bigint;
  near: bigint;
}

export interface Tuning {
  /** Smallest and largest trade in yocto. */
  minTrade: bigint;
  maxTrade: bigint;
  /** A rug must clear this margin over gas, in yocto. */
  rugMargin: bigint;
  /** Above this supply the crowd leans towards selling. */
  supplyTarget: bigint;
}

export type Action =
  | { kind: 'idle'; why: string }
  | { kind: 'buy'; deposit: bigint }
  | { kind: 'sell'; amount: bigint }
  | { kind: 'rug'; round: number; minPayout: bigint; maxBurn: bigint }
  | { kind: 'buy_rug'; round: number; deposit: bigint; minPayout: bigint; maxBurn: bigint };

export type Rand = () => number;

export const STOP_BELOW = 2n * 10n ** 24n;

function pad(v: bigint): bigint {
  return (v * 101n) / 100n + 1n;
}

function tradeSize(t: Tuning, rand: Rand): bigint {
  const span = t.maxTrade - t.minTrade;
  return t.minTrade + (span * BigInt(Math.floor(rand() * 1000))) / 1000n;
}

function share(amount: bigint, rand: Rand, lo: number, hi: number): bigint {
  const bps = Math.floor((lo + rand() * (hi - lo)) * 10_000);
  return (amount * BigInt(bps)) / 10_000n;
}

/** Only rugs that clear the printed price. Holding enough tokens is the cheapest route. */
export function rugAction(m: Market, t: Tuning, rugFee: bigint): Action | null {
  const minPayout = m.pot > rugFee ? m.pot - rugFee : 0n;
  if (m.balance >= m.tRequired && m.tRequired > 0n && m.gapHolder.feasible && m.gapHolder.positive && m.gapHolder.abs >= t.rugMargin) {
    return { kind: 'rug', round: m.round, minPayout, maxBurn: pad(m.tRequired) };
  }
  if (m.gapBuy.feasible && m.gapBuy.positive && m.gapBuy.abs >= t.rugMargin && pad(m.gapBuy.depositNeeded) + STOP_BELOW / 2n < m.near) {
    return { kind: 'buy_rug', round: m.round, deposit: pad(m.gapBuy.depositNeeded), minPayout: 0n, maxBurn: pad(m.gapBuy.tRequired) };
  }
  return null;
}

export function decide(profile: Profile, m: Market, t: Tuning, rugFee: bigint, rand: Rand): Action {
  if (m.near < STOP_BELOW) return { kind: 'idle', why: 'balance under 2 NEAR' };

  // Any bot watching the Gap would take a free pot; only the rugger profile is built to.
  if (profile === 'rugger') {
    return rugAction(m, t, rugFee) ?? (m.balance === 0n ? { kind: 'buy', deposit: t.minTrade } : { kind: 'idle', why: 'waiting for the Gap' });
  }

  const crowded = m.supply > t.supplyTarget;
  switch (profile) {
    case 'buyer':
      return crowded && m.balance > 0n && rand() < 0.5
        ? { kind: 'sell', amount: share(m.balance, rand, 0.2, 0.6) }
        : { kind: 'buy', deposit: tradeSize(t, rand) };
    case 'seller':
      return m.balance > 0n
        ? { kind: 'sell', amount: share(m.balance, rand, 0.3, 0.9) }
        : { kind: 'buy', deposit: tradeSize(t, rand) };
    case 'accumulator':
      return crowded && m.balance > 0n
        ? { kind: 'sell', amount: share(m.balance, rand, 0.1, 0.3) }
        : { kind: 'buy', deposit: t.minTrade };
    case 'washer':
      return m.balance > 0n
        ? { kind: 'sell', amount: m.balance }
        : { kind: 'buy', deposit: tradeSize(t, rand) };
  }
}
