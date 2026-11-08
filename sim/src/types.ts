// Types shared by the engine, the agents and the campaign code.
import type { Params } from "./rules.ts";

export type Kind = "retail" | "sniper" | "whale" | "wash" | "sybil";
export const KINDS: Kind[] = ["retail", "sniper", "whale", "wash", "sybil"];

export type WhalePolicy = "myope" | "seuil1.5" | "seuil3" | "inventaire" | "dump";
export const WHALE_POLICIES: WhalePolicy[] = ["myope", "seuil1.5", "seuil3", "inventaire", "dump"];

export type Variant = "rug" | "A" | "B";

/** Behavioural assumptions (spec §3). Arbitrary starting values, swept in §6. */
export interface Assumptions {
  flow: number;
  medSize: number;
  sigmaSize: number;
  maxSize: number;
  rebuy: number;
  betaM: number;
  alphaR: number;
  s0: number; // per day
  betaD: number;
  kappa: number;
  botN: number;
  botAttention: number;
  botMargin: number;
  whaleW: number;
  whaleCap: number;
  whaleReturnDays: number;
  washV: number;
  sybilN: number;
  panicM: number;
  panicB: number;
  panicD: number;
  pi: number;
  gas: number;
  /** What-if only: ρ in basis points. The contract fixes 9000. */
  rhoBps: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  flow: 1,
  medSize: 3,
  sigmaSize: 1,
  maxSize: 300,
  rebuy: 0.33,
  betaM: 1,
  alphaR: 0.5,
  s0: 0.08,
  betaD: 1.5,
  kappa: 1,
  botN: 2,
  botAttention: 1,
  botMargin: 0,
  whaleW: 0.25,
  whaleCap: 40,
  whaleReturnDays: 5,
  washV: 400,
  sybilN: 100,
  panicM: 5,
  panicB: 0.15,
  panicD: 5,
  pi: 0.15,
  gas: 0.01,
  rhoBps: 9000,
};

export interface RunSpec {
  scenario: string;
  seed: number;
  params: Params;
  assumptions: Assumptions;
  whalePolicy?: WhalePolicy;
  variant: Variant;
  /** Forces the shock tick (controls reuse the tick of their paired rug run). */
  shockAt?: number | null;
}

export interface RugEvent {
  tick: number;
  kind: Kind;
  pot: number;
  burned: number;
}

export interface RunSummary {
  scenario: string;
  variant: Variant;
  seed: number;
  whalePolicy: WhalePolicy | null;
  rugs: RugEvent[];
  nRugs: number;
  firstRugDay: number | null;
  shockTick: number | null;
  /** Rugs strictly after the shock tick. */
  rugsAfterShock: number;
  supplyDaily: number[];
  burnedDaily: number[];
  potDaily: number[];
  orphanPot: number;
  reserve: number;
  floorPrice: number;
  spotPrice: number;
  gapDays: { holder: number; buy: number; exit: number };
  retailReturnPct: number;
  retailWinners: number;
  retailInvested: number;
  pnl: Record<Kind, number>;
  invested: Record<Kind, number>;
  rugCount: Record<Kind, number>;
  potTaken: Record<Kind, number>;
  violations: string[];
  buys: number;
  sells: number;
}
