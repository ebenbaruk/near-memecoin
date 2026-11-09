import { useSummaryState, type ScenarioSeries, type SimSummary } from '../../components/Disclosure';
import { Pic } from '../art';
import { Explain, Src, useIsPhone } from '../ui';

const NAME: Record<string, string> = {
  organic: 'Organic crowd', 'no-bot': 'No attentive bot', whale: 'One whale', wash: 'Wash trader', sybil: 'Fake accounts', 'panic-early': 'Early panic', 'panic-after': 'Late panic', hype: 'Hype wave', dead: 'Dead coin', tiny: 'Tiny trading (2% of base)', 'all-in': 'Everyone at once',
};
const WHO: Record<string, [string, string]> = { retail: ['Ordinary traders', 'var(--cobalt)'], sniper: ['A bot watching the pot', 'var(--rust)'], whale: ['Someone holding 25% of the coins', 'var(--mustard)'], wash: ['Wash trader', 'var(--pink)'], sybil: ['Fake accounts', 'var(--teal)'] };

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`);

function Spark({ data }: { data: ScenarioSeries }) {
  const W = 300, H = 110;
  const yMax = Math.max(...data.p90, ...data.control_a_median, 1);
  const X = (d: number) => (d / 60) * W;
  const Y = (v: number) => H - 4 - (v / yMax) * (H - 10);
  const line = (a: number[]) => a.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const band = `${line(data.p90)} ${[...data.p10].reverse().map((v, i) => `${X(60 - i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}`;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Median supply from ${Math.round(data.median[0])} to ${Math.round(data.median[60])} over 60 days, top of chart ${compact(yMax)} coins.`}>
        <polygon points={band} fill="var(--mustard)" opacity={0.75} />
        <polyline points={line(data.control_a_median)} fill="none" stroke="var(--cobalt)" strokeWidth={2} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        <polyline points={line(data.median)} fill="none" stroke="var(--brown)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        {data.representative.rug_ticks.map((t) => <circle key={t} cx={X(t / 24)} cy={H - 7} r={3.4} fill="var(--rust)" />)}
      </svg>
      <p className="spark-axis" data-testid="spark-axis"><span>day 0</span><span>top of chart {compact(yMax)}</span><span>day 60</span></p>
    </>
  );
}

function ViableGrid({ s }: { s: SimSummary }) {
  const a = String(s.params.a);
  const cells = s.viability.filter((v) => v.aYocto === a);
  const taus = [...new Set(cells.map((v) => v.tauPct))].sort((x, y) => x - y);
  const fees = [...new Set(cells.map((v) => v.feePct))].sort((x, y) => x - y);
  const cls = (t: number, f: number) => {
    if (t === s.selected.tau_pct && f === s.selected.fee_pct) return 'g-sel';
    const c = cells.find((v) => v.tauPct === t && v.feePct === f);
    if (!c) return '';
    // The published grid: a cell that passes the first screen but fails the second one rugs too easily.
    const st = c.viableStep2 ? 'viable' : c.status === 'viable' ? 'degenerate' : c.status;
    return `g-${st}`;
  };
  return (
    <div className="sim-gridwrap" data-testid="sim-viable">
      <h3>Why 5% and 2%</h3>
      <p className="sim-grid-text">Each square is one pair: burn share (up) and fee (across), at the curve of <code>anyonecanrug.testnet</code>. <code>tau/f</code> is just <b>burn share divided by fee</b>. Every pair where the game keeps working has a ratio between <b>{s.band.tau_over_f_low} and {s.band.tau_over_f_high}</b>; not every square in that range does. We shipped <b>{s.selected.tau_over_f}</b>.</p>
      <div className="vgrid" style={{ gridTemplateColumns: `3.4em repeat(${fees.length}, 1fr)` }}>
        <span />
        {fees.map((f) => <span key={f} className="v-l">{f}%</span>)}
        {[...taus].reverse().map((t) => (
          <div className="v-row" key={t} style={{ display: 'contents' }}>
            <span className="v-l">{t}%</span>
            {fees.map((f) => <i key={f} className={cls(t, f)} title={`burn ${t}%, fee ${f}%`} />)}
          </div>
        ))}
      </div>
      <p className="vlegend"><span><i className="g-viable" />The game keeps working</span><span><i className="g-never" />Never rugged</span><span><i className="g-degenerate" />Rugged too easily</span><span><i className="g-sel" />Shipped</span></p>
    </div>
  );
}

function Card({ id, s }: { id: string; s: SimSummary }) {
  const sc = s.scenarios[id];
  const tot = Object.values(sc.who).reduce((a, b) => a + b, 0) || 1;
  return (
    <article id={id === 'sybil' ? 'sim-sybil-card' : undefined}>
      <h4>{NAME[id]}</h4>
      <Spark data={sc} />
      <div className="who" aria-hidden="true">{Object.entries(sc.who).filter(([, v]) => v > 0).map(([k, v]) => <i key={k} style={{ width: `${(v / tot) * 100}%`, background: WHO[k][1] }} />)}</div>
      <p>Rugged in {100 - sc.table.no_rug_pct}% of games · median {sc.table.median_rugs} rugs</p>
      {id === 'sybil' ? <p className="sim-sybil" data-testid="sim-sybil">Fake accounts took {sc.who.sybil} of {tot} rugs. That is the pool acting as one big player. The coins to burn are the same as for one account, so splitting saved nothing.</p> : null}
    </article>
  );
}

export function Simulation() {
  const { summary: s, failed } = useSummaryState();
  const phone = useIsPhone();
  const ids = s ? Object.keys(NAME).filter((k) => s.scenarios[k]) : [];
  const first: string[] = ids.filter((id) => id === 'organic' || id === 'no-bot');
  return (
    <section id="sim" className="sec sec-sim" data-shot="sim">
      <h2 className="giant">We tested it. It's not flattering.</h2>
      <p className="sim-lead">60 days of a simulated crowd, run before the parameters were chosen.</p>
      <Pic n="sim-loom" className="sim-loom" sizes="100vw" alt="A robot works a loom, weaving a long strip, while the rug mascot reads the end of it." />
      <Src kind="sim">Modelled agents, behaviour we assumed. It compares parameter choices. Not a forecast, and it implies nothing about anyone's gains.</Src>
      <p className="sim-which">The parameters it picked run on <code>anyonecanrug.testnet</code>.</p>
      {s ? (
        <>
          <div className="sim-hits" data-testid="sim-hits">
            <p><b>{Math.round(s.limits.no_bot_no_rug_pct)}%</b> <span>of games with no attentive bot saw <strong>no rug at all</strong>.</span></p>
            <p><b>{Math.round(s.limits.whale_rug_share_pct)}%</b> <span>of rugs went to <strong>someone holding {Math.round(s.limits.whale_w_pct)}% of the coins</strong>, when one was in the game.</span></p>
            <p><b>{s.band.tau_over_f_low} to {s.band.tau_over_f_high}</b> <span>is the range of burn share divided by fee where the game keeps working. Chosen: <strong>{s.selected.tau_pct}% and {s.selected.fee_pct}%</strong>.</span></p>
          </div>
          <p className="sim-why" data-testid="sim-why">Without a bot watching, nobody notices the moment and the pot just sits there. With a bot or a big holder at normal volume, they took 91 to 99% of the rugs. With very little trading the bot matters less: 74% on a dead coin, 27% at 2% of base volume.</p>
          <h3 className="sim-all">All 11 scenarios: supply over 60 days, and who took the rugs</h3>
          <p className="sims-key">
            <span>Solid line: median supply. Dashed: the same coin with no rug. Mustard band: 8 runs in 10 fall inside the band. Dots: rugs in one run. Each chart has its own scale.</span>
            <span className="sim-who-key"><b>Who took the rugs:</b> {Object.values(WHO).map(([n, c]) => <span key={n}><i style={{ background: c }} />{n}</span>)}</span>
          </p>
          <div className="sim-multi" data-testid="sim-multi">
            {(phone ? first : ids).map((id) => <Card key={id} id={id} s={s} />)}
            {phone ? (
              <details className="sim-more">
                <summary>Show all 11</summary>
                <div className="sim-rest">
                  {ids.filter((id) => !first.includes(id)).map((id) => <Card key={id} id={id} s={s} />)}
                </div>
              </details>
            ) : null}
          </div>
          <Explain phone={phone} label="Why 5% and 2%: the grid"><ViableGrid s={s} /></Explain>
          <p className="sim-reprod">Reproduce: <code>npm run sim -- --quick</code> (seconds), or the README for the full 142-minute run. Rules are integer-exact and replayed against the contract with 523 shared test vectors.</p>
        </>
      ) : <p className="round-empty" data-testid="sim-state">{failed ? 'Simulation results unavailable. See the README.' : 'Reading the simulation…'}</p>}
    </section>
  );
}
