// Two-step grid sweep and the selection rule of spec §5.
import { CAMPAIGN } from "./thresholds.ts";
import { evaluateJobs, type Job, type JobResult, type StageName } from "./evaluate.ts";
import { cellParams, type CellInput } from "./params.ts";
import { DEFAULT_ASSUMPTIONS } from "./types.ts";

export interface CellRow extends CellInput {
  key: string;
  ratio: number;
  step1?: JobResult;
  step2?: JobResult;
  status: "viable" | "never" | "degenerate";
}

export const cellKey = (c: CellInput): string =>
  `t${c.tauPct}_f${c.feePct}_a${c.aYocto}_p${c.potMinNear}`;

const STEP1_STAGES: StageName[] = ["organic", "hype", "tiny", "panic-early"];
// Cheapest and most selective first; the order cannot change a verdict, only the time to reach it.
export const STEP2_STAGES: StageName[] = ["tiny", "organic", "hype", "panic-early", "organic-A", "whale"];

const seedList = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

export function classify(result: JobResult): "viable" | "never" | "degenerate" {
  if (result.viable) return "viable";
  const f = result.failedAt ?? "";
  if (f === "V2" || f === "V5" || (f === "V3-count" && (result.criteria.medianRugs as number) < 1)) return "never";
  return "degenerate";
}

export async function runSweep(): Promise<{ cells: CellRow[]; viable: CellRow[] }> {
  const grid: CellInput[] = [];
  for (const a of CAMPAIGN.aYocto)
    for (const t of CAMPAIGN.tauPct)
      for (const f of CAMPAIGN.feePct) grid.push({ tauPct: t, feePct: f, aYocto: a, potMinNear: CAMPAIGN.step1Pmin });

  const jobs1: Job[] = grid.map((c) => ({
    key: cellKey(c),
    params: cellParams(c),
    assumptions: DEFAULT_ASSUMPTIONS,
    seeds: seedList(CAMPAIGN.step1Seeds),
  }));
  console.error(`step 1: ${grid.length} cells, ${CAMPAIGN.step1Seeds} seeds, 4 scenarios`);
  const t1 = await evaluateJobs(jobs1, STEP1_STAGES, false, "step1");

  const cells: CellRow[] = grid.map((c, i) => ({
    ...c,
    key: jobs1[i].key,
    ratio: c.tauPct / c.feePct,
    step1: t1[i],
    status: classify(t1[i]),
  }));

  const passing1 = cells.filter((c) => c.step1?.viable);
  console.error(`step 1 viable cells: ${passing1.length}/${cells.length}`);

  const inputs2: CellInput[] = passing1.flatMap((c) => CAMPAIGN.pminNear.map((p) => ({ ...c, potMinNear: p })));
  const jobs2: Job[] = inputs2.map((c) => ({
    key: cellKey(c),
    params: cellParams(c),
    assumptions: DEFAULT_ASSUMPTIONS,
    seeds: seedList(CAMPAIGN.step2ScreenSeeds),
  }));
  console.error(`step 2 screen: ${inputs2.length} cell x Pmin, ${CAMPAIGN.step2ScreenSeeds} seeds, short-circuit on failure`);
  const t2 = await evaluateJobs(jobs2, STEP2_STAGES, true, "step2");

  const step2Rows: CellRow[] = inputs2.map((c, i) => ({
    ...c,
    key: jobs2[i].key,
    ratio: c.tauPct / c.feePct,
    step2: t2[i],
    status: t2[i].viable ? "viable" : classify(t2[i]),
  }));
  const viable = step2Rows.filter((c) => c.step2?.viable);
  console.error(`step 2 screen viable (cell, Pmin): ${viable.length}/${inputs2.length}`);
  return { cells: [...cells, ...step2Rows], viable };
}

/** Selection key of spec §5: closest to tau/f = 2.5, then round values. Lower is better. */
export function selectionKey(c: CellRow): string {
  const closeness = Math.abs(c.ratio - 2.5).toFixed(6).padStart(12, "0");
  const round = (v: number, set: number[]): number => (set.includes(v) ? 0 : 1);
  const a = Number(c.aYocto);
  const roundness =
    round(c.tauPct, [5, 10, 20]) +
    round(c.feePct, [1, 2, 5]) +
    (a === 1e13 || a === 1e14 ? 0 : 1) +
    round(c.potMinNear, [1, 5, 20]);
  return `${closeness}:${roundness}:${cellKey(c)}`;
}

export interface Scored {
  cell: CellRow;
  score: number;
}

/** Highest score; within 2 points of it, closest to tau/f 2.5, then the roundest values. */
export function selectBest(scored: Scored[]): Scored {
  const best = Math.max(...scored.map((s) => s.score));
  return scored
    .filter((s) => s.score >= best - 0.02)
    .sort((a, b) => (selectionKey(a.cell) < selectionKey(b.cell) ? -1 : 1))[0];
}

/** Re-evaluates the finalists on the full 100 seeds of step 2. */
export async function confirmFinalists(cells: CellRow[]): Promise<CellRow[]> {
  const jobs: Job[] = cells.map((c) => ({
    key: c.key,
    params: cellParams(c),
    assumptions: DEFAULT_ASSUMPTIONS,
    seeds: seedList(CAMPAIGN.step2Seeds),
  }));
  console.error(`step 2 confirmation: ${cells.length} finalists, ${CAMPAIGN.step2Seeds} seeds`);
  const res = await evaluateJobs(jobs, STEP2_STAGES, true, "confirm");
  return cells.map((c, i) => ({ ...c, step2: res[i], status: res[i].viable ? "viable" : classify(res[i]) }));
}
