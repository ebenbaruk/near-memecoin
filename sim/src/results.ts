// Published artefacts derived from the report: README section, page summary.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUTPUT_ROOT, type Report, type ScenarioRow } from "./report.ts";
import { CAMPAIGN } from "./thresholds.ts";

const pct = (v: number, d = 1): string => `${v > 0 ? "+" : ""}${v.toFixed(d)}`;

function scenarioTable(rows: ScenarioRow[]): string {
  return rows
    .map((r) => {
      const supply = `${pct(r.supplyVsControl.median)}% [${pct(r.supplyVsControl.ci[0])}, ${pct(r.supplyVsControl.ci[1])}]`;
      const retail = `${pct(r.retailVsA.median)} [${pct(r.retailVsA.ci[0])}, ${pct(r.retailVsA.ci[1])}]`;
      return `| ${r.id} | ${r.noRugPct.toFixed(0)}% | ${r.medianRugs} | ${supply} | ${retail} |`;
    })
    .join("\n");
}

function curveLabel(report: Report): string {
  const a = Number(report.selected.aYocto) / 1e24;
  return `p = 0.00001 + ${a.toExponential(0)}·S NEAR`;
}

function topSensitivity(report: Report): string {
  return [...report.sensitivity.spearman]
    .sort((x, y) => Math.abs(y.viable) - Math.abs(x.viable))
    .slice(0, 3)
    .map((s) => `${s.label} (rank corr. with viability ${s.viable.toFixed(2)})`)
    .join("; ");
}

export function renderResults(report: Report): string {
  const by = (id: string): ScenarioRow => report.scenarios.find((s) => s.id === id) as ScenarioRow;
  const whale = by("whale");
  const noBot = by("no-bot");
  const tiny = by("tiny");
  const whaleTotal = Object.values(whale.who).reduce((a, b) => a + b, 0);
  const whaleShare = whaleTotal > 0 ? (100 * whale.who.whale) / whaleTotal : 0;
  const tinyResult = `with order flow at 2% of the base case, ${(100 - tiny.noRugPct).toFixed(0)}% of modelled games saw at least one rug, median ${tiny.medianRugs} rugs`;
  const leaves = report.sensitivity.leavesBand;
  const leaveLine = leaves.length
    ? `- Single assumptions that alone push the selected point out of the viable band: ${leaves.join(", ")}.\n`
    : "";

  return `## Simulation: 60 days, before parameters were chosen
These results come from **modelled agents whose behaviour we assumed**. Nothing is fitted to real trading data.
They compare parameter choices. They are not a forecast and imply no return for anyone.

Reproduce: \`npm run sim -- --quick\` (seconds) or \`npm run sim\` (about ${report.runtimeMinutes.toFixed(0)} min). Seeds and code are in \`sim/\`.
Rules are integer-exact and replayed against the contract with ${report.vectorCount.sequences} shared test vectors (${report.vectorCount.steps} steps).

![Supply over time under six scenarios](docs-assets/sim/supply-over-time.png)

| Scenario | Games with no rug | Median rugs | Supply at day 60 vs control | Retail vs fee-burn control |
|---|---|---|---|---|
${scenarioTable(report.scenarios)}

**Control coin:** same bonding curve and same agents, but no rug; fees are destroyed (A) or absent (B).
Retail column: paired median difference in percentage points of capital invested, with bootstrap CI.

**Parameters chosen:** tau ${report.selected.tauPct}%, fee ${report.selected.feePct}%, curve ${curveLabel(report)}, Pmin ${report.selected.potMinNear} NEAR, selected by the rule in \`Docs/spec/30-simulation.md\`.
The viable band is tau/f between ${report.bandRatio.low.toFixed(1)} and ${report.bandRatio.high.toFixed(1)}, measured on a ${CAMPAIGN.step2ScreenSeeds}-seed screen of ${report.cells.filter((c) => c.step2).length} (cell, Pmin) pairs; the ${report.finalists.length} finalists were confirmed on ${CAMPAIGN.step2Seeds} seeds and scored on ${CAMPAIGN.lhsDraws} assumption draws:

![Viable band](docs-assets/sim/viable-band.png)

**What the model says that you should not like**
- Bots and whales will probably win. With a 25% holder in the game, that holder took ${whaleShare.toFixed(0)}% of rugs.
- Without an attentive bot, ${noBot.noRugPct.toFixed(0)}% of modelled games saw no rug.
- Assumptions that change the conclusion most: ${topSensitivity(report)}.
${leaveLine}- Timing depends on an assumed order flow; at demo scale, ${tinyResult}.
`;
}

export function writeResults(report: Report, outPath: string): void {
  writeFileSync(outPath, renderResults(report));
}

export interface PageSummary {
  notice: string;
  params: Record<string, unknown>;
  selected: { tau_pct: number; fee_pct: number; a_near: number; pot_min_near: number; tau_over_f: number; score: number };
  band: { tau_over_f_low: number; tau_over_f_high: number };
  viability: { tauPct: number; feePct: number; aYocto: string; status: string; viableStep2: boolean }[];
  limits: { no_bot_no_rug_pct: number; whale_rug_share_pct: number; whale_w_pct: number; assumptions_changing_band: string[] };
  scenarios: Record<string, {
    days: number[];
    median: number[];
    p10: number[];
    p90: number[];
    control_a_median: number[];
    representative: { seed: number; supply: number[]; rug_ticks: number[] };
    rug_density: number[];
    table: { no_rug_pct: number; median_rugs: number; d10: number; d30: number; d60: number; burned: number };
    who: Record<string, number>;
  }>;
}

export function buildSummary(report: Report): PageSummary {
  const scenarios: PageSummary["scenarios"] = {};
  for (const r of report.scenarios) {
    scenarios[r.id] = {
      days: r.days,
      median: r.sMed.map(round),
      p10: r.sP10.map(round),
      p90: r.sP90.map(round),
      control_a_median: r.aMed.map(round),
      representative: { seed: r.representative.seed, supply: r.representative.s.map(round), rug_ticks: r.representative.rugTicks },
      rug_density: r.rugDensity,
      table: { no_rug_pct: r.noRugPct, median_rugs: r.medianRugs, d10: round(r.supplyTable.d10), d30: round(r.supplyTable.d30), d60: round(r.supplyTable.d60), burned: round(r.supplyTable.burned) },
      who: r.who,
    };
  }
  const whale = report.scenarios.find((s) => s.id === "whale") as ScenarioRow;
  const noBot = report.scenarios.find((s) => s.id === "no-bot") as ScenarioRow;
  const whaleTotal = Object.values(whale.who).reduce((a, b) => a + b, 0);
  const sel = report.selected;
  return {
    notice: "Assumed behaviour. Not a forecast. Supply only; not a price forecast.",
    params: report.params,
    selected: { tau_pct: sel.tauPct, fee_pct: sel.feePct, a_near: Number(sel.aYocto) / 1e24, pot_min_near: sel.potMinNear, tau_over_f: sel.ratio, score: report.score },
    band: { tau_over_f_low: report.bandRatio.low, tau_over_f_high: report.bandRatio.high },
    viability: report.cells
      .filter((c) => c.step1 && !c.step2)
      .map((c) => ({
        tauPct: c.tauPct,
        feePct: c.feePct,
        aYocto: c.aYocto.toString(),
        status: c.status,
        viableStep2: report.viable.some((v) => v.cell.tauPct === c.tauPct && v.cell.feePct === c.feePct && v.cell.aYocto === c.aYocto),
      })),
    limits: {
      no_bot_no_rug_pct: noBot.noRugPct,
      whale_rug_share_pct: whaleTotal > 0 ? (100 * whale.who.whale) / whaleTotal : 0,
      whale_w_pct: 25,
      assumptions_changing_band: report.sensitivity.leavesBand,
    },
    scenarios,
  };
}

function round(v: number): number {
  return Math.round(v);
}

export function writeSummary(report: Report): string {
  const dir = join(OUTPUT_ROOT, "web", "public", "sim");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "summary.json");
  writeFileSync(path, `${JSON.stringify(buildSummary(report))}\n`);
  return path;
}
