import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { liftOf, pileSize, zoneOf } from '../chain/store';
import type { GapBuy, Params, State, Zone } from '../chain/types';
import { B, fmtNearFixed, fmtNearSigned } from '../format/near';
import { useNow } from '../hooks/context';
import { art, artUrl } from '../theme/art';
import { Mascot } from './Mascot';

const STALE_MS = 15000;

export function zoneText(zone: Zone, state: State, params: Params, gap: GapBuy | null): string {
  if (zone === 'locked') {
    if (B(state.pot) === 0n && state.rugs_count > 0) return `Pot's empty. Rug #${state.rugs_count} just happened. Trade to refill it.`;
    return `The pot needs ${fmtNearFixed(B(params.pot_min))} NEAR before anyone can take it.`;
  }
  if (zone === 'cold') return 'Not worth stealing. Yet.';
  if (zone === 'warm') return 'Getting close.';
  return `RUGGABLE. +${fmtNearFixed(B(gap?.abs ?? '0'))} NEAR.`;
}

export function RugScene({ state, params, gap, lastOkAt, gaze }: { state: State; params: Params; gap: GapBuy | null; lastOkAt: number | null; gaze: number }) {
  const zone = zoneOf(state, params, gap);
  const manifest = art();
  const zoneArt = manifest?.scene.zones[zone];
  const lift = liftOf(zone, gap, zoneArt);
  const pot = B(state.pot);
  const pile = pileSize(pot, gap);
  const now = useNow();
  const age = lastOkAt ? now - lastOkAt : 0;
  const stale = lastOkAt !== null && age > STALE_MS;
  const gapValue = gap ? (gap.positive ? B(gap.abs) : -B(gap.abs)) : 0n;
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
  const box = manifest?.scene.tagValueBox;
  const tier = manifest?.scene.pileTiers[pile];
  return (
    <section className="gauge" data-testid="gap-gauge" aria-label="The rug. Its lifted corner is the Gap.">
      <div className="rug-scene" style={style}>
        <img className="rs-floor" src={artUrl('scene/floor.webp') ?? undefined} alt="" draggable={false} />
        <img className="rs-pile" src={artUrl(`scene/pile-${pile}.webp`) ?? undefined} alt={`A pile of NEAR, size ${pile}`} style={tier ? { width: `${tier.widthPercent}%` } : undefined} draggable={false} />
        <div className="rs-rugw"><img src={artUrl(`scene/rug-${zone}.webp`) ?? undefined} alt="" draggable={false} /></div>
        {lift > 0 ? <div className="rs-flapw" aria-hidden="true"><img src={artUrl('scene/flap.webp') ?? undefined} alt="" draggable={false} /></div> : null}
        <Mascot zone={zone} gaze={gaze} className="rs-mascot" />
        {zoneArt?.hand !== false ? <img className="rs-hand" src={artUrl('scene/hand.webp') ?? undefined} alt="" draggable={false} /> : null}
        {zone === 'locked' ? <div className="nails" aria-hidden="true"><i /><i /><i /><i /></div> : null}
        <div className="rs-tag">
          <img src={artUrl('scene/tag.webp') ?? undefined} alt="" draggable={false} />
          <div
            className="tag-value"
            style={box ? { left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` } : undefined}
          >
            <span data-testid="rug-price-value">{gap ? fmtNearFixed(B(gap.cost)) : '…'}</span>
            <small>NEAR</small>
          </div>
        </div>
        <div className="pot-chip">POT <span data-testid="pot-value">{fmtNearFixed(pot)}</span></div>
        <div className="gap-chip">
          Gap <span data-testid="gap-value">{fmtNearSigned(gapValue)}</span>
          {stale ? <span className="stale" data-testid="stale-indicator"><i aria-hidden="true" />Stale · {Math.round(age / 1000)}s</span> : null}
        </div>
      </div>
      <div className="zone-strip">
        <p className="zone-text" data-testid="gap-zone" data-zone={zone}>{sentence}</p>
      </div>
      <p className="sr-only" aria-live="polite">{spoken}</p>
    </section>
  );
}
