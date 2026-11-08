// Hand-written SVG charts, rendered to PNG with resvg. Palette: Docs/spec/41-visual-direction.md §2 only.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { ensureDir, OUTPUT_ROOT, SIM_ROOT, type Report, type ScenarioRow } from "./report.ts";
import { CAMPAIGN } from "./thresholds.ts";
import type { CellRow } from "./sweep.ts";
import { KINDS, type Kind } from "./types.ts";

const C = {
  ink: "#14160D",
  brown: "#3A1D0E",
  cream: "#F6EFDC",
  mustard: "#F2C230",
  rust: "#F0562B",
  pink: "#F59AC4",
  teal: "#0F7B6C",
  sage: "#DDE3B5",
  cobalt: "#2457A6",
};
const FONT = `'DM Mono', 'DejaVu Sans Mono', monospace`;
const OUT = join(OUTPUT_ROOT, "docs-assets", "sim");

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtN = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${Number((n / 1e6).toFixed(1))}M`;
  if (a >= 1e3) return `${Number((n / 1e3).toFixed(1))}k`;
  return n.toFixed(0);
};

function text(x: number, y: number, s: string, o: { size?: number; anchor?: string; weight?: number; fill?: string; rotate?: number } = {}): string {
  const rot = o.rotate ? ` transform="rotate(${o.rotate} ${x} ${y})"` : "";
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${FONT}" font-size="${o.size ?? 13}" text-anchor="${o.anchor ?? "start"}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? C.ink}"${rot}>${esc(s)}</text>`;
}

function svgDoc(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><rect width="${w}" height="${h}" fill="${C.cream}"/>${body}</svg>\n`;
}

function save(name: string, svg: string): void {
  ensureDir(OUT);
  writeFileSync(join(OUT, `${name}.svg`), svg);
  const fonts = ["DMMono-Regular.ttf", "DMMono-Medium.ttf"].map((f) => join(SIM_ROOT, "assets", "fonts", f));
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: 2 * Number(/width="(\d+)"/.exec(svg)?.[1] ?? 1200) },
    font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: "DM Mono" },
  }).render().asPng();
  writeFileSync(join(OUT, `${name}.png`), png);
}

const niceMax = (v: number): number => {
  const m = 10 ** Math.floor(Math.log10(v));
  const s = v / m;
  const step = s <= 1 ? 1 : s <= 2 ? 2 : s <= 2.5 ? 2.5 : s <= 5 ? 5 : 10;
  return step * m;
};

const SUPPLY_PANELS = ["organic", "whale", "panic-early", "hype", "dead", "tiny"];

export function supplyChart(rows: ScenarioRow[]): string {
  const width = 1200;
  const panelW = 370;
  const panelH = 230;
  const marginX = 58;
  const top = 112;
  const gapX = 24;
  const gapY = 74;
  let body = text(24, 38, "Supply over 60 days", { size: 22, weight: 500 });
  body += text(24, 62, "Modelled agents. Supply only; not a price forecast.", { size: 14 });
  // Legend.
  const lx = 620;
  body += `<rect x="${lx}" y="26" width="26" height="12" fill="${C.teal}" fill-opacity="0.28"/>` + text(lx + 34, 37, "p10-p90 (rug coin)", { size: 12 });
  body += `<line x1="${lx}" x2="${lx + 26}" y1="52" y2="52" stroke="${C.teal}" stroke-width="2.5"/>` + text(lx + 34, 56, "median (rug coin)", { size: 12 });
  body += `<line x1="${lx + 200}" x2="${lx + 226}" y1="32" y2="32" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="5 4"/>` + text(lx + 234, 37, "control A median", { size: 12 });
  body += `<line x1="${lx + 200}" x2="${lx + 226}" y1="52" y2="52" stroke="${C.cobalt}" stroke-width="1"/>` + text(lx + 234, 56, "representative seed", { size: 12 });
  body += `<line x1="${lx + 402}" x2="${lx + 402}" y1="26" y2="58" stroke="${C.rust}" stroke-width="2"/>` + text(lx + 412, 37, "rug (that seed)", { size: 12 });
  body += `<rect x="${lx + 404}" y="49" width="24" height="9" fill="${C.rust}"/>` + text(lx + 436, 57, "rugs, all seeds", { size: 12 });

  SUPPLY_PANELS.forEach((id, idx) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x0 = marginX + col * (panelW + gapX);
    const y0 = top + row * (panelH + gapY);
    const plotW = panelW - marginX + 18;
    const yMax = niceMax(Math.max(...r.sP90, ...r.aMed, ...r.representative.s, 1));
    const X = (d: number): number => x0 + (d / 60) * plotW;
    const Y = (v: number): number => y0 + panelH - (v / yMax) * panelH;

    body += text(x0, y0 - 12, id, { size: 15, weight: 500 });
    body += text(x0 + plotW, y0 - 12, `rugs ${r.medianRugs} (median)`, { size: 12, anchor: "end" });
    for (let t = 0; t <= 2; t++) {
      const v = (yMax * t) / 2;
      const y = Y(v);
      body += `<line x1="${x0}" x2="${x0 + plotW}" y1="${y}" y2="${y}" stroke="${C.ink}" stroke-opacity="0.1"/>`;
      body += text(x0 - 8, y + 4, fmtN(v), { size: 11, anchor: "end" });
    }
    for (const d of [0, 20, 40, 60]) body += text(X(d), y0 + panelH + 30, `D${d}`, { size: 11, anchor: "middle" });

    const area =
      r.sP90.map((v, d) => `${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join(" ") +
      " " +
      [...r.sP10].reverse().map((v, d) => `${X(60 - d).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    body += `<polygon points="${area}" fill="${C.teal}" fill-opacity="0.28"/>`;
    const poly = (arr: number[]): string => arr.map((v, d) => `${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    body += `<polyline points="${poly(r.aMed)}" fill="none" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    body += `<polyline points="${poly(r.representative.s)}" fill="none" stroke="${C.cobalt}" stroke-width="1"/>`;
    body += `<polyline points="${poly(r.sMed)}" fill="none" stroke="${C.teal}" stroke-width="2.5" stroke-linejoin="round"/>`;
    for (const tick of r.representative.rugTicks) {
      const x = X(tick / 24);
      body += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y0}" y2="${y0 + panelH}" stroke="${C.rust}" stroke-width="1.2" stroke-opacity="0.75"/>`;
    }
    const maxD = Math.max(...r.rugDensity, 1);
    r.rugDensity.forEach((v, d) => {
      if (v === 0) return;
      const op = 0.15 + (0.85 * v) / maxD;
      body += `<rect x="${X(d).toFixed(1)}" y="${y0 + panelH + 6}" width="${(plotW / 60 + 0.5).toFixed(1)}" height="8" fill="${C.rust}" fill-opacity="${op.toFixed(2)}"/>`;
    });
    body += `<line x1="${x0}" x2="${x0 + plotW}" y1="${y0 + panelH}" y2="${y0 + panelH}" stroke="${C.ink}" stroke-opacity="0.45"/>`;
  });
  return svgDoc(width, top + 2 * panelH + gapY + 40, body);
}

const STATUS_FILL: Record<CellRow["status"], string> = { viable: C.teal, never: C.sage, degenerate: C.mustard };
const STATUS_MARK: Record<CellRow["status"], string> = { viable: "ok", never: "—", degenerate: "x" };

export function viableChart(report: Report): string {
  const taus = CAMPAIGN.tauPct;
  const fees = CAMPAIGN.feePct;
  const slopes = CAMPAIGN.aYocto;
  const width = 1200;
  const cellW = 44;
  const cellH = 30;
  const panelW = fees.length * cellW;
  const panelH = taus.length * cellH;
  const top = 106;
  let body = text(24, 38, "Viable band", { size: 22, weight: 500 });
  body += text(24, 62, `Cells at Pmin ${CAMPAIGN.step1Pmin} NEAR (step 1, ${CAMPAIGN.step1Seeds} seeds). Teal: also viable in step 2 (${CAMPAIGN.step2ScreenSeeds}-seed screen) for at least one Pmin.`, { size: 14 });
  // Legend, with the mark that also encodes the status.
  const items: [CellRow["status"], string][] = [["viable", "viable"], ["never", "never rugs"], ["degenerate", "degenerate"]];
  items.forEach(([s, l], i) => {
    const x = 760 + i * 145;
    body += `<rect x="${x}" y="26" width="22" height="16" fill="${STATUS_FILL[s]}"/>`;
    body += text(x + 11, 39, STATUS_MARK[s], { size: 11, anchor: "middle", fill: s === "viable" ? C.cream : s === "degenerate" ? C.brown : C.ink });
    body += text(x + 30, 39, l, { size: 12 });
  });
  const key = (t: number, f: number, a: bigint): CellRow | undefined =>
    report.cells.find((c) => c.tauPct === t && c.feePct === f && c.aYocto === a && c.potMinNear === CAMPAIGN.step1Pmin && c.step1 !== undefined);

  slopes.forEach((a, i) => {
    const x0 = 70 + i * (panelW + 40);
    const aLabel = `a = ${(Number(a) / 1e24).toExponential(0)} NEAR`;
    body += text(x0, top - 26, aLabel, { size: 14, weight: 500 });
    fees.forEach((f, j) => body += text(x0 + j * cellW + cellW / 2, top - 8, `${f}`, { size: 11, anchor: "middle" }));
    taus.forEach((t, k) => {
      body += text(x0 - 8, top + k * cellH + cellH / 2 + 4, `${t}%`, { size: 11, anchor: "end" });
      fees.forEach((f, j) => {
        const c = key(t, f, a);
        if (!c) return;
        const viableStep2 = report.viable.some((v) => v.cell.tauPct === t && v.cell.feePct === f && v.cell.aYocto === a);
        const status = viableStep2 ? "viable" : c.status === "viable" ? "degenerate" : c.status;
        const xc = x0 + j * cellW;
        const yc = top + k * cellH;
        body += `<rect x="${xc + 1}" y="${yc + 1}" width="${cellW - 2}" height="${cellH - 2}" fill="${STATUS_FILL[status]}"/>`;
        body += text(xc + cellW / 2, yc + cellH / 2 + 4, STATUS_MARK[status], { size: 11, anchor: "middle", fill: status === "viable" ? C.cream : status === "degenerate" ? C.brown : C.ink });
      });
    });
    const sel = report.selected;
    if (sel.aYocto === a) {
      const xs = x0 + fees.indexOf(sel.feePct) * cellW;
      const ys = top + taus.indexOf(sel.tauPct) * cellH;
      body += `<rect x="${xs}" y="${ys}" width="${cellW}" height="${cellH}" fill="none" stroke="${C.rust}" stroke-width="3"/>`;
    }
    body += text(x0 + panelW / 2, top + panelH + 22, "fee f (%)", { size: 12, anchor: "middle" });
  });
  body += text(16, top + panelH / 2, "tau", { size: 12, rotate: -90 });
  const sel = report.selected;
  body += text(70, top + panelH + 60, `Selected (outlined): tau ${sel.tauPct}%, f ${sel.feePct}%, a ${(Number(sel.aYocto) / 1e24).toExponential(0)} NEAR, Pmin ${sel.potMinNear} NEAR. Viable band tau/f: ${report.bandRatio.low.toFixed(1)} to ${report.bandRatio.high.toFixed(1)}.`, { size: 13 });
  return svgDoc(width, top + panelH + 84, body);
}

const OUTPUTS: { key: "rugs" | "firstRug" | "retailGap"; title: string; unit: string }[] = [
  { key: "rugs", title: "Rugs per game (median)", unit: "" },
  { key: "firstRug", title: "First rug (days, median)", unit: "d" },
  { key: "retailGap", title: "Retail gap vs control A (pts)", unit: "pts" },
];

export function tornadoChart(report: Report): string {
  const { oat, baseline } = report.sensitivity;
  const factors = [...new Set(oat.map((o) => o.factor))];
  const width = 1200;
  const rowH = 26;
  const top = 92;
  const panelW = 280;
  const labelW = 260;
  let body = text(24, 38, "Sensitivity, one factor at a time", { size: 22, weight: 500 });
  body += text(24, 62, `Median of ${CAMPAIGN.oatSeeds} seeds around the selected point. Bars run from low to high value of each factor. Cross = factor value leaves the viable band.`, { size: 13 });
  const sortedF = factors
    .map((f) => {
      const rows = oat.filter((o) => o.factor === f);
      const span = Math.abs((rows[1]?.rugs ?? 0) - (rows[0]?.rugs ?? 0));
      return { f, span };
    })
    .sort((a, b) => b.span - a.span || (a.f < b.f ? -1 : 1))
    .map((x) => x.f);
  OUTPUTS.forEach((out, p) => {
    const x0 = labelW + p * (panelW + 40) + (p === 0 ? 0 : 0);
    const vals = oat.map((o) => o[out.key]).concat(baseline[out.key]);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi === lo) {
      hi += 1;
      lo -= 1;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    const X = (v: number): number => x0 + ((v - lo) / (hi - lo)) * panelW;
    body += text(x0, top - 10, out.title, { size: 13, weight: 500 });
    body += `<line x1="${X(baseline[out.key])}" x2="${X(baseline[out.key])}" y1="${top}" y2="${top + sortedF.length * rowH}" stroke="${C.ink}" stroke-dasharray="3 3"/>`;
    body += text(X(baseline[out.key]), top + sortedF.length * rowH + 16, `base ${baseline[out.key].toFixed(1)}${out.unit}`, { size: 11, anchor: "middle" });
    sortedF.forEach((f, i) => {
      const rows = oat.filter((o) => o.factor === f);
      const a = X(rows[0][out.key]);
      const b = X(rows[1][out.key]);
      const y = top + i * rowH + 7;
      body += `<rect x="${Math.min(a, b).toFixed(1)}" y="${y}" width="${Math.max(2, Math.abs(a - b)).toFixed(1)}" height="12" fill="${C.teal}" rx="2"/>`;
      rows.forEach((r) => {
        if (!r.viable) body += text(X(r[out.key]), y + 11, "x", { size: 12, anchor: "middle", fill: C.rust, weight: 500 });
      });
    });
  });
  sortedF.forEach((f, i) => {
    const rows = oat.filter((o) => o.factor === f);
    body += text(labelW - 10, top + i * rowH + 17, `${rows[0].label}`, { size: 12, anchor: "end" });
    if (i % 2 === 0) body = `<rect x="16" y="${top + i * rowH}" width="${width - 32}" height="${rowH}" fill="${C.sage}" fill-opacity="0.35"/>` + body;
  });
  return svgDoc(width, top + sortedF.length * rowH + 40, body);
}

export function retailChart(rows: ScenarioRow[]): string {
  const ids = rows.map((r) => r.id);
  const width = 1200;
  const rowH = 44;
  const top = 96;
  const left = 170;
  const plotW = width - left - 200;
  const all = rows.flatMap((r) => [...r.retailVsA.ci, ...r.retailVsB.ci, r.retailVsA.median, r.retailVsB.median]).filter((v) => Number.isFinite(v));
  let lo = Math.min(0, ...all);
  let hi = Math.max(0, ...all);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  const X = (v: number): number => left + ((v - lo) / (hi - lo)) * plotW;
  let body = text(24, 38, "Retail return vs control coins", { size: 22, weight: 500 });
  body += text(24, 62, "Paired median difference in points of invested capital, 95% bootstrap CI. Modelled agents, not a forecast.", { size: 14 });
  body += `<line x1="${X(0)}" x2="${X(0)}" y1="${top - 10}" y2="${top + ids.length * rowH}" stroke="${C.ink}" stroke-opacity="0.5"/>`;
  const span = hi - lo;
  const step = span > 40 ? 10 : span > 16 ? 5 : span > 8 ? 2 : 1;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    body += text(X(v), top + ids.length * rowH + 18, `${v}`, { size: 11, anchor: "middle" });
    body += `<line x1="${X(v)}" x2="${X(v)}" y1="${top + ids.length * rowH}" y2="${top + ids.length * rowH + 5}" stroke="${C.ink}" stroke-opacity="0.5"/>`;
  }
  const dots: [string, string, (r: ScenarioRow) => { median: number; ci: [number, number] }][] = [
    ["vs A (fees destroyed)", C.teal, (r) => r.retailVsA],
    ["vs B (no fees)", C.rust, (r) => r.retailVsB],
  ];
  dots.forEach(([label, color], i) => {
    const x = width - 180;
    body += `<circle cx="${x}" cy="${28 + i * 20}" r="6" fill="${color}"/>` + text(x + 14, 33 + i * 20, label, { size: 12 });
  });
  rows.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2;
    if (i % 2 === 0) body += `<rect x="16" y="${top + i * rowH}" width="${width - 32}" height="${rowH}" fill="${C.sage}" fill-opacity="0.35"/>`;
    body += text(left - 12, y + 4, r.id, { size: 13, anchor: "end" });
    dots.forEach(([, color, pick], j) => {
      const d = pick(r);
      const dy = y + (j === 0 ? -6 : 6);
      body += `<line x1="${X(d.ci[0]).toFixed(1)}" x2="${X(d.ci[1]).toFixed(1)}" y1="${dy}" y2="${dy}" stroke="${color}" stroke-width="2"/>`;
      body += `<circle cx="${X(d.median).toFixed(1)}" cy="${dy}" r="5" fill="${color}" stroke="${C.cream}" stroke-width="1.5"/>`;
    });
    body += text(left + plotW + 16, y + 4, `${r.retailVsA.median.toFixed(1)} / ${r.retailVsB.median.toFixed(1)}`, { size: 12 });
  });
  return svgDoc(width, top + ids.length * rowH + 34, body);
}

const KIND_COLOR: Record<Kind, string> = { retail: C.teal, sniper: C.cobalt, whale: C.rust, wash: C.mustard, sybil: C.pink };

export function whoChart(rows: ScenarioRow[]): string {
  const width = 1200;
  const rowH = 36;
  const top = 100;
  const left = 170;
  const plotW = width - left - 80;
  let body = text(24, 38, "Who rugs", { size: 22, weight: 500 });
  body += text(24, 62, "Share of rugs by type of agent, all seeds. Bots and whales probably win.", { size: 14 });
  KINDS.forEach((k, i) => {
    const x = left + i * 150;
    body += `<rect x="${x}" y="74" width="18" height="12" rx="2" fill="${KIND_COLOR[k]}"/>` + text(x + 24, 85, k, { size: 12 });
  });
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const total = KINDS.reduce((s, k) => s + r.who[k], 0);
    body += text(left - 12, y + 18, r.id, { size: 13, anchor: "end" });
    if (total === 0) {
      body += text(left, y + 18, "no rug in any game", { size: 12 });
      return;
    }
    let x = left;
    KINDS.forEach((k) => {
      const w = (r.who[k] / total) * plotW;
      if (w > 0) {
        body += `<rect x="${x.toFixed(1)}" y="${y + 4}" width="${Math.max(0, w - 2).toFixed(1)}" height="22" rx="2" fill="${KIND_COLOR[k]}"/>`;
        if (w > 52) body += text(x + w / 2, y + 20, `${Math.round((100 * r.who[k]) / total)}%`, { size: 11, anchor: "middle", fill: k === "retail" || k === "sniper" ? C.cream : C.brown });
      }
      x += w;
    });
  });
  return svgDoc(width, top + rows.length * rowH + 20, body);
}

export function renderAllCharts(report: Report): void {
  save("supply-over-time", supplyChart(report.scenarios));
  save("viable-band", viableChart(report));
  save("tornado", tornadoChart(report));
  save("retail-vs-control", retailChart(report.scenarios));
  save("who-rugs", whoChart(report.scenarios));
}
