// Sensitivity analysis of spec §6: one factor at a time, and a 200-draw Latin hypercube.
import { evaluateJobs, type Job, type JobResult, type StageName } from "./evaluate.ts";
import { CAMPAIGN } from "./thresholds.ts";
import { median, medianRugs, firstRugDays, pairedRetailGap, spearman } from "./metrics.ts";
import { cellParams, type CellInput } from "./params.ts";
import { runTasks } from "./pool.ts";
import { fork } from "./rng.ts";
import { cellKey, type CellRow } from "./sweep.ts";
import { DEFAULT_ASSUMPTIONS, type Assumptions, type RunSummary } from "./types.ts";

type Numeric = keyof Assumptions;

export interface Factor {
  key: Numeric;
  label: string;
  low: number;
  high: number;
  log?: boolean;
  integer?: boolean;
}

export const FACTORS: Factor[] = [
  { key: "flow", label: "Order flow multiplier", low: 0.02, high: 3, log: true },
  { key: "pi", label: "Panic share on a rug", low: 0, high: 0.5 },
  { key: "betaM", label: "Momentum sensitivity", low: 0, high: 3 },
  { key: "alphaR", label: "News effect of a rug", low: -0.5, high: 2 },
  { key: "s0", label: "Baseline sell rate per day", low: 0.02, high: 0.3 },
  { key: "betaD", label: "Loss sensitivity", low: 0, high: 3 },
  { key: "botN", label: "Number of snipers", low: 0, high: 5, integer: true },
  { key: "botAttention", label: "Sniper attention", low: 0.05, high: 1 },
  { key: "botMargin", label: "Sniper margin (NEAR)", low: 0, high: 1 },
  { key: "whaleW", label: "Whale target share", low: 0.05, high: 0.4 },
  { key: "medSize", label: "Median trade size (NEAR)", low: 1, high: 10 },
  { key: "sigmaSize", label: "Trade size sigma", low: 0.5, high: 1.5 },
  { key: "rhoBps", label: "HWM decay rho (bps, what-if)", low: 8000, high: 10000 },
  { key: "gas", label: "Gas per action (NEAR)", low: 0.001, high: 0.05, log: true },
];

function value(f: Factor, u: number): number {
  const v = f.log ? Math.exp(Math.log(f.low) + (Math.log(f.high) - Math.log(f.low)) * u) : f.low + (f.high - f.low) * u;
  if (f.integer) return Math.min(Math.floor(f.low + (f.high - f.low + 1) * u), f.high);
  return v;
}

/** Latin hypercube: each factor stratified in n bins, independently permuted with its own stream. */
export function latinHypercube(n: number, seedName: string): Assumptions[] {
  const coords = FACTORS.map((f) => {
    const rng = fork(1, `lhs.${seedName}.${f.key}`);
    const perm = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    return perm.map((p) => (p + rng.next()) / n);
  });
  return Array.from({ length: n }, (_, d) => {
    const a: Assumptions = { ...DEFAULT_ASSUMPTIONS };
    FACTORS.forEach((f, k) => {
      a[f.key] = value(f, coords[k][d]);
    });
    return a;
  });
}

const FULL: StageName[] = ["tiny", "organic", "hype", "panic-early", "organic-A", "whale"];
const seedList = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

export const lhsDraws = (): Assumptions[] => latinHypercube(CAMPAIGN.lhsDraws, "main");
export const lhsScreenDraws = (): Assumptions[] => latinHypercube(CAMPAIGN.lhsScreenDraws, "screen");

/** Score of each viable cell: share of the draws where it remains viable. */
export async function scoreCells(cells: CellRow[], draws: Assumptions[], seeds: number): Promise<JobResult[][]> {
  const jobs: Job[] = cells.flatMap((c) =>
    draws.map((assumptions, d) => ({
      key: `${c.key}#${d}`,
      params: cellParams(c),
      assumptions,
      seeds: seedList(seeds),
    })),
  );
  console.error(`LHS scoring: ${cells.length} cells x ${draws.length} draws x ${seeds} seeds`);
  const results = await evaluateJobs(jobs, FULL, true, "lhs");
  return cells.map((_, i) => results.slice(i * draws.length, (i + 1) * draws.length));
}

export interface OatRow {
  factor: string;
  label: string;
  low: number;
  high: number;
  value: number;
  side: "low" | "high";
  rugs: number;
  firstRug: number;
  retailGap: number;
  viable: boolean;
  failedAt: string | null;
}

function outcome(runs: RunSummary[][]): { rugs: number; firstRug: number; retailGap: number } {
  const rug = runs.map((r) => r[0]);
  const control = runs.map((r) => r[1]);
  return { rugs: medianRugs(rug), firstRug: median(firstRugDays(rug)), retailGap: median(pairedRetailGap(rug, control)) };
}

async function organicOutcomes(params: CellInput, set: Assumptions[], seeds: number[], label: string): Promise<ReturnType<typeof outcome>[]> {
  const p = cellParams(params);
  const tasks = set.flatMap((assumptions) =>
    seeds.map((seed) => ({ scenario: "organic", seed, params: p, assumptions, variants: ["rug", "A"] as ("rug" | "A")[], lite: true })),
  );
  const out = await runTasks(tasks, label);
  const n = seeds.length;
  return set.map((_, i) => outcome(out.slice(i * n, (i + 1) * n)));
}

export interface SensitivityResult {
  baseline: { rugs: number; firstRug: number; retailGap: number };
  oat: OatRow[];
  spearman: { factor: string; label: string; viable: number; rugs: number; firstRug: number; retailGap: number }[];
  draws: { assumptions: Assumptions; viable: boolean; failedAt: string | null; rugs: number; firstRug: number; retailGap: number }[];
  score: number;
  leavesBand: string[];
}

export async function runSensitivity(selected: CellRow, draws: Assumptions[], selectedScoreJobs: JobResult[] | null): Promise<SensitivityResult> {
  const seeds = seedList(CAMPAIGN.oatSeeds);
  const [baseline] = await organicOutcomes(selected, [DEFAULT_ASSUMPTIONS], seeds, "oat-base");

  const oatSets: { f: Factor; side: "low" | "high"; assumptions: Assumptions }[] = FACTORS.flatMap((f) =>
    (["low", "high"] as const).map((side) => ({
      f,
      side,
      assumptions: { ...DEFAULT_ASSUMPTIONS, [f.key]: side === "low" ? f.low : f.high },
    })),
  );
  const outcomes = await organicOutcomes(selected, oatSets.map((o) => o.assumptions), seeds, "oat");
  const oatJobs: Job[] = oatSets.map((o, i) => ({
    key: `oat${i}`,
    params: cellParams(selected),
    assumptions: o.assumptions,
    seeds,
  }));
  const oatViability = await evaluateJobs(oatJobs, FULL, true, "oat-viability");
  const oat: OatRow[] = oatSets.map((o, i) => ({
    factor: o.f.key,
    label: o.f.label,
    low: o.f.low,
    high: o.f.high,
    value: o.side === "low" ? o.f.low : o.f.high,
    side: o.side,
    ...outcomes[i],
    viable: oatViability[i].viable,
    failedAt: oatViability[i].failedAt,
  }));

  const drawJobs: Job[] = draws.map((assumptions, d) => ({
    key: `sel#${d}`,
    params: cellParams(selected),
    assumptions,
    seeds: seedList(CAMPAIGN.lhsSeeds),
  }));
  const drawResults = selectedScoreJobs ?? (await evaluateJobs(drawJobs, FULL, true, "lhs-selected"));
  const drawOutcomes = await organicOutcomes(selected, draws, seedList(CAMPAIGN.lhsSeeds), "lhs-outcomes");
  const drawRows = draws.map((assumptions, d) => ({
    assumptions,
    viable: drawResults[d].viable,
    failedAt: drawResults[d].failedAt,
    ...drawOutcomes[d],
  }));

  const spearmanRows = FACTORS.map((f) => {
    const xs = drawRows.map((r) => r.assumptions[f.key]);
    return {
      factor: f.key,
      label: f.label,
      viable: spearman(xs, drawRows.map((r) => (r.viable ? 1 : 0))),
      rugs: spearman(xs, drawRows.map((r) => r.rugs)),
      firstRug: spearman(xs, drawRows.map((r) => r.firstRug)),
      retailGap: spearman(xs, drawRows.map((r) => r.retailGap)),
    };
  });

  const leavesBand = [...new Set(oat.filter((o) => !o.viable).map((o) => o.label))];
  return {
    baseline,
    oat,
    spearman: spearmanRows,
    draws: drawRows,
    score: drawRows.filter((r) => r.viable).length / drawRows.length,
    leavesBand,
  };
}

export { cellKey };
