import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { explorerTx } from '../chain/journal';
import type { RugRecord } from '../chain/types';
import { B, fmtNear, thiefName } from '../format/near';
import { Pic } from '../landing/art';
import { useReducedMotion } from '../hooks/context';
import { Art } from './common';
import { ShareButton } from './ShareButton';
import { WantedPoster } from './WantedPoster';

// Timeline from 41 §6 (ms): 0 freeze, 200 rip, 600 bare floor, 1000 bag, 2000 poster, 3200 actions.
const STEPS = [200, 600, 1000, 2000, 3200];
export const FINAL_PHASE = STEPS.length;

export function RugClimax({ rug, you, hash, onPhase, onClose }: { rug: RugRecord; you: boolean; hash?: string; onPhase: (p: number) => void; onClose: () => void }) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(reduced ? FINAL_PHASE : 0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const counter = useCountdown(B(rug.payout), phase >= 3);

  useEffect(() => {
    onPhase(phase);
  }, [phase, onPhase]);

  useEffect(() => {
    if (reduced) return;
    const timers = STEPS.map((ms, i) => window.setTimeout(() => setPhase((p) => Math.max(p, i + 1)), ms));
    if (navigator.vibrate) navigator.vibrate([40, 80, 120]);
    return () => timers.forEach(window.clearTimeout);
  }, [reduced]);

  // Spectators who walk away get the page back eventually; your own rug stays until you close it.
  useEffect(() => {
    if (phase !== FINAL_PHASE || you) return;
    const t = window.setTimeout(onClose, 20000);
    return () => window.clearTimeout(t);
  }, [phase, you, onClose]);

  useEffect(() => {
    if (phase < 3 || phase >= FINAL_PHASE || reduced) return;
    return startCoins(canvas.current);
  }, [phase >= 3, phase >= FINAL_PHASE, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const final = phase >= FINAL_PHASE;
  const name = thiefName(rug.rugger);
  return (
    <div className="climax" data-testid="rug-climax" data-phase={phase} data-reduced={reduced ? '1' : undefined} role="dialog" aria-modal="true" aria-label="The pot has been stolen" onClick={() => setPhase(FINAL_PHASE)}>
      <p className="sr-only" aria-live="assertive">{`${rug.rugger} rugged round ${rug.round_id}.`}</p>
      <div className="climax-floor">
        <Art name="scene/floor.webp" className="climax-floor-img" eager />
        <div className="climax-pile"><Art name="scene/pile-4.webp" eager /></div>
        <Pic n="heap-5-hoard" className="climax-hoard" eager sizes="100vw" />
      </div>
      <canvas ref={canvas} className="climax-canvas" width={390} height={844} aria-hidden="true" />
      <div className="climax-count" aria-hidden="true">
        <span className="climax-pot">POT {fmtNear(counter.left)}</span>
        <span className="climax-plus">+{fmtNear(counter.right)} NEAR</span>
      </div>
      <div className="climax-bag" aria-hidden="true"><Art name="stickers/sack.webp" eager /></div>
      <Art name="mascot/ripped.webp" className="climax-mascot" eager />
      <Art name="scene/hand.webp" className="climax-hand" eager />

      <div className="climax-poster" data-testid="rug-climax-poster">
        <WantedPoster rug={rug} big testId="rug-climax-wanted" />
        <p className="climax-winner" data-testid="rug-climax-winner">
          {you ? 'YOU RUGGED IT' : (
            <>
              <span className="cw-name" style={{ '--name-chars': name.length } as CSSProperties}>{name}<small>{rug.rugger.slice(name.length)}</small></span>{' '}
              <span className="cw-stole">STOLE</span>{' '}
              <span className="cw-amt">{fmtNear(B(rug.payout))} NEAR</span>
            </>
          )}
        </p>
        <Art name="stamps/rugged.webp" className="climax-rugged" alt="" eager />
        {you && hash ? <a className="climax-hash" href={explorerTx(hash)} target="_blank" rel="noreferrer">{hash.slice(0, 16)}… ↗</a> : null}
      </div>

      <div className="climax-actions" onClick={(e) => e.stopPropagation()}>
        {final ? <ShareButton rug={rug} testId="rug-climax-share" /> : null}
        {final ? <button type="button" className="btn btn-rug" onClick={onClose} data-testid="rug-climax-next">Next round</button> : null}
      </div>

      {!final ? <button type="button" className="climax-skip" data-testid="rug-climax-skip" onClick={(e) => { e.stopPropagation(); setPhase(FINAL_PHASE); }}>Skip</button> : null}
    </div>
  );
}

/** Pot falls to zero while the thief's figure climbs. Pure BigInt so the text matches the chain. */
function useCountdown(total: bigint, running: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setStep(Math.round(p * 1000));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  const moved = (total * BigInt(step)) / 1000n;
  return { left: total - moved, right: moved };
}

/** Coin burst on a canvas: the only thing here that isn't a CSS transform. */
function startCoins(el: HTMLCanvasElement | null): (() => void) | void {
  if (!el) return;
  const ctx = el.getContext('2d');
  if (!ctx) return;
  el.width = window.innerWidth;
  el.height = window.innerHeight;
  const W = el.width;
  const H = el.height;
  const coins = Array.from({ length: 80 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 120,
    y: H * 0.55,
    vx: (Math.random() - 0.5) * 11,
    vy: -6 - Math.random() * 12,
    r: 8 + Math.random() * 10,
    s: Math.random() * 6,
  }));
  let raf = 0;
  let last = performance.now();
  const frame = (t: number) => {
    const dt = Math.min(2, (t - last) / 16);
    last = t;
    ctx.clearRect(0, 0, W, H);
    for (const c of coins) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 0.42 * dt;
      c.s += 0.2 * dt;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(Math.cos(c.s), 1);
      ctx.fillStyle = '#F2C230';
      ctx.strokeStyle = '#3A1D0E';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3A1D0E';
      ctx.fillRect(-c.r * 0.3, -c.r * 0.3, c.r * 0.6, c.r * 0.6); // the square-holed coin of the heap
      ctx.restore();
    }
    if (coins.some((c) => c.y < H + 40)) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
