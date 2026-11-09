import { B, ago, fmtNear, fmtNearFixed, fmtNearSignedFixed, fmtTokens, shortAccount, shownTake } from '../../format/near';
import { useApp, useNow, useTryIt } from '../../hooks/context';
import { HREF } from '../../hooks/useHashRoute';
import { BotBadge, ExplorerLink } from '../../components/common';
import { KIND_LABEL } from '../../components/GamePieces';
import { mugshotBackdrop, mugshotPath } from '../../components/Mugshot';
import { artUrl } from '../../theme/art';
import { Pic } from '../art';
import { loadedJournal, thiefName, useLive } from '../data';
import { useIsPhone } from '../ui';

export function LiveFeed() {
  const live = useLive();
  const { info, instances, instanceKey } = useApp();
  const now = useNow(5000);
  const tryIt = useTryIt();
  const { state, snap, rugs, lastRug, ready, pot, rugPrice, gapBuy, status } = live;
  const phone = useIsPhone();
  const entries = loadedJournal(snap.journal).slice(phone ? -5 : -10).reverse();
  const wall = [...rugs].reverse().slice(0, 4);
  const other = Object.keys(instances.instances).find((k) => k !== instanceKey);
  const take = ready ? shownTake(pot, rugPrice) : 0n;
  return (
    <section id="live" className="sec sec-live" data-shot="live">
      <div className="live-head">
      <p className="eyebrow">{status === 'frozen' ? 'Last known state, frozen copy' : 'Live on testnet, right now'}</p>
      <h2 className="giant">{status === 'frozen' ? 'Last we saw.' : 'As of now.'}</h2>
      <p className="live-state">
        {status === 'frozen' ? 'Chain unreachable. Frozen copy.' : status === 'loading' ? 'Reading the chain…' : <>Reading <code>{info.contractId}</code> from your browser. No backend.</>}
        {other ? <a href={`?i=${other}#/`}>{other === 'live' ? ' Show the main contract' : ' Show the fast contract'}</a> : null}
      </p>
      <Pic n="lookout" className="live-lookout pop" sizes="(min-width: 1100px) 36vw, 70vw" alt="A burglar with binoculars and a robot pointing out something right, both watching." />
      </div>

      {state ? (
        <dl className="live-nums" data-testid="live-nums">
          <div><dt>Round</dt><dd>{state.round_id}</dd></div>
          <div><dt>The pot</dt><dd data-testid="live-pot">{fmtNearFixed(pot)}</dd></div>
          <div><dt>Rug price, fee in</dt><dd data-testid="live-rugprice">{ready ? fmtNearFixed(rugPrice) : '…'}</dd></div>
          <div className="hot"><dt>The take</dt><dd data-testid="live-take">{ready ? fmtNearSignedFixed(take) : '…'}</dd></div>
          <div><dt>Coins to burn, buying them first</dt><dd>{gapBuy ? fmtTokens(B(gapBuy.t_required)) : '…'}</dd></div>
          <div><dt>Coins to burn, if you already hold them</dt><dd>{fmtTokens(B(state.t_required))}</dd></div>
          <div><dt>Coins in existence</dt><dd>{fmtTokens(B(state.supply))}</dd></div>
        </dl>
      ) : null}

      <div className="live-grid">
        <div className="live-wall">
          <h3>Who rugged last</h3>
          {lastRug ? (
            <div className="wall-last" data-testid="live-last-rug">
              <div className="l-mug" style={{ background: mugshotBackdrop(lastRug.rugger) }}><img src={artUrl(mugshotPath(lastRug.rugger)) ?? ''} alt="A masked thief, the same face for this account every time" /></div>
              <div>
                <p className="wall-name" title={lastRug.rugger}>{shortAccount(thiefName(lastRug.rugger), 20)} <BotBadge account={lastRug.rugger} /></p>
                <p className="wall-amt">took {fmtNear(B(lastRug.payout))} NEAR</p>
                <p className="wall-when">round {lastRug.round_id} · {ago(lastRug.ts_ms, now)} ago</p>
              </div>
            </div>
          ) : (
            <div className="wall-empty" data-testid="live-no-rugs">
              <Pic n="empty-round" sizes="(min-width: 1100px) 34vw, 86vw" alt="A burglar peers into an empty sack, the rug mascot shrugs." />
              <p>{status === 'loading' ? 'Reading the Wall…' : 'Nobody has taken a pot yet. Round 1 is open.'}</p>
            </div>
          )}
          {wall.length > 1 ? (
            <ul className="wall-more">
              {wall.slice(1).map((r) => <li key={r.round_id} data-testid="wall-more-row"><b>Round {r.round_id}</b> <span title={r.rugger}>{shortAccount(thiefName(r.rugger), 14)}</span> <BotBadge account={r.rugger} /> <em>{fmtNear(B(r.payout))}</em></li>)}
            </ul>
          ) : null}
          <div className="live-actions">
            <a href={HREF.wall} data-testid="live-wall-link">Wall of Rugs →</a>
            <button type="button" onClick={tryIt}>Try it, no wallet</button>
          </div>
        </div>

        <div className="live-log">
          <h3>Every mint and burn</h3>
          {entries.length ? (
            <ol className="lg" data-testid="live-log">
              {entries.map((e, i) => (
                <li key={`${e.block}-${i}`} className={`lg-${e.kind}`}>
                  <span className="lg-k">{KIND_LABEL[e.kind]}</span>
                  <span className="lg-acc" title={e.account}>{shortAccount(thiefName(e.account), 16)} <BotBadge account={e.account} /></span>
                  <span className="lg-near">{e.kind === 'rug' ? `${fmtNear(B(e.near))} NEAR` : `${fmtNear(B(e.near))} NEAR · ${fmtTokens(B(e.tokens))}`}</span>
                  <span className="lg-pot">pot {fmtNear(B(e.pot_after))}</span>
                  <ExplorerLink entry={e} block={e.block} />
                </li>
              ))}
            </ol>
          ) : <p className="wall-when">The journal is empty.</p>}
          <a className="live-full" href={HREF.log} data-testid="live-log-link">The whole log →</a>
        </div>
      </div>
    </section>
  );
}
