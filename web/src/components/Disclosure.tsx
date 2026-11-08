import { useEffect, useState } from 'react';
import { useChain } from '../hooks/context';
import { Link } from './common';

export interface ScenarioSeries {
  days: number[]; median: number[]; p10: number[]; p90: number[]; control_a_median: number[];
  representative: { seed: number; supply: number[]; rug_ticks: number[] };
  rug_density: number[];
  table: { no_rug_pct: number; median_rugs: number; d10: number; d30: number; d60: number; burned: number };
}

/** Shape of web/public/sim/summary.json, written by sim/src/results.ts. */
export interface SimSummary {
  notice?: string;
  selected?: { tau_pct: number; fee_pct: number; a_near: number; pot_min_near: number; tau_over_f: number };
  band?: { tau_over_f_low: number; tau_over_f_high: number };
  limits?: { no_bot_no_rug_pct: number; whale_rug_share_pct: number; whale_w_pct: number; assumptions_changing_band?: string[] };
  scenarios?: Record<string, ScenarioSeries>;
}

let summaryPromise: Promise<SimSummary | null> | null = null;
export function loadSummary(): Promise<SimSummary | null> {
  summaryPromise ??= fetch('./sim/summary.json')
    .then((r) => (r.ok ? (r.json() as Promise<SimSummary>) : null))
    .catch(() => null);
  return summaryPromise;
}

export function useSummary(): SimSummary | null {
  const [s, setS] = useState<SimSummary | null>(null);
  useEffect(() => {
    void loadSummary().then(setS);
  }, []);
  return s;
}

function shown(v: number | undefined): string {
  return v === undefined ? '…' : String(Math.round(v));
}

export function Disclosure({ long }: { long?: boolean }) {
  const { params } = useChain();
  const s = useSummary();
  const fee = params ? params.fee_bps / 100 : 2;
  const d = s?.limits;
  const lines = [
    'Testnet only. These tokens have no value. No real money is involved.',
    'Anyone can take the pot, at any moment, including right after you buy.',
    `Every buy and sell pays ${fee}% into the pot. You lose that on a round trip.`,
    `Bots and whales will probably win. In our simulation, a ${shown(d?.whale_w_pct)}% holder took ${shown(d?.whale_rug_share_pct)}% of the rugs.`,
    `Without an attentive bot, about ${shown(d?.no_bot_no_rug_pct)}% of simulated games saw no rug at all.`,
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
