import { useEffect, useRef, useState } from 'react';
import { fmtNearFixed } from '../../format/near';
import { Art } from '../../components/common';
import { Pic } from '../art';
import { useLive } from '../data';

const STOPS: { title: string; line: string; art: React.ReactNode }[] = [
  { title: 'Someone trades', line: 'Buys or sells the coin at the price the curve prints.', art: <Art name="brand/token-512.webp" className="stop-img" /> },
  { title: '2% drops in', line: 'Every buy and every sell tips 2% of its NEAR into the pot.', art: <Pic n="heap-1-coins" className="stop-img" /> },
  { title: 'The pot grows', line: 'More trading, bigger pot. Only a rug can empty it.', art: <Pic n="heap-3-sacks" className="stop-img" /> },
  { title: 'The pot passes the price', line: 'Now the steal pays for itself. The page shows it the moment it happens.', art: null },
  { title: 'Someone burns 5%', line: 'At least 5% of the supply, more if it has fallen far below its remembered high. They may buy those coins in the same transaction.', art: <Art name="stickers/candle.webp" className="stop-img" /> },
  { title: 'They take the pot', line: 'All of it, minus the 0.006 NEAR fee. Their name stays on-chain.', art: <Pic n="heap-4-mountain" className="stop-img" /> },
  { title: 'Pot back to 0', line: 'New round. Same rules. Nobody has to press anything.', art: <Art name="mascot/ripped.webp" className="stop-img" /> },
];

interface Arrow { x: number; y: number; a: number }

/** The dashed path through the numbered knots, drawn from where the knots really are, with arrowheads so the order reads at a glance. */
function usePath(root: React.RefObject<HTMLDivElement | null>) {
  const [d, setD] = useState('');
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [arrows, setArrows] = useState<Arrow[]>([]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const draw = () => {
      const r = el.getBoundingClientRect();
      const knots = [...el.querySelectorAll<HTMLElement>('.stop-knot')].map((k) => {
        const b = k.getBoundingClientRect();
        return { x: b.left + b.width / 2 - r.left, y: b.top + b.height / 2 - r.top };
      });
      if (knots.length < 7) return;
      const phone = r.width < 760;
      let pts: { x: number; y: number }[];
      if (phone) {
        pts = knots; // one column: straight down the left edge
      } else {
        const m = Math.max(10, r.width * 0.012);
        const top = knots.slice(0, 4);
        const bot = knots.slice(4);
        pts = [...top, { x: r.width + m, y: top[3].y }, { x: r.width + m, y: bot[0].y }, ...bot, { x: -m, y: bot[2].y }, { x: -m, y: top[0].y }];
      }
      const R = Math.min(60, r.width * 0.05);
      let path = '';
      const heads: Arrow[] = [];
      pts.forEach((c, i) => {
        const closed = !phone;
        const after = pts[(i + 1) % pts.length];
        if (closed && Math.hypot(after.x - c.x, after.y - c.y) > 70) {
          heads.push({ x: (c.x + after.x) / 2, y: (c.y + after.y) / 2, a: (Math.atan2(after.y - c.y, after.x - c.x) * 180) / Math.PI });
        }
        if (!closed && (i === 0 || i === pts.length - 1)) {
          path += `${i === 0 ? 'M' : 'L'}${c.x} ${c.y} `;
          return;
        }
        const prev = pts[(i - 1 + pts.length) % pts.length];
        const next = pts[(i + 1) % pts.length];
        const l1 = Math.hypot(c.x - prev.x, c.y - prev.y) || 1;
        const l2 = Math.hypot(next.x - c.x, next.y - c.y) || 1;
        const rr = Math.min(R, l1 / 2, l2 / 2);
        const ax = c.x - ((c.x - prev.x) / l1) * rr;
        const ay = c.y - ((c.y - prev.y) / l1) * rr;
        const bx = c.x + ((next.x - c.x) / l2) * rr;
        const by = c.y + ((next.y - c.y) / l2) * rr;
        path += `${i === 0 ? 'M' : 'L'}${ax.toFixed(1)} ${ay.toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)} `;
      });
      setD(phone ? path : `${path}Z`);
      setArrows(phone ? [] : heads);
      setBox({ w: r.width, h: r.height });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [root]);
  return { d, box, arrows };
}

export function Loop() {
  const root = useRef<HTMLDivElement>(null);
  const { d, box, arrows } = usePath(root);
  const live = useLive();
  return (
    <section id="how" className="sec sec-loop" data-shot="loop">
      <header className="loop-head">
        <p className="eyebrow">How it works</p>
        <h2>The job, move by move.</h2>
      </header>
      <div className="loop" ref={root} data-testid="loop-diagram">
        <svg className="loop-track" aria-hidden="true" width={box.w} height={box.h} viewBox={`0 0 ${box.w || 1} ${box.h || 1}`}>
          {d ? <path d={d} /> : null}
          {arrows.map((a, i) => <polygon key={i} points="-11,-10 13,0 -11,10" transform={`translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${a.a.toFixed(1)})`} />)}
        </svg>
        {STOPS.map((s, i) => (
          <article className={`stop stop-${i + 1}`} key={s.title} data-testid="loop-stop">
            <div className="stop-art">
              {i === 3 ? (
                <div className="stop-tag">
                  <Art name="scene/tag-blank.webp" />
                  <b data-testid="loop-rug-price">{live.ready ? fmtNearFixed(live.rugPrice) : '…'}</b>
                  <small>NEAR now</small>
                </div>
              ) : s.art}
            </div>
            <span className="stop-knot">{i + 1}</span>
            <h3>{s.title}</h3>
            <p>{s.line}</p>
          </article>
        ))}
        <div className="loop-note">
          <Art name="anim/mascot-breathe.webp" className="loop-breathe" />
          <p><b>Round after round.</b> Nobody starts the next one. The contract just keeps going.</p>
        </div>
      </div>
    </section>
  );
}
