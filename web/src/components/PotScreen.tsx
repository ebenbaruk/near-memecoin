import type { ReactNode } from 'react';
import { B, fmtNear, fmtNearFixed, shortAccount } from '../format/near';
import { zoneOf } from '../chain/store';
import { useArtSettled } from '../theme/art';
import { useAccount, useChain, useDesktop } from '../hooks/context';
import { Art, BotsAsleep, Link, StateView } from './common';
import { AccountPanel } from './AccountPanel';
import type { SheetKind } from './ActionDock';
import { ActionDock } from './ActionDock';
import { Disclosure } from './Disclosure';
import { GameDesktop } from './GameDesktop';
import { Explainer, LastEvent, LoadingMessage, NextLine } from './GamePieces';
import { useBotsAwake } from './InstanceBanner';
import { Marquee } from './Marquee';
import { RugScene } from './RugScene';

type Open = (k: SheetKind, amount?: string) => void;

export function PotScreen({ sheetOpen, onOpen, panel, active }: { sheetOpen: boolean; onOpen: Open; panel: ReactNode; active: SheetKind }) {
  const desktop = useDesktop();
  return desktop ? <GameDesktop panel={panel} active={active} onOpen={onOpen} /> : <PotScreenPhone sheetOpen={sheetOpen} onOpen={onOpen} />;
}

function PotScreenPhone({ sheetOpen, onOpen }: { sheetOpen: boolean; onOpen: Open }) {
  const snap = useChain();
  const acct = useAccount();
  const awake = useBotsAwake();
  const { state, params, gapBuy, status, lastOkAt, journal } = snap;
  const lastKind = state && journal[state.journal_len - 1]?.kind;
  const artSettled = useArtSettled();
  return (
    <>
      <div className="fold">
        <Marquee />
        <header className="headline">
          <h1>
            <span>STEAL THIS POT.</span>
            <span className="headline-pot">{state ? fmtNearFixed(B(state.pot)) : '…'} NEAR.</span>
          </h1>
          {acct.id ? <p className="head-account" data-testid="next-account" title={acct.id}>{shortAccount(acct.id, 20)}<b>{acct.near === null ? '…' : `${fmtNear(acct.near, 2)} NEAR`}</b></p> : null}
          <p>{state && params && zoneOf(state, params, gapBuy) === 'locked' ? `Anyone can, from ${fmtNear(B(params.pot_min))} NEAR. This is the price.` : 'Anyone can. This is the price.'}</p>
        </header>
        {state && params && artSettled ? (
          <RugScene state={state} params={params} gap={gapBuy} lastOkAt={lastOkAt} gaze={lastKind === 'buy' ? 6 : lastKind === 'sell' ? -6 : 0} />
        ) : (
          <section className="scene skeleton" data-testid="gap-gauge" aria-busy="true">
            <LoadingMessage />
          </section>
        )}
        <LastEvent />
        <NextLine onOpen={onOpen} />
      </div>
      <div className="below-fold">
        <div className="section-fringe" aria-hidden="true" />
        <Explainer />
        {state ? <p className="round-line">Round <span data-testid="round-number">{state.round_id}</span> · {state.rugs_count} rug{state.rugs_count === 1 ? '' : 's'} so far</p> : null}
        {state && B(state.pot) === 0n && state.rugs_count > 0 ? <Art name="states/empty-round.webp" className="empty-round-art" alt="The Tapis is out of NEAR." /> : null}
        {status === 'live' && !awake ? <BotsAsleep /> : null}
        {status === 'frozen' ? <StateView art="states/rpc-down.webp" compact message="The chain isn't answering. Buy, Sell and Rug come back when it does." /> : null}
        {!sheetOpen ? <AccountPanel /> : null}
        <Link to="landing" className="inline-link how-link">New here? How the whole thing works</Link>
        <div className="sticker-row" aria-hidden="true">
          <Art name="stickers/flower-eye.webp" /><Art name="stickers/star.webp" /><Art name="stickers/sack.webp" /><Art name="stickers/key-crossed.webp" /><Art name="stickers/candle.webp" />
        </div>
        <Art name="decor/zigzag-strip.webp" className="zigzag" />
        <div className="brand-foot"><Art name="brand/wordmark.webp" alt="Anyone Can Rug" /></div>
        <Disclosure />
      </div>
      <ActionDock disabled={status === 'loading' || status === 'frozen' || status === 'missing'} onOpen={onOpen} />
    </>
  );
}
