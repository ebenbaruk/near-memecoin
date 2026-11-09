import type { Zone } from '../../chain/types';
import { Pic } from '../art';
import { useLive } from '../data';

const STATES: { z: Zone; name: string; line: string; alt: string }[] = [
  { z: 'locked', name: 'Locked', line: 'The pot is under the 0.05 NEAR minimum. Nailed down.', alt: 'The rug nailed flat.' },
  { z: 'cold', name: 'Cold', line: 'Short of the rug price by more than a quarter of what the coins cost to buy. Not worth stealing. Yet.', alt: 'The rug flat, one small ripple, a hand hovering.' },
  { z: 'warm', name: 'Warm', line: 'Short of the rug price by less than a quarter of what the coins cost to buy. The corner starts to lift.', alt: 'A hand pinches the fringe, the corner lifting.' },
  { z: 'live', name: 'Live', line: 'The take is zero or more. Whoever moves first keeps it.', alt: 'A fist yanks the rug half off the floor.' },
];

export function States() {
  const { zone, ready } = useLive();
  return (
    <section id="states" className="sec sec-states" data-shot="states">
      <h2 className="l-h2">The rug is its own gauge.</h2>
      <p className="states-sub">The higher the corner, the closer the pot is to paying for its own theft.</p>
      <div className="states-row" data-testid="states-row">
        {STATES.map((s) => (
          <article key={s.z} className="state-tile" data-zone-tile={s.z}>
            <div className="state-pic">{ready && zone === s.z ? <span className="state-now" data-testid="state-now">Now</span> : null}<Pic n={`corner-${s.z}`} sizes="(min-width: 1100px) 25vw, 50vw" alt={s.alt} /></div>
            <h3>{s.name}</h3>
            <p>{s.line}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
