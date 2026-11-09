import { useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Zone } from '../chain/types';
import { B, fmtNear, fmtNearFixed, fmtNearSignedFixed, shortAccount, shownTake } from '../format/near';
import { useApp, useTryIt } from '../hooks/context';
import { BotBadge, TEST_SUFFIX } from '../components/common';
import { JUDGES_HREF } from '../hooks/useHashRoute';
import { HEAP_NAME, heapTier, thiefName, useLive, zoneFor } from './data';
import { Pic } from './art';
import { Art } from '../components/common';

const CORNER_ALT: Record<Zone, string> = {
  locked: 'The rug, nailed flat to the floor. The pot is too small to take.',
  cold: 'The rug lying flat. A hand hovers over the corner.',
  warm: 'A hand pinches the fringe and the corner starts to lift.',
  live: 'A fist yanks the rug half off the floor. The heap of NEAR underneath is showing.',
};

const MARQUEE = ['NEAR testnet only', 'Testnet NEAR has no value', 'Anyone can take the pot', 'Bots and whales probably win', 'No admin', 'Zero keys', 'Every coin has a rug price. This one prints it'];

const HEAP_IN_FRAME: Record<number, { w: number; x: number; y: number }> = {
  0: { w: 24, x: 84, y: 92 }, 1: { w: 26, x: 82, y: 97 }, 2: { w: 30, x: 81, y: 98 }, 3: { w: 34, x: 80, y: 99 }, 4: { w: 40, x: 80, y: 99 },
};

function verdictOf(zone: Zone, o: { zero: boolean; round: number; minText: string; take: bigint; whatIf: boolean }): string {
  if (zone === 'locked') {
    // The joke is only true of a pot that really is at zero.
    if (o.zero && !o.whatIf) return `Round ${o.round} just opened. Empty. Yet.`;
    return `Locked. Needs ${o.minText} NEAR before anyone can take it.`;
  }
  if (zone === 'cold') return 'Not worth stealing. Yet.';
  if (zone === 'warm') return 'Getting close.';
  return `RUGGABLE. ${fmtNearSignedFixed(o.take)} NEAR.`;
}

/** The scale's tilt: the heavier side hangs lower, and a pot well past the price makes the whole object lurch. */
export function tiltOf(pot: number, price: number): number {
  const m = Math.max(pot, price) || 1;
  return Math.max(-8, Math.min(8, ((pot - price) / m) * 14));
}

export function Hero() {
  const live = useLive();
  const { info } = useApp();
  const tryIt = useTryIt();
  const [step, setStep] = useState(0); // 0 is the real chain; anything else is labelled WHAT IF.
  const { ready, pot, rugPrice, cost, potMin, feeBps, lastRug, round, status, frozen, params, rugs, ownFee } = live;

  const needed = useMemo(() => {
    const short = rugPrice > pot ? rugPrice - pot : rugPrice;
    return (short * 10000n * 13n) / (feeBps * 10n); // 1.3 times the trading it takes to reach the price
  }, [rugPrice, pot, feeBps]);

  const whatIf = step > 0;
  const traded = (needed * BigInt(step)) / 100n;
  const shownPot = pot + (traded * feeBps) / 10000n;
  const zone: Zone = ready ? (whatIf ? zoneFor(shownPot, cost, rugPrice, potMin, ownFee) : live.zone) : 'locked';
  const take = ready ? shownTake(shownPot, rugPrice) : 0n;
  const tier = ready ? heapTier(shownPot, cost, rugPrice) : 0;
  const zero = ready && pot === 0n;
  const justEmptied = zero && rugs.length > 0;
  const nearlyEmpty = ready && (zero || pot * 10n < rugPrice);
  const heap = HEAP_IN_FRAME[tier];
  const heapStyle: CSSProperties = zone === 'warm'
    ? { width: '14%', left: `${76 - 7}%`, bottom: `${100 - 90}%` }
    : { width: `${heap.w}%`, left: `${heap.x - heap.w / 2}%`, bottom: `${100 - heap.y}%` };

  // Left pan: the rug price. Right pan: the pot. The heavier side hangs lower.
  const tilt = ready ? tiltOf(Number(shownPot), Number(rugPrice)) : 0;

  // Coins only fall when the pot really moves, not when the page first paints.
  const firstPot = useRef<bigint | null>(null);
  if (ready && firstPot.current === null) firstPot.current = shownPot;
  const potMoved = ready && firstPot.current !== null && firstPot.current !== shownPot;

  const down = status === 'frozen' || status === 'missing';
  const verdict = ready
    ? verdictOf(zone, { zero, round, minText: fmtNear(potMin), take, whatIf })
    : down ? 'Chain unreachable.' : 'Reading the chain…';
  const name = lastRug ? thiefName(lastRug.rugger) : null;
  const mode = whatIf
    ? 'WHAT IF, not on chain'
    : status === 'loading' ? 'Reading the chain…'
      : status === 'frozen' && frozen ? `Frozen copy, block ${frozen.block}`
        : status === 'missing' ? 'Chain unreachable' : 'Right now, on chain';
  const when = whatIf ? 'In that case' : status === 'frozen' ? 'At this snapshot' : 'Right now';
  const steal = !ready ? ''
    : zone === 'locked' ? `Nobody can take it yet. The contract refuses below ${fmtNear(potMin)} NEAR.`
      : take >= 0n ? `${when}, stealing it pays ${fmtNearFixed(take)} NEAR.`
        : `${when}, stealing it would lose you ${fmtNearFixed(-take)} NEAR.`;
  const ours = lastRug?.rugger.endsWith(TEST_SUFFIX) ?? false;

  return (
    <section className="hero" data-testid="hero" data-shot="hero" data-zone={zone} data-whatif={whatIf || undefined} style={{ '--tilt': `${tilt.toFixed(2)}deg` } as CSSProperties}>
      <h1 className="h-name"><span>Anyone can </span><b>Rug</b></h1>

      <div className="h-mq" aria-hidden="true">
        <div>{[0, 1].map((k) => <span key={k}>{MARQUEE.map((t) => <span key={t}>{t}<i>✦</i></span>)}</span>)}</div>
      </div>

      <div className="h-corner">
        {zone === 'warm' || zone === 'live' ? <Pic n={zone === 'warm' ? 'heap-0-crumbs' : HEAP_NAME[tier]} className="h-heap" style={heapStyle} eager alt={zone === 'live' ? 'The pot, showing under the rug.' : ''} /> : null}
        <Pic key={zone} n={`corner-${zone}`} className="h-rug" eager sizes="(min-width: 1100px) 84vw, 100vw" alt={CORNER_ALT[zone]} />
      </div>
      {nearlyEmpty && !whatIf ? <Pic n="empty-round" className="h-empty" eager sizes="(min-width: 1100px) 36vw, 70vw" alt="A burglar peers into an empty sack and the rug mascot shrugs: nothing to steal yet." /> : null}

      <div className="h-deal">
        <p className="h-sentence" data-testid="hero-sentence">A memecoin where every trade feeds a pot, and anyone who destroys 5% of the supply takes all of it.</p>
        <div className="h-fine">
          <p className="h-analogy" data-testid="hero-analogy">To rug is to run off with the money. Here it's a rule<span className="h-an-more">: every trade adds to a shared jackpot, and one player can pay to take it all</span>.</p>{' '}
          <p className="h-win" data-testid="hero-win"><b>Win:</b> the pot, in testnet NEAR with no value, and your name on the Wall forever.</p>
        </div>
        <div className="h-act">
          <button type="button" className="h-try" data-testid="landing-try" onClick={tryIt}>
            <b>Try it, no wallet</b>
            <small>Free play money. Buy, sell or steal.</small>
          </button>
        </div>
        <p className="h-proof" data-testid="hero-proof">
          {lastRug && name ? (
            <>Last thief <b title={lastRug.rugger}>{shortAccount(name, 18)}</b> <BotBadge account={lastRug.rugger} /> took <b>{fmtNear(BigInt(lastRug.payout))} NEAR</b> in round {lastRug.round_id}{ours ? ': our own test, on the real contract.' : ". It's in the contract, forever."}</>
          ) : ready ? <>Nobody has taken a pot yet. Real contract, on NEAR testnet.</> : null}
          {' '}<a className="h-judges" href={JUDGES_HREF} data-testid="hero-judges">For judges: 5 checks ↓</a>
        </p>
      </div>

      <div className="h-machine">
        <Pic n="scale-stand" className="h-stand" eager />
        <div className="h-beam">
          <Pic n="scale-beam" eager />
          <div className="h-hang h-hang-price">
            <div className="h-pan">
              <Pic n="scale-pan" eager />
              <Art name="brand/token-512.webp" className="h-pan-token" eager />
              <Art name="stickers/candle.webp" className="h-pan-candle" eager />
            </div>
            <div className="h-tag h-tag-price">
              <small>The rug price</small>
              <strong data-testid="hero-rug-price">{ready ? fmtNearFixed(rugPrice) : '…'}</strong>
              <em>NEAR, {params ? fmtNear(B(params.rug_fee)) : '0.006'} fee in</em>
            </div>
          </div>
          <div className="h-hang h-hang-pot">
            <div className="h-pan">
              <Pic n="scale-pan" eager />
              <Pic n={HEAP_NAME[tier]} className="h-pan-heap" eager />
              {potMoved ? <span key={String(shownPot)} className="h-drop" aria-hidden="true"><i /><i /><i /></span> : null}
            </div>
            <div className="h-tag h-tag-pot">
              <small>{whatIf ? 'WHAT IF: the pot' : 'The pot'}</small>
              <strong data-testid="hero-pot">{ready ? fmtNearFixed(shownPot) : '…'}</strong>
              {whatIf
                ? <em className="h-tag-live" data-testid="hero-live-pot">Live: {fmtNearFixed(pot)} NEAR</em>
                : <em>{!ready ? 'NEAR' : justEmptied ? 'NEAR, just emptied' : zero ? 'NEAR' : 'NEAR, in the contract'}</em>}
            </div>
          </div>
        </div>
        {nearlyEmpty && !whatIf ? null : <Pic n="thief-reach" className="h-thief" eager sizes="(min-width: 1100px) 26vw, 50vw" alt="A burglar on tiptoe, reaching for the pot." />}
      </div>

      <p className="h-live-line" data-testid="hero-live-line">{status === 'frozen' || status === 'missing' ? 'Frozen copy of NEAR testnet.' : `Live on NEAR testnet. Round ${round || '…'}.`}</p>

      <div className="h-bar" data-testid="hero-placard">
        <div className="h-now">
          <p className="h-state">
            <span data-testid="hero-mode">{mode}</span>
            <span className="h-round">Round {round || '…'} · {info.contractId}</span>
          </p>
          <p className="h-verdict" data-testid="hero-verdict" aria-live="polite">{verdict}</p>
        </div>
        <p className="h-sum">
          <span>pot − rug price = <b>the take</b></span>
          <b data-testid="hero-take">{ready ? `${fmtNearFixed(shownPot)} − ${fmtNearFixed(rugPrice)} = ${fmtNearSignedFixed(take)}` : '…'}</b>
        </p>
        <p className="h-steal" data-testid="hero-steal">{steal}</p>
        <label className="h-whatif">
          <span>{whatIf ? <><b>WHAT IF</b> +{fmtNear(traded, 1)} NEAR gets traded?</> : <>Drag: <b>what if</b> people keep trading?</>}</span>
          <input type="range" min={0} max={100} value={step} disabled={!ready} data-testid="hero-whatif" aria-label="What if this much NEAR gets traded" onChange={(e) => setStep(Number(e.target.value))} />
        </label>
      </div>
    </section>
  );
}
