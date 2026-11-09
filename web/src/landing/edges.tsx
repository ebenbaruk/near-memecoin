import { Jump } from './ui';

/** A torn textile edge between two sections: it overlaps both colours, so the page reads as one woven strip. */
export function Edge({ kind }: { kind: 'fringe' | 'zig' }) {
  return <div className={`edge edge-${kind}`} aria-hidden="true" />;
}

/** A marquee band, tilted across a section edge. */
export function Band({ items, tone, tilt }: { items: string[]; tone: 'mustard' | 'ink'; tilt: number }) {
  return (
    <div className={`band band-${tone}`} style={{ '--band-tilt': `${tilt}deg` } as React.CSSProperties} aria-hidden="true">
      <div>{[0, 1, 2].map((k) => <span key={k}>{items.map((t) => <span key={t}>{t}<i>✦</i></span>)}</span>)}</div>
    </div>
  );
}

/** A way out for readers who have understood the game and do not want the engine room. */
export function SkipBand() {
  return (
    <nav className="skip" aria-label="Skip the mechanics" data-testid="skip-band">
      <p>You've got the game. Below is how the machine is built.</p>
      <p className="skip-links">Skip to: <Jump to="trust">Can they cheat? ↓</Jump> <Jump to="live">Live ↓</Jump></p>
    </nav>
  );
}
