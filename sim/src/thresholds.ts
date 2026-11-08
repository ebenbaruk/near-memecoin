// Viability thresholds of spec §5, frozen before the campaign runs. Never tune them to obtain a result.
export const THRESHOLDS = {
  V2_organic_no_rug_max: 0.2,
  V3_organic_first_rug_min_days: 3,
  V3_organic_rugs_min: 1,
  V3_organic_rugs_max: 12,
  V4_hype_first_rug_min_days: 1,
  V4_hype_rugs_max: 20,
  V5_tiny_rugged_min: 0.5,
  V6_organic_retail_gap_min: -1,
  V6_whale_retail_gap_min: -5,
  V7_panic_rug_after_shock_min: 0.3,
} as const;

export interface Campaign {
  tauPct: number[];
  feePct: number[];
  aYocto: bigint[];
  pminNear: number[];
  step1Pmin: number;
  step1Seeds: number;
  step2ScreenSeeds: number;
  step2Seeds: number;
  lhsScreenDraws: number;
  lhsScreenSeeds: number;
  lhsFinalists: number;
  lhsDraws: number;
  lhsSeeds: number;
  oatSeeds: number;
  scenarioSeeds: number;
}

export const CAMPAIGN: Campaign = {
  tauPct: [1, 2, 3, 5, 7, 10, 15, 20],
  feePct: [0.5, 1, 2, 3, 5],
  aYocto: [1_000_000_000_000n, 10_000_000_000_000n, 50_000_000_000_000n, 100_000_000_000_000n],
  pminNear: [0.05, 1, 5, 20, 50],
  step1Pmin: 1,
  step1Seeds: 20,
  // Compute budget, set before any step 2 result existed: a 20-seed screen of every (cell, Pmin), then 100 seeds on the finalists only.
  step2ScreenSeeds: 20,
  step2Seeds: 100,
  // Screen every screen-viable cell on a small hypercube, keep the finalists, score those on the full 200 draws.
  lhsScreenDraws: 20,
  lhsScreenSeeds: 3,
  lhsFinalists: 10,
  // Each Latin-hypercube draw is scored on 5 seeds per scenario.
  lhsDraws: 200,
  lhsSeeds: 5,
  oatSeeds: 20,
  scenarioSeeds: 100,
};

/** Shrinks the campaign to a pipeline smoke test (`--dry`). Results are not publishable. */
export function applyDryRun(): void {
  Object.assign(CAMPAIGN, {
    tauPct: [5],
    feePct: [2],
    aYocto: [10_000_000_000_000n],
    pminNear: [1, 5],
    step1Seeds: 5,
    step2ScreenSeeds: 4,
    step2Seeds: 8,
    lhsScreenDraws: 4,
    lhsScreenSeeds: 2,
    lhsFinalists: 1,
    lhsDraws: 6,
    lhsSeeds: 3,
    oatSeeds: 3,
    scenarioSeeds: 8,
  });
}
