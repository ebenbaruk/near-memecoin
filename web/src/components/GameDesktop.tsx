import type { ReactNode } from 'react';
import { rugPriceOf, zoneOf } from '../chain/store';
import { B, ago, fmtNear, fmtNearFixed, fmtNearSignedFixed, fmtTokens, shortAccount, shownTake, thiefName } from '../format/near';
import { useChain, useNow } from '../hooks/context';
import { useArtSettled } from '../theme/art';
import type { SheetKind } from './ActionDock';
import { ActionDock } from './ActionDock';
import { BotBadge, Link } from './common';
import { Disclosure } from './Disclosure';
import { Explainer, KIND_LABEL, LoadingMessage, NextLine } from './GamePieces';
import { useBotsAwake } from './InstanceBanner';
import { Marquee } from './Marquee';
import { RugScene, StaleBadge } from './RugScene';
import { tradeHint } from './TradeSheet';

function Rail() {
  const { state, params, gapBuy, lastOkAt } = useChain();
  if (!state || !params) return <aside className="rail" data-testid="rail" aria-busy="true" />;
  const price = rugPriceOf(gapBuy, params);
  const pot = B(state.pot);
  const take = price === null ? null : shownTake(pot, price);
  const fee = fmtNear(B(params.rug_fee));
  return (
    <aside className="rail" data-testid="rail" aria-label="What taking the pot costs right now">
      <dl className="sum" data-testid="the-sum">
        <div className="sum-row">
          <dt>The pot</dt>
          <dd><span data-testid="pot-value">{fmtNearFixed(pot)}</span> <small>NEAR</small></dd>
          <dd className="sum-note">Under the rug. Every trade adds to it.</dd>
        </div>
        <div className="sum-row">
          <dt>− the rug price</dt>
          <dd><span>{price !== null ? fmtNearFixed(price) : '…'}</span> <small>NEAR</small></dd>
          <dd className="sum-note">What taking it costs right now, the {fee} NEAR fee included.</dd>
        </div>
        <div className="sum-row sum-total" data-zone-take={take !== null && take >= 0n ? 'pos' : 'neg'}>
          <dt>= the take</dt>
          <dd><span data-testid="gap-value">{take !== null ? fmtNearSignedFixed(take) : '…'}</span> <small>NEAR</small></dd>
          <dd className="sum-note">{take !== null && take >= 0n ? 'Positive: taking it pays. Whoever moves first keeps the difference.' : 'Negative: taking it costs more than it pays.'} The contract calls this the gap. <StaleBadge lastOkAt={lastOkAt} /></dd>
        </div>
      </dl>
      <h2 className="rail-title">How it works</h2>
      <Explainer />
    </aside>
  );
}

function LiveLog() {
  const { journal, state, status } = useChain();
  const awake = useBotsAwake();
  const now = useNow();
  const len = state?.journal_len ?? 0;
  const rows: { index: number; e: NonNullable<(typeof journal)[number]> }[] = [];
  for (let i = len - 1; i >= 0 && rows.length < 30; i--) {
    const e = journal[i];
    if (e) rows.push({ index: i, e });
  }
  return (
    <section className="livelog" data-testid="live-log" aria-label="Live log">
      <header className="livelog-head">
        <h2>Live log</h2>
        <Link to="log" className="livelog-all" testId="live-log-all">Every mint and burn</Link>
      </header>
      {status === 'live' && !awake ? <p className="livelog-asleep">Demo bots are asleep. You can still rug it.</p> : null}
      {rows.length === 0 ? (
        <p className="livelog-empty">{state ? 'No mints or burns yet. Be the first line.' : 'Reading the chain…'}</p>
      ) : (
        <ol className="livelog-rows">
          {rows.map(({ index, e }) => (
            <li key={index} className="livelog-row" data-testid="live-log-row" data-kind={e.kind}>
              <b className={`kind-${e.kind}`}>{KIND_LABEL[e.kind]}</b>
              <span className="livelog-who" title={e.account}><span className="livelog-name">{shortAccount(thiefName(e.account), 14)}</span> <BotBadge account={e.account} /></span>
              <span className="livelog-amt">{e.kind === 'rug' ? `${fmtNear(B(e.near))} NEAR` : `${fmtNear(B(e.near))} NEAR · ${fmtTokens(B(e.tokens))}`}</span>
              <span className="livelog-age">{ago(e.ts_ms, now)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function GameDesktop({ panel, active, onOpen }: { panel: ReactNode; active: SheetKind; onOpen: (k: SheetKind, amount?: string) => void }) {
  const { state, params, gapBuy, status, lastOkAt, journal } = useChain();
  const artSettled = useArtSettled();
  const lastKind = state && journal[state.journal_len - 1]?.kind;
  const zone = state && params ? zoneOf(state, params, gapBuy) : 'cold';
  const price = rugPriceOf(gapBuy, params);
  const takeBadge = state && price !== null && zone === 'live' ? fmtNearSignedFixed(shownTake(B(state.pot), price)) : undefined;
  const hint = active === 'rug' ? null : tradeHint(active, params);
  return (
    <>
      <Marquee />
      <div className="desk" data-zone={zone}>
        <section className="stage">
          <header className="headline desk-head">
            <h1>
              <span>STEAL THIS POT.</span>
              <span className="headline-pot">{state ? fmtNearFixed(B(state.pot)) : '…'} NEAR.</span>
            </h1>
            <p>
              {zone === 'locked' && params ? `Anyone can, from ${fmtNear(B(params.pot_min))} NEAR. This is the price.` : 'Anyone can. This is the price.'}
              {state ? <span className="desk-round">Round <span data-testid="round-number">{state.round_id}</span> · {state.rugs_count} rug{state.rugs_count === 1 ? '' : 's'} so far</span> : null}
            </p>
          </header>
          <div className="stage-row">
            <div className="stage-gauge">
              {state && params && artSettled ? (
                <RugScene state={state} params={params} gap={gapBuy} lastOkAt={lastOkAt} gaze={lastKind === 'buy' ? 6 : lastKind === 'sell' ? -6 : 0} desktop />
              ) : (
                <section className="scene skeleton" data-testid="gap-gauge" aria-busy="true"><LoadingMessage /></section>
              )}
            </div>
            <Rail />
          </div>
          <footer className="statusbar">
            <Disclosure />
            <Link to="landing" className="inline-link statusbar-how">New here? How it works</Link>
          </footer>
        </section>
        <aside className="console" aria-label="Trade or take the pot">
          <NextLine onOpen={onOpen} />
          <ActionDock disabled={status === 'loading' || status === 'frozen' || status === 'missing'} onOpen={onOpen} active={active} live={zone === 'live'} badge={takeBadge} />
          {hint ? <p className="console-hint">{hint}</p> : null}
          <div className="console-body">{panel}</div>
          <LiveLog />
        </aside>
      </div>
    </>
  );
}
