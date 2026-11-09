import { useEffect, useRef, useState } from 'react';
import { topHolder } from '../chain/journal';
import type { Gap } from '../chain/types';
import * as v from '../chain/views';
import { ChainDownError } from '../chain/rpc';
import { B, YOCTO, ago, fmtNear, fmtNearFixed, fmtNearSigned, fmtNearSignedFixed, fmtTokens, shownTake, shortAccount, thiefName } from '../format/near';
import { rugPriceOf, zoneOf } from '../chain/store';
import { useAccount, useApp, useChain, useNow } from '../hooks/context';
import type { SheetKind } from './ActionDock';
import { BotBadge, StateView } from './common';

const SUGGESTED_BUY = '0.5';

export const KIND_LABEL = { buy: 'MINT', sell: 'BURN', rug: 'RUG', payout_failed: 'FAILED' } as const;

export function LastEvent() {
  const { journal, state } = useChain();
  const now = useNow();
  const i = (state?.journal_len ?? 0) - 1;
  const e = i >= 0 ? journal[i] : undefined;
  return (
    <div className="last-event" data-testid="last-event">
      {e ? (
        <>
          <b className={`kind-${e.kind}`}>{KIND_LABEL[e.kind]}</b> {shortAccount(thiefName(e.account), 20)} <BotBadge account={e.account} />
          <span className="le-amount">{fmtNear(B(e.near))} NEAR</span> <span className="le-age">{ago(e.ts_ms, now)}</span>
        </>
      ) : state && i < 0 ? 'No mints or burns yet.' : null}
    </div>
  );
}

/** One line that says what to do next, from the state of the round and of the player. */
export function NextLine({ onOpen }: { onOpen: (k: SheetKind, amount?: string) => void }) {
  const { account } = useApp();
  const { state, params, gapBuy } = useChain();
  const acct = useAccount();
  const refusal = !acct.id && acct.faucetError ? acct.faucetError : null;
  const box = useRef<HTMLDivElement>(null);
  // A refusal must be seen: it lands on the first screen, wherever the reader was.
  useEffect(() => {
    if (refusal) box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [refusal]);
  if (!state || !params) return null;
  const zone = zoneOf(state, params, gapBuy);
  const price = rugPriceOf(gapBuy, params);
  const pot = B(state.pot);
  const take = price === null ? 0n : shownTake(pot, price);
  if (refusal) {
    return (
      <div className="next-line next-refused" data-testid="next-line" data-zone={zone} role="status" ref={box}>
        <p data-testid="next-refused">The free-money tap is busy. {refusal.retry ? `Try again in ${refusal.retry}, or connect a wallet.` : 'Try again soon, or connect a wallet.'}</p>
        <button type="button" className="next-small" data-testid="next-wallet" onClick={() => void account.connectWallet()}>Connect a wallet</button>
      </div>
    );
  }
  let text = 'Next: get a free throwaway account.';
  let go: () => void = () => void account.createBurner();
  if (acct.id) {
    const ownFee = gapBuy && B(gapBuy.deposit_needed) > B(gapBuy.cost) ? B(gapBuy.deposit_needed) - B(gapBuy.cost) : 0n;
    const missing = B(params.pot_min) - pot - ownFee;
    const volume = missing > 0n ? (missing * 10000n) / BigInt(params.fee_bps) : 0n;
    go = () => (zone === 'live' ? onOpen('rug') : onOpen('buy', SUGGESTED_BUY));
    const tip = fmtNear(((YOCTO / 2n) * BigInt(params.fee_bps)) / 10000n, 2);
    if (zone === 'locked') text = `Next: Buy ${SUGGESTED_BUY} NEAR. About ${fmtNear(volume)} NEAR of trading unlocks the pot.`;
    else if (zone === 'live') text = `Next: Rug it. ${fmtNearSignedFixed(take)} NEAR.`;
    else text = `Next: Buy ${SUGGESTED_BUY} NEAR. ${tip} lands in the pot. Stealing now loses ${fmtNearFixed(take < 0n ? -take : take)}.`;
  }
  return (
    <div className="next-wrap" ref={box}>
      <button type="button" className="next-line" data-testid="next-line" data-zone={zone} disabled={acct.creating} onClick={go}>
        <span>{acct.creating ? 'Asking the testnet faucet for play money…' : text}</span><b aria-hidden="true">→</b>
      </button>
    </div>
  );
}

export function GapDetails() {
  const { chain } = useApp();
  const snap = useChain();
  const [whale, setWhale] = useState<{ account: string; gap: Gap } | 'none' | null>(null);
  const hold = snap.gapHolder;
  const onToggle = async (open: boolean) => {
    if (!open || whale) return;
    try {
      await chain.ensureAll();
      const entries = chain.getSnapshot().journal.filter((e): e is NonNullable<typeof e> => Boolean(e));
      const top = topHolder(entries);
      if (!top) return setWhale('none');
      setWhale({ account: top, gap: await v.getGapExit(chain.contractId, top) });
    } catch (e) {
      if (!(e instanceof ChainDownError)) throw e; // the chain is down: the line stays '…' and the frozen banner says why
    }
  };
  return (
    <details className="fold-out" data-testid="gap-details" onToggle={(e) => void onToggle(e.currentTarget.open)}>
      <summary>Details</summary>
      <dl className="receipt-list">
        <dt>If you hold</dt>
        <dd data-testid="gap-detail-hold">{hold ? (hold.feasible ? `${fmtNearSigned(hold.positive ? B(hold.abs) : -B(hold.abs))} NEAR` : 'Not possible yet') : '…'}</dd>
        <dd className="note">What taking the pot pays above simply selling those coins.</dd>
        <dt>Biggest holder</dt>
        <dd data-testid="gap-detail-whale">
          {whale === null ? '…' : whale === 'none' ? 'Nobody holds anything.' : `${shortAccount(whale.account, 22)}: ${whale.gap.feasible ? `${fmtNearSigned(whale.gap.positive ? B(whale.gap.abs) : -B(whale.gap.abs))} NEAR` : 'not enough tokens to rug'}`}
        </dd>
        <dd className="note">The same maths for the largest holder known from the journal.</dd>
      </dl>
    </details>
  );
}

export function Explainer() {
  const { state, params, gapBuy } = useChain();
  if (!state || !params) return null;
  const gap = gapBuy ? B(gapBuy.abs) : 0n;
  const coins = gapBuy ? B(gapBuy.t_required) : B(state.t_required);
  const zone = zoneOf(state, params, gapBuy);
  return (
    <section className="explainer" data-testid="explainer">
      <ol className="three-lines">
        <li>Every trade adds {params.fee_bps / 100}% to the pot.</li>
        <li>Buy and destroy {fmtTokens(coins)} coins to take it{zone === 'locked' ? `, once the pot reaches ${fmtNear(B(params.pot_min))} NEAR` : ''}.</li>
        <li>It only pays once the pot is bigger than the rug price.</li>
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
        <p>The take: the pot minus the rug price, which already includes the fixed {fmtNear(B(params.rug_fee))} NEAR fee. The contract calls it the gap.</p>
        {gapBuy ? (
          <p className="gap-sentence">
            {gapBuy.positive ? `Taking it pays ${fmtNear(gap)} NEAR more than it costs. Whoever moves first keeps the difference.` : `Taking it costs ${fmtNear(gap)} NEAR more than it pays.`}
          </p>
        ) : null}
      </div>
      <GapDetails />
    </section>
  );
}

export function LoadingMessage() {
  const { chain } = useApp();
  const started = useState(() => Date.now())[0];
  const now = useNow();
  const slow = now - started > 8000;
  const host = new URL(chain.getSnapshot().rpcIndex === 0 ? 'https://test.rpc.fastnear.com' : 'https://rpc.testnet.near.org').host;
  return <StateView art="anim/mascot-breathe.webp" message="Reading the chain…" detail={slow ? `Still trying ${host}.` : undefined} />;
}
