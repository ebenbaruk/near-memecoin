import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { liftOf, pileSize, rugPriceOf, zoneOf } from '../chain/store';
import type { GapBuy, Params, State, Zone } from '../chain/types';
import { B, fmtNearFixed, fmtNearSignedFixed, shownTake } from '../format/near';
import { Pic } from '../landing/art';
import { useNow } from '../hooks/context';
import { useArt } from '../theme/art';
import { Mascot } from './Mascot';

export function zoneText(zone: Zone, state: State, params: Params, gap: GapBuy | null): string {
  if (zone === 'locked') {
    if (B(state.pot) === 0n && state.rugs_count > 0) return `Pot's empty. Rug #${state.rugs_count} just happened. Trade to refill it.`;
    return `The pot needs ${fmtNearFixed(B(params.pot_min))} NEAR before anyone can take it.`;
  }
  if (zone === 'cold') return 'Not worth stealing. Yet.';
  if (zone === 'warm') return 'Getting close.';
  return `RUGGABLE. ${fmtNearSignedFixed(takeShown(state, params, gap))} NEAR.`;
}

/** The take as printed: pot minus rug price, both as shown. */
export function takeShown(state: State, params: Params, gap: GapBuy | null): bigint {
  const price = rugPriceOf(gap, params);
  if (price === null) return 0n;
  return shownTake(B(state.pot), price);
}

const STALE_MS = 15000;

const CORNER_HEAP: Record<number, { w: number; x: number; y: number }> = {
  1: { w: 26, x: 82, y: 97 }, 2: { w: 30, x: 81, y: 98 }, 3: { w: 34, x: 80, y: 99 }, 4: { w: 40, x: 80, y: 99 },
};
const HEAPS = ['heap-0-crumbs', 'heap-1-coins', 'heap-2-stack', 'heap-3-sacks', 'heap-4-mountain'] as const;

/** The rug as the mechanic, drawn at the size of the frame: the same lifted corner as the landing page. */
function CornerScene({ zone, tier, price, gaze }: { zone: Zone; tier: number; price: bigint | null; gaze: number }) {
  const heap = CORNER_HEAP[tier];
  const style: CSSProperties = zone === 'warm' || !heap
    ? { width: '14%', left: '69%', bottom: '10%' }
    : { width: `${heap.w}%`, left: `${heap.x - heap.w / 2}%`, bottom: `${100 - heap.y}%` };
  return (
    <div className="corner-scene" data-corner={zone}>
      <div className="cs-art">
        {zone === 'warm' || zone === 'live' ? <Pic n={zone === 'warm' ? 'heap-0-crumbs' : HEAPS[tier]} className="cs-heap" style={style} eager alt={`A pile of NEAR, size ${tier}`} /> : null}
        <Pic key={zone} n={`corner-${zone}`} className="cs-rug" eager sizes="(min-width: 1100px) 60vw, 100vw" />
        {zone === 'cold' ? <Pic n="corner-cold" className="cs-hand" eager sizes="(min-width: 1100px) 60vw, 100vw" alt="A hand hovers by the corner of the rug." /> : null}
      </div>
      {zone === 'locked' ? <div className="cs-empty"><Pic n="empty-round" sizes="60vw" alt="A burglar peers into an empty sack." /></div> : null}
      <Mascot zone={zone} gaze={gaze} className="cs-mascot" />
      <div className="cs-tag">
        <small>RUG PRICE</small>
        <span data-testid="rug-price-value">{price !== null ? fmtNearFixed(price) : '…'}</span>
        <em>NEAR</em>
      </div>
    </div>
  );
}

/** Rendered once on each layout, wherever the numbers are. */
export function StaleBadge({ lastOkAt }: { lastOkAt: number | null }) {
  const now = useNow();
  const age = lastOkAt ? now - lastOkAt : 0;
  if (lastOkAt === null || age <= STALE_MS) return null;
  return <span className="stale" data-testid="stale-indicator"><i aria-hidden="true" />Stale · {Math.round(age / 1000)}s</span>;
}

export function RugScene({ state, params, gap, lastOkAt, gaze, desktop }: { state: State; params: Params; gap: GapBuy | null; lastOkAt: number | null; gaze: number; desktop?: boolean }) {
  const zone = zoneOf(state, params, gap);
  const manifest = useArt();
  const zoneArt = manifest?.scene.zones[zone];
  const lift = liftOf(zone, gap, zoneArt);
  const pot = B(state.pot);
  const pile = pileSize(pot, gap);
  const price = rugPriceOf(gap, params);
  const sentence = zoneText(zone, state, params, gap);

  // aria-live: at most every 10 s, immediately on a zone change.
  const [spoken, setSpoken] = useState(sentence);
  const last = useRef({ at: 0, zone });
  useEffect(() => {
    const t = Date.now();
    if (zone !== last.current.zone || t - last.current.at > 10000) {
      last.current = { at: t, zone };
      setSpoken(sentence);
    }
  }, [sentence, zone]);

  const style = { '--lift': lift } as CSSProperties;
  return (
    <section className="gauge" data-testid="gap-gauge" aria-label="The rug. Its lifted corner shows the take: the more it lifts, the closer the pot is to paying for its own theft.">
      <div className="rug-scene" style={style}>
        <CornerScene zone={zone} tier={pile} price={price} gaze={gaze} />
        {desktop ? null : (
          <>
            <div className="pot-chip">POT <span data-testid="pot-value">{fmtNearFixed(pot)}</span></div>
            <div className="gap-chip">
              The take <span data-testid="gap-value">{fmtNearSignedFixed(takeShown(state, params, gap))}</span>
              <StaleBadge lastOkAt={lastOkAt} />
            </div>
          </>
        )}
      </div>
      <div className="zone-strip">
        <p className={`zone-text${sentence.length > 30 ? ' long' : ''}`} data-testid="gap-zone" data-zone={zone}>{sentence}</p>
      </div>
      <p className="sr-only" aria-live="polite">{spoken}</p>
    </section>
  );
}
