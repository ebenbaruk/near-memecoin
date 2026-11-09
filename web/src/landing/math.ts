// The contract's arithmetic, for the explainers: the same integer rules as sim/src/rules.ts (and the Rust contract).
// Everything that looks like a what-if on this page goes through here, in BigInt, from the live chain state.
import type { Params, State } from '../chain/types';
import { B, YOCTO } from '../format/near';

export const ONE = 10n ** 18n;
const BPS = 10_000n;
/** NEP-145 storage charge paid once by a first-time buyer (contract constant, also in sim/results params). */
export const REG_MIN = 1_250_000_000_000_000_000_000n;

export interface Rules { p0: bigint; a: bigint; fee: bigint; tau: bigint; floor: bigint; potMin: bigint; minBuy: bigint; journal: bigint; rugFee: bigint }
export interface Core { x: bigint; S: bigint; pot: bigint; hwm: bigint }

export const rulesOf = (p: Params): Rules => ({
  p0: B(p.p0), a: B(p.a), fee: BigInt(p.fee_bps), tau: BigInt(p.tau_bps), floor: BigInt(p.hwm_floor_bps),
  potMin: B(p.pot_min), minBuy: B(p.min_buy), journal: B(p.journal_fee), rugFee: B(p.rug_fee),
});
export const coreOf = (s: State): Core => ({ x: B(s.x), S: B(s.supply), pot: B(s.pot), hwm: B(s.hwm) });

const ceilDiv = (n: bigint, d: bigint) => (n <= 0n ? 0n : (n + d - 1n) / d);
const sat = (v: bigint) => (v < 0n ? 0n : v);
const max = (a: bigint, b: bigint) => (a > b ? a : b);

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(16).length * 4 + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Area under the curve from 0 to x: the NEAR the reserve must hold when x coins have been minted along it. */
export const areaTo = (p: Rules, x: bigint) => ceilDiv(2n * p.p0 * ONE * x + p.a * x * x, 2n * ONE * ONE);
export const positionOf = (p: Rules, reserve: bigint) => (ONE * (isqrt(p.p0 * p.p0 + 2n * p.a * reserve) - p.p0)) / p.a;
export const priceAt = (p: Rules, x: bigint) => p.p0 + (p.a * x) / ONE;
export const feeOn = (p: Rules, v: bigint) => ceilDiv(v * p.fee, BPS);
export const floorOf = (p: Rules, hwm: bigint) => (hwm * p.floor) / BPS;

/** The coins you must burn: T = ceil(tau * max(S, floor(0.9 * remembered high))). */
export const coinsToBurn = (c: Core, p: Rules) => ceilDiv(p.tau * max(c.S, floorOf(p, c.hwm)), BPS);

export function buy(c: Core, p: Rules, deposit: bigint): Core & { minted: bigint } {
  const d = sat(deposit - p.journal);
  const fee = feeOn(p, d);
  const net = d - fee;
  const r0 = areaTo(p, c.x);
  const x2 = positionOf(p, r0 + net);
  const minted = sat(x2 - c.x);
  const dust = net - (areaTo(p, x2) - r0);
  const S = c.S + minted;
  return { x: x2, S, pot: c.pot + fee + dust, hwm: max(c.hwm, S), minted };
}

export function sell(c: Core, p: Rules, amount: bigint): Core & { gross: bigint } {
  const a = amount > c.S ? c.S : amount;
  const x2 = sat(c.x - a);
  const gross = areaTo(p, c.x) - areaTo(p, x2);
  return { x: x2, S: c.S - a, pot: c.pot + feeOn(p, gross), hwm: c.hwm, gross };
}

/** A rug leaves x and the reserve where they are: only the supply, the pot and the remembered high move. */
export function rug(c: Core, p: Rules): Core & { burned: bigint } {
  const burned = coinsToBurn(c, p);
  const S = sat(c.S - burned);
  return { x: c.x, S, pot: 0n, hwm: max(S, floorOf(p, c.hwm)), burned };
}

/** What a first-time buyer pays to buy just enough and burn it in one go. Same formula as the contract's get_gap_buy. */
export function buyThenRug(c: Core, p: Rules): { cost: bigint; rugPrice: bigint; deposit: bigint; minted: bigint } {
  const floorT = ceilDiv(p.tau * floorOf(p, c.hwm), BPS);
  const fromSupply = ceilDiv(sat(p.tau * c.S), BPS - p.tau);
  const dx = max(fromSupply, floorT) + 1n + ONE / p.a + 2n;
  const r0 = areaTo(p, c.x);
  const base = ceilDiv((areaTo(p, c.x + dx) - r0 + 1n) * BPS, BPS - p.fee);
  const deposit = max(base + p.journal + REG_MIN, p.minBuy + p.journal + REG_MIN);
  const d = deposit - REG_MIN - p.journal;
  const net = d - feeOn(p, d);
  const minted = sat(positionOf(p, r0 + net) - c.x);
  const cost = areaTo(p, c.x + minted) - r0 + p.journal + REG_MIN;
  return { cost, rugPrice: cost + p.rugFee, deposit, minted };
}

/** A yocto amount as a plain number of NEAR, for drawing only. */
export const toNear = (v: bigint) => Number((v * 1_000_000n) / YOCTO) / 1e6;
export const toCoins = (v: bigint) => Number((v + ONE / 2n) / ONE);
export const fromNear = (n: number) => (BigInt(Math.round(n * 1e6)) * YOCTO) / 1_000_000n;
