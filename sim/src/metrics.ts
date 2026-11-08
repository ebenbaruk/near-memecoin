// Aggregation of run summaries. Floats only: nothing here feeds back into the rules.
import { fork } from "./rng.ts";
import type { RunSummary } from "./types.ts";

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
export const median = (v: number[]): number => quantile(v, 0.5);
export const p10 = (v: number[]): number => quantile(v, 0.1);
export const p90 = (v: number[]): number => quantile(v, 0.9);

/** Percentile bootstrap confidence interval for the median. */
export function bootstrapMedianCI(values: number[], seedName: string, B = 2000, alpha = 0.05): [number, number] {
  if (values.length === 0) return [NaN, NaN];
  const rng = fork(1, `bootstrap.${seedName}`);
  const meds: number[] = [];
  for (let b = 0; b < B; b++) {
    const sample: number[] = [];
    for (let i = 0; i < values.length; i++) sample.push(values[Math.floor(rng.next() * values.length)]);
    meds.push(median(sample));
  }
  return [quantile(meds, alpha / 2), quantile(meds, 1 - alpha / 2)];
}

/** Medians with no-rug games counted at day 60, as the viability table requires. */
export function firstRugDays(runs: RunSummary[]): number[] {
  return runs.map((r) => r.firstRugDay ?? 60);
}

export function noRugShare(runs: RunSummary[]): number {
  return runs.filter((r) => r.nRugs === 0).length / runs.length;
}
export const medianRugs = (runs: RunSummary[]): number => median(runs.map((r) => r.nRugs));

export const hasViolation = (runs: RunSummary[]): boolean => runs.some((r) => r.violations.length > 0);

/** Paired retail return difference, in points of invested capital, by seed. */
export function pairedRetailGap(rug: RunSummary[], control: RunSummary[]): number[] {
  const bySeed = new Map(control.map((r) => [r.seed, r]));
  return rug.flatMap((r) => {
    const c = bySeed.get(r.seed);
    return c ? [r.retailReturnPct - c.retailReturnPct] : [];
  });
}

/** Paired relative difference of final supply, percent. */
export function pairedSupplyGap(rug: RunSummary[], control: RunSummary[]): number[] {
  const bySeed = new Map(control.map((r) => [r.seed, r]));
  return rug.flatMap((r) => {
    const c = bySeed.get(r.seed);
    if (!c) return [];
    const a = r.supplyDaily[60];
    const b = c.supplyDaily[60];
    return b > 0 ? [100 * (a / b - 1)] : [];
  });
}

export function rugIntervals(runs: RunSummary[]): number[] {
  return runs.flatMap((r) => r.rugs.slice(1).map((e, i) => (e.tick - r.rugs[i].tick) / 24));
}

export function spearman(xs: number[], ys: number[]): number {
  const rank = (v: number[]): number[] => {
    const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b]);
    const r = new Array<number>(v.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
      for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}
