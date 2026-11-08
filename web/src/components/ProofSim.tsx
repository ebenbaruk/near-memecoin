import { useEffect, useMemo, useState } from 'react';
import { Art } from './common';
import { loadSummary, type ScenarioSeries, type SimSummary } from './Disclosure';

const TITLE: Record<string, string> = {
  organic: 'Organic crowd', 'no-bot': 'No attentive bot', whale: 'One whale', wash: 'Wash trader', sybil: 'Sybil swarm', 'panic-early': 'Early panic', 'panic-after': 'Late panic', hype: 'Hype wave', dead: 'Dead coin', tiny: 'Tiny pot', 'all-in': 'Whale, wash and sybil',
};

const W = 340;
const H = 156;
const PAD = { l: 42, r: 8, t: 8, b: 30 };

function fmtSupply(v: number): string {
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));
}

function SmallMultiple({ id, data, children }: { id: string; data: ScenarioSeries; children?: React.ReactNode }) {
  const [day, setDay] = useState<number | null>(null);
  const max = Math.max(...data.p90, ...data.control_a_median, ...data.representative.supply, 1);
  const X = (d: number) => PAD.l + (d / 60) * (W - PAD.l - PAD.r);
  const Y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const line = (a: number[]) => a.map((v, d) => `${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const band = `${line(data.p90)} ${[...data.p10].reverse().map((v, i) => `${X(60 - i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}`;
  const densityMax = Math.max(...data.rug_density, 1);
  const shown = day ?? 60;
  const readDay = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const d = Math.round(((e.clientX - r.left) / r.width * W - PAD.l) / ((W - PAD.l - PAD.r) / 60));
    setDay(Math.max(0, Math.min(60, d)));
  };
  const descr = `${TITLE[id] ?? id}: median supply goes from ${fmtSupply(data.median[0])} to ${fmtSupply(data.median[60])} over 60 days, with ${data.table.median_rugs} rugs in the median run.`;
  return (
    <article className="sim-scenario" data-testid="sim-scenario" data-scenario={id}>
      <h3>{TITLE[id] ?? id}</h3>
      <svg
        className="sim-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={descr}
        data-testid="sim-supply-chart"
        onPointerDown={readDay}
        onPointerMove={readDay}
        onPointerLeave={() => setDay(null)}
      >
        <line x1={PAD.l} x2={W - PAD.r} y1={Y(max)} y2={Y(max)} className="sim-grid" />
        <line x1={PAD.l} x2={W - PAD.r} y1={Y(max / 2)} y2={Y(max / 2)} className="sim-grid" />
        <text x={PAD.l - 4} y={Y(max) + 4} className="sim-tick" textAnchor="end">{fmtSupply(max)}</text>
        <text x={PAD.l - 4} y={Y(max / 2) + 4} className="sim-tick" textAnchor="end">{fmtSupply(max / 2)}</text>
        <text x={PAD.l - 4} y={Y(0) + 4} className="sim-tick" textAnchor="end">0</text>
        <polygon points={band} className="sim-band" />
        <polyline points={line(data.control_a_median)} className="sim-control" />
        <polyline points={line(data.representative.supply)} className="sim-repr" />
        <polyline points={line(data.median)} className="sim-median" />
        {data.representative.rug_ticks.map((t) => <line key={t} x1={X(t / 24)} x2={X(t / 24)} y1={PAD.t} y2={H - PAD.b} className="sim-rug" />)}
        {data.rug_density.map((v, d) => (v > 0 ? <rect key={d} x={X(d)} y={H - PAD.b + 3} width={(W - PAD.l - PAD.r) / 60 + 0.5} height={6} className="sim-density" opacity={0.2 + (0.8 * v) / densityMax} /> : null))}
        {day !== null ? <line x1={X(day)} x2={X(day)} y1={PAD.t} y2={H - PAD.b} className="sim-cross" /> : null}
        <text x={PAD.l} y={H - 4} className="sim-tick">Day 0</text>
        <text x={X(30)} y={H - 4} className="sim-tick" textAnchor="middle">Day 30</text>
        <text x={W - PAD.r} y={H - 4} className="sim-tick" textAnchor="end">Day 60</text>
      </svg>
      <p className="sim-readout">Day {shown}: median {fmtSupply(data.median[shown])} · p10 {fmtSupply(data.p10[shown])} to p90 {fmtSupply(data.p90[shown])}</p>
      {children}
    </article>
  );
}

function Band({ s }: { s: SimSummary }) {
  const SCALE = Math.ceil(Math.max(s.band.tau_over_f_high, s.selected.tau_over_f) * 1.1);
  const pct = (v: number) => `${(v / SCALE) * 100}%`;
  return (
    <section>
      <h2>Viable zone</h2>
      <p>The rug price over the fee, τ/f. Below the zone the pot goes instantly; above it, nobody ever steals it.</p>
      <div className="sim-band-bar" role="img" aria-label={`Viable tau over f from ${s.band.tau_over_f_low} to ${s.band.tau_over_f_high}; chosen ${s.selected.tau_over_f}`}>
        <div className="sim-band-fill" style={{ left: pct(s.band.tau_over_f_low), width: pct(s.band.tau_over_f_high - s.band.tau_over_f_low) }} />
        <div className="sim-band-mark" style={{ left: pct(s.selected.tau_over_f) }} />
      </div>
      <p className="mono small">Viable τ/f: {s.band.tau_over_f_low} to {s.band.tau_over_f_high}. Chosen: {s.selected.tau_over_f} (τ {s.selected.tau_pct}%, fee {s.selected.fee_pct}%).</p>
    </section>
  );
}

export function ProofSim() {
  const [s, setS] = useState<SimSummary | null | 'loading'>('loading');
  useEffect(() => {
    void loadSummary().then(setS);
  }, []);
  const ids = useMemo(() => {
    if (!s || s === 'loading') return [];
    const order = Object.keys(TITLE);
    return Object.keys(s.scenarios).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [s]);
  return (
    <main className="page proof">
      <h1 className="page-title">Simulation</h1>
      <Art name="screens/sim.webp" className="page-art" eager />
      <p className="sim-banner" data-testid="sim-assumption-banner">Assumed behaviour. Not a forecast.</p>
      {s === 'loading' ? <p className="mono">Loading the simulation…</p> : null}
      {!s ? (s === null ? <p className="notice">The simulation summary isn't published yet.</p> : null) : s === 'loading' ? null : (
        <>
          <section className="sim-limits" data-testid="sim-limits">
            <h2>What it cannot promise</h2>
            <ul>
              <li><b>{Math.round(s.limits.no_bot_no_rug_pct)}%</b> of games without an attentive bot saw no rug at all.</li>
              <li>A <b>{Math.round(s.limits.whale_w_pct)}%</b> holder took <b>{Math.round(s.limits.whale_rug_share_pct)}%</b> of the rugs.</li>
              {s.limits.assumptions_changing_band.length ? <li>Assumptions that move the viable zone: {s.limits.assumptions_changing_band.join(', ')}.</li> : null}
            </ul>
          </section>
          <Band s={s} />
          <section className="sim-legend mono small">
            <span><i className="k-med" />Median supply</span><span><i className="k-band" />p10 to p90</span><span><i className="k-ctl" />No rug, for comparison</span><span><i className="k-rug" />Rugs</span>
          </section>
          <section className="sim-multiples">
            {ids.map((id) => <SmallMultiple key={id} id={id} data={s.scenarios[id]} />)}
          </section>
          <section>
            <h2>60 days, every scenario</h2>
            <div className="table-wrap">
              <table className="param-table sim-table">
                <thead><tr><th>Scenario</th><th>No rug</th><th>Rugs</th><th>Day 10</th><th>Day 30</th><th>Day 60</th><th>Burned</th></tr></thead>
                <tbody>
                  {ids.map((id) => {
                    const t = s.scenarios[id].table;
                    return <tr key={id}><th scope="row">{TITLE[id] ?? id}</th><td>{t.no_rug_pct}%</td><td>{t.median_rugs}</td><td>{fmtSupply(t.d10)}</td><td>{fmtSupply(t.d30)}</td><td>{fmtSupply(t.d60)}</td><td>{fmtSupply(t.burned)}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
