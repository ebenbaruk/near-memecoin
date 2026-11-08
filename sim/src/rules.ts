// State machine of the contract (Docs/spec/20-contract.md is authoritative).
// Pure functions, BigInt only. No floating point arithmetic in this file.
// Amounts: yoctoNEAR and token base units (18 decimals). Rates in basis points.

export const ONE = 10n ** 18n;
export const X_MAX = 10n ** 27n;
export const BPS = 10_000n;

export type ErrorCode =
  | "E_ROUND_STALE"
  | "E_POT_BELOW_MIN"
  | "E_BURN_ABOVE_MAX"
  | "E_INSUFFICIENT_TOKENS"
  | "E_PAYOUT_BELOW_MIN"
  | "E_SLIPPAGE"
  | "E_BELOW_MIN_BUY"
  | "E_SELL_TOO_SMALL"
  | "E_ABOVE_X_MAX";

/** Immutable game parameters. `reg_min` is the NEP-145 registration charge. */
export interface Params {
  p0: bigint;
  a: bigint;
  fee_bps: bigint;
  tau_bps: bigint;
  hwm_floor_bps: bigint;
  pot_min: bigint;
  min_buy: bigint;
  journal_fee: bigint;
  rug_fee: bigint;
  reg_min: bigint;
  /** Control coins only: fees and dust are destroyed instead of funding a pot. Never true for the contract. */
  void_fees?: boolean;
}

/** Curve state plus the conservation ledger (the ledger is not contract state). */
export interface Core {
  x: bigint;
  S: bigint;
  R: bigint;
  pot: bigint;
  hwm: bigint;
  round: bigint;
  entries: bigint;
  exits: bigint;
  retained: bigint;
  voided: bigint;
}

export const newCore = (): Core => ({
  x: 0n,
  S: 0n,
  R: 0n,
  pot: 0n,
  hwm: 0n,
  round: 1n,
  entries: 0n,
  exits: 0n,
  retained: 0n,
  voided: 0n,
});

export const burned = (c: Core): bigint => c.x - c.S;

export function ceilDiv(n: bigint, d: bigint): bigint {
  return n <= 0n ? 0n : (n + d - 1n) / d;
}

const sat = (v: bigint): bigint => (v < 0n ? 0n : v);
const maxB = (a: bigint, b: bigint): bigint => (a > b ? a : b);
const minB = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** Floor of the integer square root. */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt of a negative number");
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(16).length * 4 + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Area under the curve at position x, rounded up. */
export function r(p: Params, x: bigint): bigint {
  const numerator = 2n * p.p0 * ONE * x + p.a * x * x;
  return ceilDiv(numerator, 2n * ONE * ONE);
}

/** Position whose area is R, rounded down. r(inv(R)) <= R. */
export function inv(p: Params, reserve: bigint): bigint {
  return (ONE * (isqrt(p.p0 * p.p0 + 2n * p.a * reserve) - p.p0)) / p.a;
}

export const feeOn = (p: Params, v: bigint): bigint => ceilDiv(v * p.fee_bps, BPS);

const hwmFloor = (p: Params, c: Core): bigint => (c.hwm * p.hwm_floor_bps) / BPS;

export function tRequired(c: Core, p: Params): bigint {
  return ceilDiv(p.tau_bps * maxB(c.S, hwmFloor(p, c)), BPS);
}

/** Yocto per whole token at the current position. */
export const spotPrice = (c: Core, p: Params): bigint => p.p0 + (p.a * c.x) / ONE;
export const floorPrice = (c: Core, p: Params): bigint => p.p0 + (p.a * burned(c)) / ONE;
export const floorReserve = (c: Core, p: Params): bigint => r(p, burned(c));

export type Fail = { ok: false; error: ErrorCode };

export interface BuyOk {
  ok: true;
  core: Core;
  minted: bigint;
  cost: bigint;
  fee: bigint;
  dust: bigint;
  reg: bigint;
}
export type BuyOutcome = Fail | BuyOk;

export function buy(c: Core, p: Params, deposit: bigint, registered: boolean, minOut: bigint): BuyOutcome {
  const attached = deposit;
  const reg = registered ? 0n : p.reg_min;
  if (deposit < reg) return { ok: false, error: "E_BELOW_MIN_BUY" };
  let d = deposit - reg;
  if (d < p.journal_fee) return { ok: false, error: "E_BELOW_MIN_BUY" };
  d -= p.journal_fee;
  if (d < p.min_buy) return { ok: false, error: "E_BELOW_MIN_BUY" };
  const fee = feeOn(p, d);
  const net = d - fee;
  const x2 = inv(p, r(p, c.x) + net);
  if (x2 > X_MAX) return { ok: false, error: "E_ABOVE_X_MAX" };
  // The contract requires x2 > x with no dedicated code. Unreachable while min_buy >= 1e21 and params are in bounds.
  if (x2 <= c.x) return { ok: false, error: "E_BELOW_MIN_BUY" };
  const minted = x2 - c.x;
  if (minted < minOut) return { ok: false, error: "E_SLIPPAGE" };
  const cost = r(p, x2) - r(p, c.x);
  const dust = net - cost;
  const S2 = c.S + minted;
  const toPot = fee + dust;
  return {
    ok: true,
    minted,
    cost,
    fee,
    dust,
    reg,
    core: {
      ...c,
      x: x2,
      S: S2,
      R: c.R + cost,
      pot: p.void_fees ? c.pot : c.pot + toPot,
      voided: p.void_fees ? c.voided + toPot : c.voided,
      hwm: maxB(c.hwm, S2),
      entries: c.entries + attached,
      retained: c.retained + reg + p.journal_fee,
    },
  };
}

export interface SellOk {
  ok: true;
  core: Core;
  gross: bigint;
  fee: bigint;
  payout: bigint;
}
export type SellOutcome = Fail | SellOk;

export function sell(c: Core, p: Params, balance: bigint, amount: bigint, minOut: bigint): SellOutcome {
  if (amount === 0n) return { ok: false, error: "E_SELL_TOO_SMALL" };
  if (balance < amount) return { ok: false, error: "E_INSUFFICIENT_TOKENS" };
  const x2 = c.x - amount;
  const gross = r(p, c.x) - r(p, x2);
  const fee = feeOn(p, gross);
  if (gross <= fee + p.journal_fee) return { ok: false, error: "E_SELL_TOO_SMALL" };
  const payout = gross - fee - p.journal_fee;
  if (payout < p.journal_fee) return { ok: false, error: "E_SELL_TOO_SMALL" };
  if (payout < minOut) return { ok: false, error: "E_SLIPPAGE" };
  return {
    ok: true,
    gross,
    fee,
    payout,
    core: {
      ...c,
      x: x2,
      S: c.S - amount,
      R: c.R - gross,
      pot: p.void_fees ? c.pot : c.pot + fee,
      voided: p.void_fees ? c.voided + fee : c.voided,
      exits: c.exits + payout,
      retained: c.retained + p.journal_fee,
    },
  };
}

export interface RugOk {
  ok: true;
  core: Core;
  burned: bigint;
  payout: bigint;
  potBefore: bigint;
}
export type RugOutcome = Fail | RugOk;

export function rug(c: Core, p: Params, balance: bigint, round: bigint, minPayout: bigint, maxBurn: bigint): RugOutcome {
  if (round !== c.round) return { ok: false, error: "E_ROUND_STALE" };
  if (c.pot < p.pot_min) return { ok: false, error: "E_POT_BELOW_MIN" };
  const T = tRequired(c, p);
  if (T > maxBurn) return { ok: false, error: "E_BURN_ABOVE_MAX" };
  if (balance < T) return { ok: false, error: "E_INSUFFICIENT_TOKENS" };
  const payout = c.pot - p.rug_fee;
  if (payout < minPayout) return { ok: false, error: "E_PAYOUT_BELOW_MIN" };
  const S2 = c.S - T;
  return {
    ok: true,
    burned: T,
    payout,
    potBefore: c.pot,
    core: {
      ...c,
      S: S2,
      pot: 0n,
      hwm: maxB(S2, hwmFloor(p, c)),
      round: c.round + 1n,
      exits: c.exits + payout,
      retained: c.retained + p.rug_fee,
    },
  };
}

// ---------------------------------------------------------------- Gaps (spec §6)

/** Net NEAR received for v tokens sold from position x, journal fee excluded. Infeasible sizes saturate at x = 0. */
export function netSell(c: Core, p: Params, v: bigint, fromX: bigint = c.x): bigint {
  const gross = r(p, fromX) - r(p, sat(fromX - v));
  return gross - feeOn(p, gross);
}

export interface GapView {
  feasible: boolean;
  positive: boolean;
  abs: bigint;
  /** Signed value in yocto; serialised as positive/abs in the vectors. */
  value: bigint;
  tokens_needed: bigint;
  t_required: bigint;
  pot: bigint;
}

export interface GapBuyView extends GapView {
  deposit_needed: bigint;
  min_out: bigint;
  cost: bigint;
}

function signed(value: bigint): { value: bigint; positive: boolean; abs: bigint } {
  return { value, positive: value >= 0n, abs: value < 0n ? -value : value };
}

export function gapHolder(c: Core, p: Params): GapView {
  const T = tRequired(c, p);
  const feasible = T <= c.S && c.pot >= p.pot_min;
  const value = c.pot - p.rug_fee - netSell(c, p, T);
  return { feasible, ...signed(value), tokens_needed: T, t_required: T, pot: c.pot };
}

export function gapBuy(c: Core, p: Params, balance: bigint, registered: boolean): GapBuyView {
  const reg = registered ? 0n : p.reg_min;
  const floorT = ceilDiv(p.tau_bps * hwmFloor(p, c), BPS);
  const fromSupply = ceilDiv(sat(p.tau_bps * c.S - balance * BPS), BPS - p.tau_bps);
  const fromFloor = sat(floorT - balance);
  const dx = maxB(fromSupply, fromFloor) + 1n + ONE / p.a + 2n;

  const r0 = r(p, c.x);
  const base = ceilDiv((r(p, c.x + dx) - r0 + 1n) * BPS, BPS - p.fee_bps);
  const deposit_needed = maxB(base + p.journal_fee + reg, p.min_buy + p.journal_fee + reg);

  const d = deposit_needed - reg - p.journal_fee;
  const fee = feeOn(p, d);
  const net = d - fee;
  const x2 = inv(p, r0 + net);
  const minted = sat(x2 - c.x);
  const costReal = r(p, c.x + minted) - r0;
  const dust = net - costReal;

  const S2 = c.S + minted;
  const post: Core = { ...c, S: S2, x: c.x + minted, hwm: maxB(c.hwm, S2) };
  const tPost = tRequired(post, p);

  const feasible = c.x + dx <= X_MAX && x2 <= X_MAX && c.pot + fee + dust >= p.pot_min;
  const value = c.pot - p.rug_fee - costReal - p.journal_fee - reg;
  return {
    feasible,
    ...signed(value),
    tokens_needed: sat(tPost - balance),
    t_required: tPost,
    pot: c.pot,
    deposit_needed,
    min_out: minted,
    cost: costReal + p.journal_fee + reg,
  };
}

export function gapExit(c: Core, p: Params, balance: bigint): GapView {
  const W = balance;
  const T = tRequired(c, p);
  const floorT = ceilDiv(p.tau_bps * hwmFloor(p, c), BPS);
  const fromSupply = (W * BPS - p.tau_bps * c.S) / (BPS - p.tau_bps); // truncation is irrelevant when negative
  const s = minB(W * BPS >= p.tau_bps * c.S ? fromSupply : -1n, W - floorT);
  const feasible = s >= 0n && W >= T && c.pot >= p.pot_min;
  const size = sat(s);
  // net_sell(s) + fee(s) is the whole gross: the fee of the partial sale comes back through the pot.
  const gross = r(p, c.x) - r(p, sat(c.x - size));
  const value = gross + c.pot - p.rug_fee - netSell(c, p, W);
  return { feasible, ...signed(value), tokens_needed: T, t_required: T, pot: c.pot };
}

// ---------------------------------------------------------------- Invariants (sim spec §2)

export function checkInvariants(c: Core, p: Params): string | null {
  if (c.entries !== c.exits + c.R + c.pot + c.retained + c.voided) return "I1 conservation";
  const b = burned(c);
  if (b < 0n) return "I2 position";
  if (c.R !== r(p, c.x)) return "I3 reserve";
  if (c.R < r(p, b)) return "I4 floor";
  if (c.hwm < c.S) return "I5 hwm";
  if (c.x < 0n || c.S < 0n || c.R < 0n || c.pot < 0n) return "I6 non-negative";
  return null;
}

/** Parameter bounds enforced by the contract's `new` (spec §2). */
export function validateParams(p: Params): string | null {
  if (p.p0 <= 0n || p.p0 > 10n ** 25n) return "p0";
  if (p.a <= 0n || p.a > 10n ** 20n) return "a";
  if (p.fee_bps < 1n || p.fee_bps > 1000n) return "fee_bps";
  if (p.tau_bps < 1n || p.tau_bps > 5000n) return "tau_bps";
  if (p.hwm_floor_bps !== 9000n) return "hwm_floor_bps";
  if (p.pot_min < p.rug_fee + p.journal_fee) return "pot_min";
  return null;
}
