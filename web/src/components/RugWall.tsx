import type { RugRecord } from '../chain/types';
import { B, dateLabel, duration, fmtNear, fmtTokens } from '../format/near';
import { useChain } from '../hooks/context';
import { Art, BotBadge, ExplorerLink, StateView } from './common';
import { ShareButton } from './ShareButton';
import { WantedPoster } from './WantedPoster';

function RugCard({ rug, prevTs, featured }: { rug: RugRecord; prevTs: number | null; featured?: boolean }) {
  return (
    <article className={`rug-card${featured ? ' featured' : ''}`} data-testid="rug-card" data-round={rug.round_id}>
      <WantedPoster rug={rug} />
      <div className="rug-card-text">
        <p className="rug-card-line">
          <b className="rug-card-name">{rug.rugger}</b> <BotBadge account={rug.rugger} /> took <b>{fmtNear(B(rug.payout))} NEAR</b> by burning <b>{fmtTokens(B(rug.burned))}</b>
        </p>
        <p className="mono small">Round {rug.round_id} · {dateLabel(rug.ts_ms)}{prevTs !== null ? ` · lasted ${duration(rug.ts_ms - prevTs)}` : ''}</p>
        <div className="rug-card-actions">
          <ShareButton rug={rug} testId="rug-share" />
          <ExplorerLink block={rug.block} entry={{ kind: 'rug', account: rug.rugger, tokens: '0', near: '0', fee: '0', supply_after: '0', x_after: '0', pot_after: '0', ts_ms: rug.ts_ms, block: rug.block }} />
        </div>
      </div>
    </article>
  );
}

export function RugWall() {
  const { rugs, journal } = useChain();
  const genesis = journal[0]?.ts_ms ?? null;
  const prevOf = (i: number) => (i > 0 ? rugs[i - 1].ts_ms : genesis);
  const indexed = rugs.map((r, i) => ({ r, i }));
  const biggest = indexed.reduce<{ r: RugRecord; i: number } | null>((b, c) => (!b || B(c.r.pot_before) > B(b.r.pot_before) ? c : b), null);
  const rest = indexed.filter((c) => c.i !== biggest?.i).reverse();
  const stolen = rugs.reduce((sum, r) => sum + B(r.payout), 0n);
  return (
    <main className="page wall" data-testid="rug-wall">
      <h1 className="page-title">Rug Wall</h1>
      <p className="page-lead">Everyone who ever stole the pot, forever.</p>
      {rugs.length ? (
        <dl className="wall-stats">
          <div><dt>Rugs</dt><dd>{rugs.length}</dd></div>
          <div><dt>Stolen, in total</dt><dd>{fmtNear(stolen)} <small>NEAR</small></dd></div>
        </dl>
      ) : null}
      <Art name="thieves/silhouette-sack.webp" className="wall-thief" alt="" />
      {biggest ? (
        <section data-testid="biggest-heist" className="biggest">
          <h2 className="ribbon-img"><Art name="wanted/ribbon-biggest-heist.webp" alt="Biggest heist" eager /></h2>
          <RugCard rug={biggest.r} prevTs={prevOf(biggest.i)} featured />
        </section>
      ) : (
        <div data-testid="rug-wall-empty"><StateView art="states/empty-wall.webp" message="Nobody has rugged yet. The price is printed. It's right there." /></div>
      )}
      {rest.length ? <div className="wall-grid">{rest.map(({ r, i }) => <RugCard key={r.round_id} rug={r} prevTs={prevOf(i)} />)}</div> : null}
      <p className="fine-print">No gain is shown: the contract never knows what these tokens cost their owner.</p>
    </main>
  );
}
