// Command line entry point (spec §8). Exit codes: 0 OK, 1 invariant violated, 2 golden or vectors diverge, 3 no viable cell.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runGame } from "./engine.ts";
import { renderAllCharts } from "./charts.ts";
import { cellParams, DEFAULT_CELL } from "./params.ts";
import { bandRatio, ensureDir, OUT_DIR, OUTPUT_ROOT, REPO_ROOT, runScenarios, selectedParamsJson, writeJson, type Report } from "./report.ts";
import { lhsDraws, lhsScreenDraws, runSensitivity, scoreCells } from "./sensitivity.ts";
import { cellKey, confirmFinalists, runSweep, selectBest, selectionKey, type CellRow, type Scored } from "./sweep.ts";
import { applyDryRun, THRESHOLDS, CAMPAIGN } from "./thresholds.ts";
import { DEFAULT_ASSUMPTIONS } from "./types.ts";
import { replayFile, writeVectors } from "./vectors.ts";
import { GOLDEN, VECTORS, canonical, checkGolden, goldenHash, sha256 } from "./golden.ts";
import { writeResults, writeSummary } from "./results.ts";

const REPORT = join(OUT_DIR, "report.json");
const SWEEP = join(OUT_DIR, "sweep.json");

const round1 = (v: number | null): string => (v === null ? "n/a" : v.toFixed(1));

async function quick(): Promise<number> {
  const t0 = Date.now();
  const res = await runScenarios(DEFAULT_CELL, ["organic", "whale", "tiny"], 5, DEFAULT_ASSUMPTIONS, "quick");
  console.log(`--quick: tau ${DEFAULT_CELL.tauPct}% f ${DEFAULT_CELL.feePct}% a ${DEFAULT_CELL.aYocto} Pmin ${DEFAULT_CELL.potMinNear} NEAR, 5 seeds, ${res.totalRuns} runs`);
  console.log("scenario   no-rug%  rugs  first-rug(d)  S@J60-vs-A%  retail-vs-A(pts)");
  for (const r of res.rows) {
    console.log(`${r.id.padEnd(10)} ${r.noRugPct.toFixed(0).padStart(6)}  ${String(r.medianRugs).padStart(4)}  ${round1(r.firstRugMedian).padStart(12)}  ${r.supplyVsControl.median.toFixed(1).padStart(11)}  ${r.retailVsA.median.toFixed(1).padStart(16)}`);
  }
  writeJson(join(OUT_DIR, "quick-summary.json"), { cell: DEFAULT_CELL, rows: res.rows.map(({ days, sMed, sP10, sP90, aMed, burnedMed, potMed, representative, rugDensity, ...rest }) => rest) });
  const violations = res.violations;
  console.log(`invariant violations: ${violations}`);
  const golden = checkGolden();
  console.log(`quick finished in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (violations > 0) return 1;
  return golden;
}

interface SweepFile {
  cells: CellRow[];
  viable: CellRow[];
  thresholds: typeof THRESHOLDS;
  campaign: typeof CAMPAIGN;
}

function revive(_k: string, v: unknown): unknown {
  return _k === "aYocto" && typeof v === "string" ? BigInt(v) : v;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8"), revive) as T;
}

function campaignJson(): Record<string, unknown> {
  return { ...CAMPAIGN, aYocto: CAMPAIGN.aYocto.map(String) };
}

async function cmdSweep(): Promise<SweepFile> {
  const { cells, viable } = await runSweep();
  const sweep: SweepFile = { cells, viable, thresholds: THRESHOLDS, campaign: { ...CAMPAIGN } };
  writeJson(SWEEP, { ...sweep, campaign: campaignJson() });
  return sweep;
}

async function selectAndReport(sweep: SweepFile, t0: number): Promise<number> {
  const { viable } = sweep;
  if (viable.length === 0) {
    console.error("no viable cell after step 2");
    return 3;
  }
  // Screen every screen-viable cell on a small hypercube, then give the finalists the full treatment.
  const screenDraws = lhsScreenDraws();
  const screen = await scoreCells(viable, screenDraws, CAMPAIGN.lhsScreenSeeds);
  const screened: Scored[] = viable.map((cell, i) => ({ cell, score: screen[i].filter((r) => r.viable).length / screenDraws.length }));
  const ranked = [...screened].sort((a, b) => b.score - a.score || (selectionKey(a.cell) < selectionKey(b.cell) ? -1 : 1));
  const chosen = ranked.slice(0, CAMPAIGN.lhsFinalists);
  const planned = ranked.find((s) => cellKey(s.cell) === cellKey(DEFAULT_CELL));
  if (planned && !chosen.includes(planned)) chosen.push(planned); // decision rule 11 needs the score of the planned point
  const confirmed = await confirmFinalists(chosen.map((s) => s.cell));
  const finalists = confirmed.filter((c) => c.step2?.viable);
  console.error(`finalists: ${confirmed.length}, confirmed on ${CAMPAIGN.step2Seeds} seeds: ${finalists.length}`);
  if (finalists.length === 0) {
    console.error("no finalist survives the 100-seed confirmation");
    return 3;
  }
  const draws = lhsDraws();
  const perCell = await scoreCells(finalists, draws, CAMPAIGN.lhsSeeds);
  const scored: Scored[] = finalists.map((cell, i) => ({ cell, score: perCell[i].filter((r) => r.viable).length / draws.length }));
  const selected = selectBest(scored);
  const selectedIndex = finalists.indexOf(selected.cell);
  console.error(`selected ${selected.cell.key}, score ${selected.score}`);
  const finalistRows = confirmed.map((c) => ({
    key: c.key,
    screenScore: (screened.find((s) => s.cell.key === c.key) as Scored).score,
    score: scored.find((s) => s.cell.key === c.key)?.score ?? null,
    confirmed: c.step2?.viable ?? false,
    failedAt: c.step2?.failedAt ?? null,
  }));

  const sensitivity = await runSensitivity(selected.cell, draws, perCell[selectedIndex]);
  const scen = await runScenarios(selected.cell, ["organic", "no-bot", "whale", "wash", "sybil", "panic-early", "panic-after", "hype", "dead", "tiny", "all-in"], CAMPAIGN.scenarioSeeds, DEFAULT_ASSUMPTIONS, "final");

  ensureDir(join(OUT_DIR, "runs"));
  for (const [id, group] of Object.entries(scen.bySeries)) writeJson(join(OUT_DIR, "runs", `${id}.json`), group);

  const params = selectedParamsJson(selected.cell, selected.score);
  writeJson(join(OUT_DIR, "selected-params.json"), params);
  writeJson(join(OUT_DIR, "sensitivity.json"), { ...sensitivity, finalists: finalistRows, screened: screened.map((s) => ({ key: s.cell.key, score: s.score })) });

  const vectorCount = existsSync(VECTORS) ? (({ sequences, steps }) => ({ sequences, steps }))(replayFile(VECTORS)) : { sequences: 0, steps: 0 };
  const report: Report = {
    selected: selected.cell,
    score: selected.score,
    params,
    bandRatio: bandRatio(viable),
    cells: sweep.cells,
    viable: screened,
    finalists: finalistRows,
    scenarios: scen.rows,
    sensitivity,
    assumptions: DEFAULT_ASSUMPTIONS,
    violations: scen.violations,
    runs: scen.totalRuns,
    vectorCount,
    runtimeMinutes: (Date.now() - t0) / 60000,
  };
  writeJson(REPORT, report);
  publish(report);
  writeManifest(report, t0);
  console.log(`selected: tau ${selected.cell.tauPct}% f ${selected.cell.feePct}% a ${selected.cell.aYocto} Pmin ${selected.cell.potMinNear} NEAR, score ${(100 * selected.score).toFixed(1)}%`);
  return scen.violations > 0 ? 1 : 0;
}

function publish(report: Report): void {
  renderAllCharts(report);
  ensureDir(join(OUTPUT_ROOT, "docs-assets", "sim"));
  writeResults(report, join(OUTPUT_ROOT, "docs-assets", "sim", "RESULTS.md"));
  writeSummary(report);
}

function writeManifest(report: Report, t0: number): void {
  let git = "unknown";
  try {
    git = execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    /* not a repo */
  }
  writeJson(join(OUT_DIR, "manifest.json"), {
    git_sha: git,
    node: process.version,
    seeds: { step1: CAMPAIGN.step1Seeds, step2_screen: CAMPAIGN.step2ScreenSeeds, step2_confirm: CAMPAIGN.step2Seeds, lhs_screen: CAMPAIGN.lhsScreenSeeds, lhs: CAMPAIGN.lhsSeeds, final: CAMPAIGN.scenarioSeeds },
    thresholds_sha256: sha256(canonical(THRESHOLDS)),
    params_sha256: sha256(canonical(report.params)),
    runs_final: report.runs,
    violations: report.violations,
    duration_minutes: (Date.now() - t0) / 60000,
  });
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const cmd = args.find((a) => !a.startsWith("--"));
  if (args.includes("--dry")) {
    if (!process.env.SIM_OUTPUT_ROOT) throw new Error("--dry needs SIM_OUTPUT_ROOT, so that the published artefacts stay untouched");
    applyDryRun();
  }
  const t0 = Date.now();

  if (args.includes("--quick")) return quick();
  if (cmd === "check-golden") return checkGolden();
  if (cmd === "write-golden") {
    const g = goldenHash();
    writeFileSync(GOLDEN, `${JSON.stringify(g, null, 2)}\n`);
    console.log(`golden written: ${g.hash}`);
    return 0;
  }
  if (cmd === "vectors") {
    const seed = Number(argValue(args, "--seed") ?? 1);
    ensureDir(join(REPO_ROOT, "fixtures"));
    const v = writeVectors(VECTORS, seed);
    console.log(`wrote ${VECTORS}: ${v.sequences.length} sequences, ${v.sequences.reduce((n, s) => n + s.steps.length, 0)} steps`);
    return 0;
  }
  if (cmd === "scenario") {
    const id = args[args.indexOf("scenario") + 1];
    const seed = Number(argValue(args, "--seed") ?? 1);
    const overrides = argValue(args, "--params");
    const base = cellParams(DEFAULT_CELL);
    const merged = overrides ? mergeParams(base, JSON.parse(overrides) as Record<string, string | number>) : base;
    const res = runGame({ scenario: id, seed, params: merged, assumptions: DEFAULT_ASSUMPTIONS, variant: "rug", whalePolicy: "myope" });
    const { supplyDaily, burnedDaily, potDaily, ...compact } = res;
    console.log(JSON.stringify({ ...compact, supply_day60: supplyDaily[60] }, null, 1));
    return res.violations.length > 0 ? 1 : 0;
  }
  if (cmd === "sweep") {
    const s = await cmdSweep();
    console.log(`viable after step 2: ${s.viable.length}`);
    return s.viable.length > 0 ? 0 : 3;
  }
  if (cmd === "sens") return selectAndReport(readJson<SweepFile>(SWEEP), t0);
  if (cmd === "charts") {
    publish(readJson<Report>(REPORT));
    console.log("charts, RESULTS.md and summary.json regenerated");
    return 0;
  }
  if (cmd !== undefined) {
    console.error(`unknown command ${cmd}`);
    return 2;
  }
  const sweep = await cmdSweep();
  return selectAndReport(sweep, t0);
}

function mergeParams(base: ReturnType<typeof cellParams>, o: Record<string, string | number>): ReturnType<typeof cellParams> {
  const out = { ...base };
  for (const [k, v] of Object.entries(o)) (out as unknown as Record<string, bigint>)[k] = BigInt(v);
  return out;
}

const code = await main();
process.exit(code);

