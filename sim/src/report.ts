// Final runs of the selected point (all scenarios, three variants) and the data behind every published artefact.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAMPAIGN } from "./thresholds.ts";
import { bootstrapMedianCI, median, medianRugs, noRugShare, p10, p90, pairedRetailGap, pairedSupplyGap, rugIntervals } from "./metrics.ts";
import { cellParams, type CellInput } from "./params.ts";
import { runTasks, type Task } from "./pool.ts";
import { SCENARIOS } from "./scenarios.ts";
import type { CellRow } from "./sweep.ts";
import type { SensitivityResult } from "./sensitivity.ts";
import { DEFAULT_ASSUMPTIONS, KINDS, WHALE_POLICIES, type Assumptions, type Kind, type RunSummary, type WhalePolicy } from "./types.ts";
import { paramsToJson } from "./vectors.ts";

export const SIM_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = join(SIM_ROOT, "..");
/** SIM_OUTPUT_ROOT redirects every generated file (used by `--dry`). */
export const OUTPUT_ROOT = process.env.SIM_OUTPUT_ROOT ?? REPO_ROOT;
export const OUT_DIR = join(process.env.SIM_OUTPUT_ROOT ?? SIM_ROOT, "out");

export interface ScenarioRow {
  id: string;
  whalePolicy: WhalePolicy | null;
  noRugPct: number;
  medianRugs: number;
  rugsP10: number;
  rugsP90: number;
  firstRugMedian: number | null;
  intervalMedian: number | null;
  potAtRugMedian: number | null;
  orphanPotMedian: number;
  gapPositiveDays: { holder: number; buy: number; exit: number };
  supplyVsControl: { median: number; ci: [number, number] };
  retailVsA: { median: number; ci: [number, number] };
  retailVsB: { median: number; ci: [number, number] };
  retailReturnMedian: number;
  retailWinnersMedian: number;
  who: Record<Kind, number>;
  pot: Record<Kind, number>;
  pnlMedian: Record<Kind, number>;
  concentration: number;
  supplyTable: { d10: number; d30: number; d60: number; burned: number };
  days: number[];
  sMed: number[];
  sP10: number[];
  sP90: number[];
  aMed: number[];
  burnedMed: number[];
  potMed: number[];
  representative: { seed: number; s: number[]; rugTicks: number[] };
  rugDensity: number[];
}

export interface Report {
  selected: CellRow;
  score: number;
  params: Record<string, unknown>;
  bandRatio: { low: number; high: number };
  cells: CellRow[];
  viable: { cell: CellRow; score: number }[];
  finalists: { key: string; screenScore: number; score: number | null; confirmed: boolean; failedAt: string | null }[];
  scenarios: ScenarioRow[];
  sensitivity: SensitivityResult;
  assumptions: Assumptions;
  violations: number;
  runs: number;
  vectorCount: { sequences: number; steps: number };
  runtimeMinutes: number;
}

const series = (runs: RunSummary[], key: "supplyDaily" | "burnedDaily" | "potDaily", f: (v: number[]) => number): number[] => {
  const n = runs[0][key].length;
  return Array.from({ length: n }, (_, d) => f(runs.map((r) => r[key][d])));
};

function statsFor(runs: RunSummary[], controlA: RunSummary[], controlB: RunSummary[], id: string, policy: WhalePolicy | null): ScenarioRow {
  const finals = runs.map((r) => r.supplyDaily[60]);
  const med = median(finals);
  const repr = [...runs].sort((a, b) => Math.abs(a.supplyDaily[60] - med) - Math.abs(b.supplyDaily[60] - med) || a.seed - b.seed)[0];

  const density = new Array<number>(60).fill(0);
  for (const r of runs) for (const e of r.rugs) density[Math.min(59, Math.floor(e.tick / 24))]++;

  const who: Record<Kind, number> = { retail: 0, sniper: 0, whale: 0, wash: 0, sybil: 0 };
  const pot: Record<Kind, number> = { retail: 0, sniper: 0, whale: 0, wash: 0, sybil: 0 };
  const pnlMedian: Record<Kind, number> = { retail: 0, sniper: 0, whale: 0, wash: 0, sybil: 0 };
  for (const k of KINDS) {
    who[k] = runs.reduce((s, r) => s + r.rugCount[k], 0);
    pot[k] = runs.reduce((s, r) => s + r.potTaken[k], 0);
    pnlMedian[k] = median(runs.map((r) => r.pnl[k]));
  }
  const totalRugs = KINDS.reduce((s, k) => s + who[k], 0);
  const concentration = totalRugs > 0 ? KINDS.reduce((s, k) => s + (who[k] / totalRugs) ** 2, 0) : 0;

  const potAtRug = runs.flatMap((r) => r.rugs.map((e) => e.pot));
  const intervals = rugIntervals(runs);
  const firstDays = runs.filter((r) => r.firstRugDay !== null).map((r) => r.firstRugDay as number);

  const gapA = pairedRetailGap(runs, controlA);
  const gapB = pairedRetailGap(runs, controlB);
  const supplyGap = pairedSupplyGap(runs, controlA);

  return {
    id,
    whalePolicy: policy,
    noRugPct: 100 * noRugShare(runs),
    medianRugs: medianRugs(runs),
    rugsP10: p10(runs.map((r) => r.nRugs)),
    rugsP90: p90(runs.map((r) => r.nRugs)),
    firstRugMedian: firstDays.length ? median(firstDays) : null,
    intervalMedian: intervals.length ? median(intervals) : null,
    potAtRugMedian: potAtRug.length ? median(potAtRug) : null,
    orphanPotMedian: median(runs.map((r) => r.orphanPot)),
    gapPositiveDays: {
      holder: 100 * median(runs.map((r) => r.gapDays.holder)),
      buy: 100 * median(runs.map((r) => r.gapDays.buy)),
      exit: 100 * median(runs.map((r) => r.gapDays.exit)),
    },
    supplyVsControl: { median: median(supplyGap), ci: bootstrapMedianCI(supplyGap, `${id}.supply`) },
    retailVsA: { median: median(gapA), ci: bootstrapMedianCI(gapA, `${id}.retailA`) },
    retailVsB: { median: median(gapB), ci: bootstrapMedianCI(gapB, `${id}.retailB`) },
    retailReturnMedian: median(runs.map((r) => r.retailReturnPct)),
    retailWinnersMedian: 100 * median(runs.map((r) => r.retailWinners)),
    who,
    pot,
    pnlMedian,
    concentration,
    supplyTable: {
      d10: median(runs.map((r) => r.supplyDaily[10])),
      d30: median(runs.map((r) => r.supplyDaily[30])),
      d60: med,
      burned: median(runs.map((r) => r.burnedDaily[60])),
    },
    days: Array.from({ length: 61 }, (_, i) => i),
    sMed: series(runs, "supplyDaily", median),
    sP10: series(runs, "supplyDaily", p10),
    sP90: series(runs, "supplyDaily", p90),
    aMed: series(controlA, "supplyDaily", median),
    burnedMed: series(runs, "burnedDaily", median),
    potMed: series(runs, "potDaily", median),
    representative: { seed: repr.seed, s: repr.supplyDaily, rugTicks: repr.rugs.map((e) => e.tick) },
    rugDensity: density,
  };
}

export interface ScenarioRuns {
  rows: ScenarioRow[];
  totalRuns: number;
  violations: number;
  bySeries: Record<string, { rug: RunSummary[]; a: RunSummary[]; b: RunSummary[] }>;
}

/** All scenarios for one parameter point. `seeds` controls the depth. */
export async function runScenarios(cell: CellInput, ids: string[], seeds: number, assumptions: Assumptions = DEFAULT_ASSUMPTIONS, label = "scenarios"): Promise<ScenarioRuns> {
  const params = cellParams(cell);
  const seedArr = Array.from({ length: seeds }, (_, i) => i + 1);
  const tasks: Task[] = [];
  const index: { id: string; policy: WhalePolicy | null; start: number; n: number }[] = [];
  const add = (id: string, policy: WhalePolicy | null, variants: Task["variants"]): void => {
    const start = tasks.length;
    for (const seed of seedArr) tasks.push({ scenario: id, seed, params, assumptions, whalePolicy: policy ?? undefined, variants, lite: false });
    index.push({ id, policy, start, n: seedArr.length });
  };
  for (const s of SCENARIOS.filter((c) => ids.includes(c.id))) {
    if (s.id === "whale") {
      for (const policy of WHALE_POLICIES) add(s.id, policy, ["rug"]);
      add(s.id, "myope", ["A", "B"]);
    } else {
      add(s.id, s.id === "all-in" ? "myope" : null, ["rug", "A", "B"]);
    }
  }
  const results = await runTasks(tasks, label);
  const sliced = (e: (typeof index)[number]): RunSummary[][] => results.slice(e.start, e.start + e.n);

  const rows: ScenarioRow[] = [];
  const bySeries: ScenarioRuns["bySeries"] = {};
  let violations = 0;
  let totalRuns = 0;
  for (const s of SCENARIOS.filter((c) => ids.includes(c.id))) {
    let rug: RunSummary[];
    let a: RunSummary[];
    let b: RunSummary[];
    let policy: WhalePolicy | null = null;
    if (s.id === "whale") {
      const entries = index.filter((e) => e.id === "whale");
      const controlEntry = entries[entries.length - 1];
      const control = sliced(controlEntry);
      a = control.map((r) => r[0]);
      b = control.map((r) => r[1]);
      let best = -Infinity;
      rug = [];
      for (const e of entries.slice(0, -1)) {
        const runs = sliced(e).map((r) => r[0]);
        const pnl = median(runs.map((r) => r.pnl.whale));
        if (pnl > best) {
          best = pnl;
          rug = runs;
          policy = e.policy;
        }
        violations += runs.filter((r) => r.violations.length > 0).length;
        totalRuns += runs.length;
      }
      violations += [...a, ...b].filter((r) => r.violations.length > 0).length;
      totalRuns += a.length + b.length;
    } else {
      const e = index.find((x) => x.id === s.id) as (typeof index)[number];
      const trio = sliced(e);
      rug = trio.map((r) => r[0]);
      a = trio.map((r) => r[1]);
      b = trio.map((r) => r[2]);
      policy = e.policy;
      violations += [...rug, ...a, ...b].filter((r) => r.violations.length > 0).length;
      totalRuns += rug.length * 3;
    }
    rows.push(statsFor(rug, a, b, s.id, policy));
    bySeries[s.id] = { rug, a, b };
  }
  return { rows, totalRuns, violations, bySeries };
}

/** Viable band in tau/f, for the published sentence. */
export function bandRatio(viable: CellRow[]): { low: number; high: number } {
  const ratios = viable.map((c) => c.ratio);
  return { low: Math.min(...ratios), high: Math.max(...ratios) };
}

export function selectedParamsJson(selected: CellRow, score: number): Record<string, unknown> {
  return {
    ...paramsToJson(cellParams(selected)),
    tau_pct: selected.tauPct,
    fee_pct: selected.feePct,
    a_near: Number(selected.aYocto) / 1e24,
    p0_near: 1e-5,
    pot_min_near: selected.potMinNear,
    tau_over_f: selected.ratio,
    score,
    selection_rule: "Docs/spec/30-simulation.md section 5",
  };
}

export const ensureDir = (p: string): void => void mkdirSync(p, { recursive: true });

export function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, jsonBigInt, 1)}\n`);
}

export function jsonBigInt(_k: string, v: unknown): unknown {
  return typeof v === "bigint" ? v.toString() : v;
}

export { CAMPAIGN };
