import { useEffect, useState } from 'react';
import { useChain } from '../hooks/context';
import { Link } from './common';

export interface ScenarioSeries {
  days: number[]; median: number[]; p10: number[]; p90: number[]; control_a_median: number[];
  representative: { seed: number; supply: number[]; rug_ticks: number[] };
  /** Rugs per day, one value per day (60), against 61 daily supply points. */
  rug_density: number[];
  table: { no_rug_pct: number; median_rugs: number; d10: number; d30: number; d60: number; burned: number };
  who: Record<string, number>;
}

/** Shape of web/public/sim/summary.json, written by sim/src/results.ts. */
export interface SimSummary {
  notice: string;
  params: Record<string, unknown>;
  selected: { tau_pct: number; fee_pct: number; a_near: number; pot_min_near: number; tau_over_f: number; score: number };
  band: { tau_over_f_low: number; tau_over_f_high: number };
  viability: { tauPct: number; feePct: number; aYocto: string; status: string; viableStep2: boolean }[];
  limits: { no_bot_no_rug_pct: number; whale_rug_share_pct: number; whale_w_pct: number; assumptions_changing_band: string[] };
  scenarios: Record<string, ScenarioSeries>;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCurve = (v: unknown) => Array.isArray(v) && v.length === 61 && v.every(isNum);

/** A summary that doesn't match the simulator's output is not shown at all: no number beats a wrong one. */
export function isSimSummary(v: unknown): v is SimSummary {
  const s = v as SimSummary | null;
  if (!s?.limits || !s.band || !s.selected || !s.scenarios) return false;
  if (![s.limits.no_bot_no_rug_pct, s.limits.whale_rug_share_pct, s.limits.whale_w_pct, s.band.tau_over_f_low, s.band.tau_over_f_high, s.selected.tau_over_f].every(isNum)) return false;
  if (!Array.isArray(s.limits.assumptions_changing_band)) return false;
  const all = Object.values(s.scenarios);
  return all.length > 0 && all.every((c) => isCurve(c.median) && isCurve(c.p10) && isCurve(c.p90) && isCurve(c.control_a_median) && isCurve(c.representative?.supply) && Array.isArray(c.rug_density) && isNum(c.table?.d60));
}

let summaryPromise: Promise<SimSummary | null> | null = null;
export function loadSummary(): Promise<SimSummary | null> {
  summaryPromise ??= fetch('./sim/summary.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j: unknown) => (isSimSummary(j) ? j : null))
    .catch(() => null);
  return summaryPromise;
}

/** `failed`: the file did not load, or did not match the simulator's output. */
export function useSummaryState(): { summary: SimSummary | null; failed: boolean } {
  const [st, setSt] = useState<{ summary: SimSummary | null; failed: boolean }>({ summary: null, failed: false });
  useEffect(() => {
    void loadSummary().then((summary) => setSt({ summary, failed: summary === null }));
  }, []);
  return st;
}

export function useSummary(): SimSummary | null {
  return useSummaryState().summary;
}

export function Disclosure({ long }: { long?: boolean }) {
  const { params } = useChain();
  const d = useSummary()?.limits;
  // Figures come from the contract and from summary.json. Until they're here, the sentence goes without them.
  const lines = [
    'Testnet only. These tokens have no value. No real money is involved.',
    'Anyone can take the pot, at any moment, including right after you buy.',
    params ? `Every buy and sell pays ${params.fee_bps / 100}% into the pot. You lose that on a round trip.` : 'Every buy and sell pays a fee into the pot. You lose that on a round trip.',
    d ? `Bots and whales will probably win. In our simulation, a ${Math.round(d.whale_w_pct)}% holder took ${Math.round(d.whale_rug_share_pct)}% of the rugs.` : 'Bots and whales will probably win.',
    d ? `Without an attentive bot, about ${Math.round(d.no_bot_no_rug_pct)}% of simulated games saw no rug at all.` : 'Without an attentive bot, most simulated games saw no rug at all.',
    'Simulations use assumed behaviour. They are not a forecast.',
    'Unaudited hackathon code.',
  ];
  if (long) {
    return (
      <section className="disclosure long" data-testid="disclosure-long">
        <h3>The honest part</h3>
        <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>
    );
  }
  return (
    <section className="disclosure" data-testid="disclosure-short">
      <p>{lines[0]}</p>
      <p>{lines[1]}</p>
      <Link to="rules" className="inline-link">The rules, and every limit</Link>
    </section>
  );
}
