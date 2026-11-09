import { useMemo, useState } from 'react';
import { Art } from '../../components/common';
import { B, fmtNearFixed, fmtTokens, shownValue } from '../../format/near';
import { Pic } from '../art';
import { loadedJournal, useLive } from '../data';
import { floorOf, rulesOf } from '../math';
import { Src } from '../ui';

type Outcome = 'ok' | 'stale' | 'slip';

const OUT: Record<Outcome, { bracket: string; fail: string; note: string; label: string }> = {
  ok: { bracket: 'One transaction: all three land together', fail: '', label: 'The pot is still there', note: '' },
  stale: { bracket: 'One transaction: all three un-happen', fail: 'E_ROUND_STALE', label: 'Someone rugged first', note: "Someone else got there first, so the round number you signed for is gone. The rug fails and the buy is undone with it. You keep your NEAR, minus gas, and you never held a coin." },
  slip: { bracket: 'One transaction: all three un-happen', fail: 'E_BURN_ABOVE_MAX', label: 'The coins to burn rose past your limit', note: 'The supply grew past the limit you signed for. The contract refuses, the buy is undone, and you lose only gas.' },
};

/** One rope ties the three steps together; when the race is lost it snaps, and the thief goes down with it. */
function Rope({ broken }: { broken: boolean }) {
  return (
    <svg className="rope" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
      {broken ? (
        <>
          <path className="rope-o" d="M0 60 C 150 20, 300 100, 500 60 S 700 40, 760 70" />
          <path className="rope-c" d="M0 60 C 150 20, 300 100, 500 60 S 700 40, 760 70" />
          <path className="rope-o" d="M840 92 C 900 110, 950 96, 1000 110" />
          <path className="rope-c" d="M840 92 C 900 110, 950 96, 1000 110" />
        </>
      ) : (
        <>
          <path className="rope-o" d="M0 60 C 150 20, 300 100, 500 60 S 800 20, 1000 60" />
          <path className="rope-c" d="M0 60 C 150 20, 300 100, 500 60 S 800 20, 1000 60" />
        </>
      )}
    </svg>
  );
}

export function Atomic() {
  const live = useLive();
  const [o, setO] = useState<Outcome>('ok');
  const { gapBuy, snap, lastRug, rugPrice, params, state, ready, status } = live;
  const frozen = status === 'frozen';
  const sameBlock = useMemo(() => {
    if (!lastRug) return null;
    const journal = loadedJournal(snap.journal);
    const match = journal.some((e) => e.kind === 'buy' && e.account === lastRug.rugger && e.block === lastRug.block);
    return match ? lastRug : null;
  }, [lastRug, snap.journal]);
  const undone = o !== 'ok';
  const mint = gapBuy ? fmtTokens(B(gapBuy.min_out)) : '…';
  const burn = gapBuy ? fmtTokens(B(gapBuy.t_required)) : '…';

  // Every figure in this line is rounded the way the page prints it, so the sum adds up on screen.
  const dep = gapBuy ? shownValue(B(gapBuy.deposit_needed)) : 0n;
  const fee = params ? shownValue(B(params.rug_fee)) : 0n;
  const price = ready ? shownValue(rugPrice) : 0n;
  const net = price - fee;
  // The coins to burn come from the remembered high when the supply, even after this buy, is below 90% of it.
  const floorBinds = !!(gapBuy && params && state) && floorOf(rulesOf(params), B(state.hwm)) > B(state.supply) + B(gapBuy.min_out);
  const refused = !undone && !!gapBuy && !gapBuy.feasible;

  return (
    <section id="atomic" className="sec sec-atomic" data-shot="atomic" data-outcome={o}>
      <h2 className="l-h2">All of it happens, or none of it does.</h2>
      <p className="atomic-sub">You don't need to hold the coin. The buy and the burn ride in one <b>atomic</b> transaction. If any step fails, everything un-happens and your NEAR comes back. Pick how the race ends.</p>
      <div className="atomic-seg" role="group" aria-label="How the race ends">
        {(Object.keys(OUT) as Outcome[]).map((k) => <button key={k} type="button" aria-pressed={o === k} className={o === k ? 'on' : ''} data-testid={`atomic-${k}`} onClick={() => setO(k)}>{OUT[k].label}</button>)}
      </div>
      <p className="atomic-bracket" data-testid="atomic-bracket">{refused ? `${frozen ? 'At this snapshot' : 'Right now'}: refused, E_POT_BELOW_MIN` : OUT[o].bracket}</p>
      {refused ? <p className="atomic-whatif" data-testid="atomic-whatif">WHAT IF the pot were over its minimum: the same three steps.</p> : null}
      <div className="atomic-track">
        <Rope broken={undone} />
        <Pic n="thief-reach" className={`rope-thief pop${undone ? ' fall' : ''}`} sizes="(min-width: 1100px) 22vw, 40vw" alt="" />
        {undone ? <span className="rope-stamp" data-testid="atomic-stamp">{OUT[o].fail}</span> : null}
        <div className="atom"><b>1</b><h3>Buy</h3><p>Mint <span>{mint}</span> coins on the curve. 2% goes into the pot.</p><em className={undone ? 'no' : 'ok'}>{undone ? 'undone' : 'minted'}</em></div>
        <div className="atom"><b>2</b><h3>Burn</h3><p>Burn <span>{burn}</span> coins: {floorBinds ? '5% of 90% of the remembered high, because the supply, even after your buy, is under that line.' : '5% of the supply after your own buy.'}</p><em className={undone ? 'no' : 'ok'}>{undone ? 'reverted' : 'burned'}</em></div>
        <div className="atom"><b>3</b><h3>Pay</h3><p>The pot, minus the fee, goes to you. Your name stays in the contract.</p><em className={undone ? 'no' : 'ok'}>{undone ? 'not paid' : 'paid'}</em></div>
      </div>
      {gapBuy && ready ? (
        <p className="atomic-sum" data-testid="atomic-sum">
          <span>You send {fmtNearFixed(dep)}. {params ? params.fee_bps / 100 : 2}% of it goes in the pot you take back.</span>
          <span>What it really costs: {fmtNearFixed(net)} + {fmtNearFixed(fee)} fixed fee = the {fmtNearFixed(price)} rug price.</span>
        </p>
      ) : null}
      {OUT[o].note ? <p className="atomic-note">{OUT[o].note}</p> : (
        <p className="atomic-note">The payout follows a block or two later; if it fails, the amount goes back to the pot, minus the 0.003 NEAR log fee.</p>
      )}
      {refused ? (frozen ? <Src kind="past">Frozen copy: the rug would be refused, the pot was under the 0.05 NEAR minimum.</Src> : <Src kind="live">Right now the rug would be refused: the pot is under the 0.05 NEAR minimum.</Src>) : null}
      {!undone && sameBlock ? (
        <Src kind="past">Round {sameBlock.round_id} landed its buy and its rug in the same block, {sameBlock.block.toLocaleString('en-US')}.</Src>
      ) : !undone && !refused ? (
        (frozen ? <Src kind="past">Frozen copy: the amounts above were the contract's own quote at that snapshot.</Src> : <Src kind="live">The amounts above are the contract's own quote for doing it right now.</Src>)
      ) : null}
      <Art name="decor/checker-patch.webp" className="atomic-checker" />
    </section>
  );
}
