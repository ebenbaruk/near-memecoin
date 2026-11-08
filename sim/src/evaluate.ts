// Viability of a (cell, assumptions) pair (spec §5), scenario by scenario with early exit.
// Early exit does not change the outcome: a job only stops once a criterion has already failed.
import { THRESHOLDS as TH } from "./thresholds.ts";
import { firstRugDays, hasViolation, median, medianRugs, noRugShare, pairedRetailGap } from "./metrics.ts";
import { runTasks, type Task } from "./pool.ts";
import type { Params } from "./rules.ts";
import { WHALE_POLICIES, type Assumptions, type RunSummary, type WhalePolicy } from "./types.ts";

export interface Job {
  key: string;
  params: Params;
  assumptions: Assumptions;
  seeds: number[];
}

export interface JobResult {
  key: string;
  viable: boolean;
  failedAt: string | null;
  criteria: Record<string, number | boolean>;
  bestWhalePolicy?: WhalePolicy;
  retailGapOrganic?: number;
  retailGapWhale?: number;
}

export type StageName = "organic" | "hype" | "tiny" | "panic-early" | "organic-A" | "whale";

interface JobState {
  job: Job;
  alive: boolean;
  result: JobResult;
  organic: RunSummary[];
}

function fail(state: JobState, code: string): void {
  state.alive = false;
  state.result.viable = false;
  state.result.failedAt ??= code;
}

export function evaluateOrganicRug(runs: RunSummary[], r: JobResult): string | null {
  const c = r.criteria;
  c.noRugShare = noRugShare(runs);
  c.firstRugDay = median(firstRugDays(runs));
  c.medianRugs = medianRugs(runs);
  if (hasViolation(runs)) return "V1";
  if ((c.noRugShare as number) > TH.V2_organic_no_rug_max) return "V2";
  if ((c.firstRugDay as number) < TH.V3_organic_first_rug_min_days) return "V3-first";
  const rugs = c.medianRugs as number;
  if (rugs < TH.V3_organic_rugs_min || rugs > TH.V3_organic_rugs_max) return "V3-count";
  return null;
}

export function evaluateHype(runs: RunSummary[], r: JobResult): string | null {
  r.criteria.hypeFirstRug = median(firstRugDays(runs));
  r.criteria.hypeRugs = medianRugs(runs);
  if (hasViolation(runs)) return "V1";
  if ((r.criteria.hypeFirstRug as number) < TH.V4_hype_first_rug_min_days) return "V4-first";
  if ((r.criteria.hypeRugs as number) > TH.V4_hype_rugs_max) return "V4-count";
  return null;
}

export function evaluateTiny(runs: RunSummary[], r: JobResult): string | null {
  r.criteria.tinyRugged = 1 - noRugShare(runs);
  if (hasViolation(runs)) return "V1";
  return (r.criteria.tinyRugged as number) < TH.V5_tiny_rugged_min ? "V5" : null;
}

export function evaluatePanic(runs: RunSummary[], r: JobResult): string | null {
  r.criteria.panicRugAfterShock = runs.filter((g) => g.rugsAfterShock > 0).length / runs.length;
  if (hasViolation(runs)) return "V1";
  return (r.criteria.panicRugAfterShock as number) < TH.V7_panic_rug_after_shock_min ? "V7" : null;
}

const task = (j: Job, scenario: string, seed: number, variants: Task["variants"], whalePolicy?: WhalePolicy): Task => ({
  scenario, seed, params: j.params, assumptions: j.assumptions, variants, whalePolicy, lite: true,
});

/** Runs the jobs through the given stages. `shortCircuit` stops a job at its first failed criterion. */
export async function evaluateJobs(jobs: Job[], stages: StageName[], shortCircuit: boolean, label: string): Promise<JobResult[]> {
  const states: JobState[] = jobs.map((job) => ({
    job,
    alive: true,
    organic: [],
    result: { key: job.key, viable: true, failedAt: null, criteria: {} },
  }));

  const stage = async (
    name: string,
    build: (s: JobState) => Task[],
    apply: (s: JobState, runs: RunSummary[][]) => string | null,
  ): Promise<void> => {
    const live = states.filter((s) => s.alive || !shortCircuit);
    const tasks: Task[] = [];
    const slices: [JobState, number, number][] = [];
    for (const s of live) {
      const t = build(s);
      slices.push([s, tasks.length, t.length]);
      tasks.push(...t);
    }
    const out = await runTasks(tasks, `${label}:${name}`);
    for (const [s, start, n] of slices) {
      const failure = apply(s, out.slice(start, start + n));
      if (failure) fail(s, failure);
    }
  };

  const rugRuns = (runs: RunSummary[][]): RunSummary[] => runs.map((r) => r[0]);

  for (const name of stages) {
    if (name === "organic") {
      await stage(name, (s) => s.job.seeds.map((seed) => task(s.job, "organic", seed, ["rug"])), (s, runs) => {
        s.organic = rugRuns(runs);
        return evaluateOrganicRug(s.organic, s.result);
      });
    } else if (name === "hype") {
      await stage(name, (s) => s.job.seeds.map((seed) => task(s.job, "hype", seed, ["rug"])), (s, runs) => evaluateHype(rugRuns(runs), s.result));
    } else if (name === "tiny") {
      await stage(name, (s) => s.job.seeds.map((seed) => task(s.job, "tiny", seed, ["rug"])), (s, runs) => evaluateTiny(rugRuns(runs), s.result));
    } else if (name === "panic-early") {
      await stage(name, (s) => s.job.seeds.map((seed) => task(s.job, "panic-early", seed, ["rug"])), (s, runs) => evaluatePanic(rugRuns(runs), s.result));
    } else if (name === "organic-A") {
      await stage(
        name,
        (s) => s.job.seeds.map((seed) => task(s.job, "organic", seed, ["A"])),
        (s, runs) => {
          const control = runs.map((r) => r[0]);
          if (hasViolation(control)) return "V1";
          const gap = median(pairedRetailGap(s.organic, control));
          s.result.criteria.retailGapOrganic = gap;
          s.result.retailGapOrganic = gap;
          return gap < TH.V6_organic_retail_gap_min ? "V6-organic" : null;
        },
      );
    } else if (name === "whale") {
      await stage(
        name,
        (s) => [
          ...s.job.seeds.map((seed) => task(s.job, "whale", seed, ["A"], "myope")),
          ...WHALE_POLICIES.flatMap((pol) => s.job.seeds.map((seed) => task(s.job, "whale", seed, ["rug"], pol))),
        ],
        (s, runs) => {
          const n = s.job.seeds.length;
          const control = runs.slice(0, n).map((r) => r[0]);
          let bestPol: WhalePolicy = WHALE_POLICIES[0];
          let bestPnl = -Infinity;
          let bestRuns: RunSummary[] = [];
          WHALE_POLICIES.forEach((pol, idx) => {
            const rugs = runs.slice(n + idx * n, n + (idx + 1) * n).map((r) => r[0]);
            const pnl = median(rugs.map((r) => r.pnl.whale));
            if (pnl > bestPnl) {
              bestPnl = pnl;
              bestPol = pol;
              bestRuns = rugs;
            }
            if (hasViolation(rugs)) s.result.criteria.whaleViolation = true;
          });
          if (hasViolation(control) || s.result.criteria.whaleViolation) return "V1";
          const gap = median(pairedRetailGap(bestRuns, control));
          s.result.bestWhalePolicy = bestPol;
          s.result.retailGapWhale = gap;
          s.result.criteria.retailGapWhale = gap;
          s.result.criteria.whaleBestPnl = bestPnl;
          return gap < TH.V6_whale_retail_gap_min ? "V6-whale" : null;
        },
      );
    }
  }
  return states.map((s) => s.result);
}
