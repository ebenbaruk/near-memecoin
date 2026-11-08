// Candidate parameter sets, in contract units, built from NEAR-denominated inputs.
import type { Params } from "./rules.ts";

export const JOURNAL_FEE = 3_000_000_000_000_000_000_000n; // 0.003 NEAR
export const RUG_FEE = 6_000_000_000_000_000_000_000n; // 0.006 NEAR
export const REG_MIN = 1_250_000_000_000_000_000_000n; // 125 bytes at 1e19 yocto per byte
export const MIN_BUY = 50_000_000_000_000_000_000_000n; // 0.05 NEAR
export const P0 = 10_000_000_000_000_000_000n; // 1e-5 NEAR per token

export interface CellInput {
  tauPct: number;
  feePct: number;
  aYocto: bigint;
  potMinNear: number;
}

export function cellParams(c: CellInput): Params {
  return {
    p0: P0,
    a: c.aYocto,
    fee_bps: BigInt(Math.round(c.feePct * 100)),
    tau_bps: BigInt(Math.round(c.tauPct * 100)),
    hwm_floor_bps: 9000n,
    pot_min: BigInt(Math.round(c.potMinNear * 1e6)) * 10n ** 18n,
    min_buy: MIN_BUY,
    journal_fee: JOURNAL_FEE,
    rug_fee: RUG_FEE,
    reg_min: REG_MIN,
  };
}

/** Provisional point of the spec, used by --quick and as the default of `scenario`. */
export const DEFAULT_CELL: CellInput = { tauPct: 5, feePct: 2, aYocto: 10_000_000_000_000n, potMinNear: 1 };
