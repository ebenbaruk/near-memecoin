import { useState } from 'react';
import { topHolder } from '../chain/journal';
import type { Gap } from '../chain/types';
import { B, ago, fmtNear, fmtNearFixed, fmtNearSigned, fmtTokens, shortAccount } from '../format/near';
import * as v from '../chain/views';
import { useAccount, useApp, useChain, useNow } from '../hooks/context';
import { Art, BotBadge, BotsAsleep, StateView } from './common';
import { AccountPanel } from './AccountPanel';
import type { SheetKind } from './ActionDock';
import { ActionDock } from './ActionDock';
import { Disclosure } from './Disclosure';
import { useBotsAwake } from './InstanceBanner';
import { Marquee } from './Marquee';
import { RugScene } from './RugScene';

const KIND = { buy: 'MINT', sell: 'BURN', rug: 'RUG', payout_failed: 'FAILED' } as const;

function LastEvent() {
  const { journal, state } = useChain();
  const now = useNow();
  const i = (state?.journal_len ?? 0) - 1;
  const e = i >= 0 ? journal[i] : undefined;
  return (
    <div className="last-event" data-testid="last-event">
      {e ? (
        <>
          <b className={`kind-${e.kind}`}>{KIND[e.kind]}</b> {shortAccount(e.account, 20)} <BotBadge account={e.account} />
          <span className="le-amount">{fmtNear(B(e.near))} NEAR</span> <span className="le-age">{ago(e.ts_ms, now)}</span>
        </>
      ) : 'No mints or burns yet.'}
    </div>
  );
}

function GapDetails() {
  const { chain } = useApp();
  const snap = useChain();
  const [whale, setWhale] = useState<{ account: string; gap: Gap } | 'none' | null>(null);
  const hold = snap.gapHolder;
  const onToggle = async (open: boolean) => {
    if (!open || whale) return;
    await chain.ensureAll();
    const entries = chain.getSnapshot().journal.filter((e): e is NonNullable<typeof e> => Boolean(e));
    const top = topHolder(entries);
    if (!top) return setWhale('none');
    setWhale({ account: top, gap: await v.getGapExit(chain.contractId, top) });
  };
  return (
    <details className="fold-out" data-testid="gap-details" onToggle={(e) => void onToggle(e.currentTarget.open)}>
      <summary>Details</summary>
      <dl className="receipt-list">
        <dt>If you hold</dt>
        <dd data-testid="gap-detail-hold">{hold ? (hold.feasible ? `${fmtNearSigned(hold.positive ? B(hold.abs) : -B(hold.abs))} NEAR` : 'Not possible yet') : '…'}</dd>
        <dd className="note">What the rug pays above selling those tokens.</dd>
        <dt>Biggest holder</dt>
        <dd data-testid="gap-detail-whale">
          {whale === null ? '…' : whale === 'none' ? 'Nobody holds anything.' : `${shortAccount(whale.account, 22)}: ${whale.gap.feasible ? `${fmtNearSigned(whale.gap.positive ? B(whale.gap.abs) : -B(whale.gap.abs))} NEAR` : 'not enough tokens to rug'}`}
        </dd>
        <dd className="note">The same maths for the largest holder known from the journal.</dd>
      </dl>
    </details>
  );
}

function Explainer() {
  const { state, params, gapBuy } = useChain();
  if (!state || !params) return null;
  const gap = gapBuy ? B(gapBuy.abs) : 0n;
  return (
    <section className="explainer" data-testid="explainer">
      <ol className="three-lines">
        <li>Every trade drops {params.fee_bps / 100}% into the pot.</li>
        <li>Burn {fmtTokens(B(state.t_required))} ${params.symbol} and the whole pot is yours.</li>
        <li>Anyone can. Right now. That's the coin.</li>
      </ol>
      <details className="fold-out" data-testid="explainer-whats-a-rug">
        <summary>What's a "rug"?</summary>
        <p>A "rug pull" is when the people behind a coin run off with the money. Here, nobody is behind it. There's a pot, and a printed price to steal it. Pay the price, take the pot. Everyone can see who's getting close, and everyone can beat them to it.</p>
      </details>
      <details className="fold-out">
        <summary>What the rug takes</summary>
        <p>A rug takes the pot, not the curve's reserve. Selling stays open afterwards, at whatever the curve says then. Burned tokens are gone.</p>
      </details>
      <div className="gap-legend">
        <p>The Gap: pot minus what it costs to steal it today.</p>
        {gapBuy ? (
          <p className="gap-sentence">
            {gapBuy.positive ? `Stealing it pays ${fmtNear(gap)} NEAR. Whoever goes first.` : `Stealing it costs ${fmtNear(gap)} NEAR more than it pays.`}
          </p>
        ) : null}
      </div>
      <GapDetails />
    </section>
  );
}

export function PotScreen({ sheetOpen, onOpen }: { sheetOpen: boolean; onOpen: (k: SheetKind) => void }) {
  const snap = useChain();
  useAccount();
  const awake = useBotsAwake();
  const { state, params, gapBuy, status, lastOkAt, journal } = snap;
  const lastKind = state && journal[state.journal_len - 1]?.kind;
  return (
    <>
      <div className="fold">
        <Marquee />
        <header className="headline">
          <h1>
            <span>STEAL THIS POT.</span>
            <span className="headline-pot">{state ? fmtNearFixed(B(state.pot)) : '…'} NEAR.</span>
          </h1>
          <p>Anyone can. This is the price.</p>
        </header>
        {state && params ? (
          <RugScene state={state} params={params} gap={gapBuy} lastOkAt={lastOkAt} gaze={lastKind === 'buy' ? 6 : lastKind === 'sell' ? -6 : 0} />
        ) : (
          <section className="scene skeleton" data-testid="gap-gauge" aria-busy="true">
            <LoadingMessage />
          </section>
        )}
        <LastEvent />
      </div>
      <div className="below-fold">
        <div className="section-fringe" aria-hidden="true" />
        <Explainer />
        {state ? <p className="round-line">Round <span data-testid="round-number">{state.round_id}</span> · {state.rugs_count} rug{state.rugs_count === 1 ? '' : 's'} so far</p> : null}
        {state && B(state.pot) === 0n && state.rugs_count > 0 ? <Art name="states/empty-round.webp" className="empty-round-art" alt="The Tapis is out of NEAR." /> : null}
        {status === 'live' && !awake ? <BotsAsleep /> : null}
        {status === 'frozen' ? <StateView art="states/rpc-down.webp" compact message="The chain isn't answering. Buy, Sell and Rug come back when it does." /> : null}
        {!sheetOpen ? <AccountPanel /> : null}
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

function LoadingMessage() {
  const { chain } = useApp();
  const started = useState(() => Date.now())[0];
  const now = useNow();
  const slow = now - started > 8000;
  const host = new URL(chain.getSnapshot().rpcIndex === 0 ? 'https://test.rpc.fastnear.com' : 'https://rpc.testnet.near.org').host;
  return <StateView art="anim/mascot-breathe.webp" message="Reading the chain…" detail={slow ? `Still trying ${host}.` : undefined} />;
}
