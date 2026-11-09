import { useMemo, useState } from 'react';
import type { Zone } from '../../chain/types';
import { Pic } from '../art';
import { HEAP_NAME, heapTier, useLive, waitText, zoneFor } from '../data';
import { buy as doBuy, buyThenRug, coreOf, feeOn, areaTo, positionOf, rug as doRug, rulesOf, toNear, type Core, type Rules } from '../math';
import { Slider, Src, near3, useWidth } from '../ui';

const HOURS = 72;
const STEP_PER_H = 4; // quarter-hours
const ZONE_FILL: Record<Zone, string> = { locked: 'var(--ink)', cold: 'var(--sage)', warm: 'var(--mustard)', live: 'var(--pink)' };
const ZONE_INK: Record<Zone, string> = { locked: 'var(--sage)', cold: 'var(--brown)', warm: 'var(--brown)', live: 'var(--brown)' };
const ZONE_NAME: Record<Zone, string> = { locked: 'LOCKED', cold: 'COLD', warm: 'WARM', live: 'WORTH IT' };

interface Pt { h: number; pot: number; price: number; cost: number; zone: Zone; potB: bigint; priceB: bigint; costB: bigint }

/** Runs the contract's rules forward from the live state: steady trading, quarter-hour by quarter-hour. */
function run(start: Core, p: Rules, perHour: bigint, netPct: number, bot: boolean) {
  let c: Core = { ...start };
  const traded = perHour / BigInt(STEP_PER_H);
  const net = (traded * BigInt(netPct)) / 100n;
  const pts: Pt[] = [];
  const stolen: number[] = [];
  const read = (h: number) => {
    const q = buyThenRug(c, p);
    const z = zoneFor(c.pot, q.cost, q.rugPrice, p.potMin, q.deposit > q.cost ? q.deposit - q.cost : 0n);
    pts.push({ h, pot: toNear(c.pot), price: toNear(q.rugPrice), cost: toNear(q.cost), zone: z, potB: c.pot, priceB: q.rugPrice, costB: q.cost });
    return { z, q };
  };
  read(0);
  for (let i = 1; i <= HOURS * STEP_PER_H; i++) {
    const h = i / STEP_PER_H;
    const r0 = areaTo(p, c.x);
    const x2 = net > 0n ? positionOf(p, r0 + net - feeOn(p, net)) : c.x;
    const dS = x2 > c.x ? x2 - c.x : 0n;
    const S = c.S + dS;
    c = { x: x2 > c.x ? x2 : c.x, S, pot: c.pot + feeOn(p, traded), hwm: c.hwm > S ? c.hwm : S };
    const { z, q } = read(h);
    if (bot && z === 'live') {
      c = doRug(doBuy(c, p, q.deposit), p);
      stolen.push(h);
      read(h);
    }
  }
  return { pts, stolen };
}

function firstCrossing(pts: Pt[]) {
  const i = pts.findIndex((q) => q.zone === 'live');
  return i < 0 ? null : pts[i];
}

/** The state at hour h. A rug adds a second point at the same hour: the later one, after the rug, is the one in force. */
const at = (pts: Pt[], h: number) => pts.filter((q) => q.h <= h).at(-1) ?? pts[0];

function Chart({ pts, stolen, hour, cross }: { pts: Pt[]; stolen: number[]; hour: number; cross: Pt | null }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const W = Math.max(300, w || 300);
  const phone = W < 620;
  const H = phone ? 250 : Math.min(Math.max(320, W * 0.42), 450);
  const L = phone ? 40 : 58, R = phone ? 14 : 118, T = 46, B = 40;
  const iw = W - L - R, ih = H - T - B;
  const maxY = Math.max(...pts.map((q) => Math.max(q.pot, q.price))) * 1.1 || 1;
  const X = (h: number) => L + (iw * h) / HOURS;
  const Y = (v: number) => T + ih - (ih * v) / maxY;

  const zones = useMemo(() => {
    const out: { z: Zone; a: number; b: number }[] = [];
    let start = 0;
    pts.forEach((q, i) => {
      const next = pts[i + 1];
      if (!next || next.zone !== q.zone) {
        out.push({ z: q.zone, a: start, b: q.h });
        if (next) start = next.h;
      }
    });
    return out;
  }, [pts]);

  const potLine = pts.map((q, i) => `${i ? 'L' : 'M'}${X(q.h).toFixed(1)} ${Y(q.pot).toFixed(1)}`).join(' ');
  const priceLine = pts.map((q, i) => `${i ? 'L' : 'M'}${X(q.h).toFixed(1)} ${Y(q.price).toFixed(1)}`).join(' ');
  const potArea = `${potLine} L${X(HOURS)} ${T + ih} L${X(0)} ${T + ih} Z`;
  const now = at(pts, hour);
  const fs = phone ? 12 : 14;
  const last = pts[pts.length - 1];

  // The crossing label sits above the pot line along its whole width, never on the fill, and on the side of the crossing away from the cursor.
  const LABEL_W = 210;
  const labelLeft = cross ? (X(hour) > X(cross.h) ? X(cross.h) - L >= LABEL_W + 12 : L + iw - X(cross.h) < LABEL_W + 12) : false;
  const labelY = !cross ? 0 : labelLeft ? Y(cross.pot) - 18 : Math.min(Y(cross.pot), Y(at(pts, Math.min(HOURS, cross.h + (LABEL_W * HOURS) / iw)).pot)) - 16;

  // End labels in the gutter, kept apart however close the two lines finish.
  const GAP = 44;
  let potY = Y(last.pot), priceY = Y(last.price);
  if (Math.abs(potY - priceY) < GAP) {
    const mid = (potY + priceY) / 2;
    if (potY > priceY) { potY = mid + GAP / 2; priceY = mid - GAP / 2; } else { potY = mid - GAP / 2; priceY = mid + GAP / 2; }
  }
  const lo = T + 16, hi = T + ih - 16;
  if (Math.max(potY, priceY) > hi) { const d = Math.max(potY, priceY) - hi; potY -= d; priceY -= d; }
  if (Math.min(potY, priceY) < lo) { const d = lo - Math.min(potY, priceY); potY += d; priceY += d; }

  return (
    <div className="m-chart" ref={ref} data-testid="moment-chart">
      {phone ? (
        <ul className="m-legend">
          <li><i className="pot" /> The pot at {HOURS}h <b>{near3(last.pot)}</b></li>
          <li><i className="price" /> The rug price at {HOURS}h <b>{near3(last.price)}</b></li>
        </ul>
      ) : null}
      {w > 0 ? (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={cross ? `The pot passes the rug price at hour ${cross.h}.` : 'The pot does not pass the rug price in this window.'}>
          <rect x={L} y={T} width={iw} height={ih} fill="var(--cream)" />
          {zones.map(({ z, a, b }, i) => (
            <g key={i}>
              <rect x={X(a)} y={2} width={Math.max(0, X(b) - X(a))} height={22} fill={ZONE_FILL[z]} stroke={z === 'locked' ? 'var(--sage)' : 'none'} strokeWidth={1} />
              {X(b) - X(a) > ZONE_NAME[z].length * (fs - 1) * 0.62 + 8 ? <text x={(X(a) + X(b)) / 2} y={18} textAnchor="middle" fontSize={fs - 1} fill={ZONE_INK[z]} className="c-mono">{ZONE_NAME[z]}</text> : null}
            </g>
          ))}
          {stolen.map((h) => <rect key={h} x={X(h) - 3} y={2} width={6} height={22} fill="var(--pink)" />)}
          {stolen.length ? <text x={X(stolen[0])} y={40} textAnchor="middle" fontSize={fs} fill="var(--pink)" className="c-mono">STOLEN</text> : null}
          {[0, 12, 24, 36, 48, 60, 72].map((g) => (
            <g key={g}>
              <line x1={X(g)} x2={X(g)} y1={T} y2={T + ih} stroke="var(--brown)" strokeOpacity={0.15} strokeWidth={2} />
              {phone && g % 24 ? null : <text x={X(g)} y={T + ih + 20} textAnchor="middle" fontSize={fs} fill="currentColor" className="c-mono">{g}h</text>}
            </g>
          ))}
          {[0.5, 1].map((f) => <text key={f} x={L - 8} y={Y(maxY * f) + 5} textAnchor="end" fontSize={fs} fill="currentColor" className="c-mono">{(maxY * f).toFixed(2)}</text>)}
          <text x={L - 8} y={T + ih + 4} textAnchor="end" fontSize={fs} fill="currentColor" className="c-mono">0</text>
          <text x={L + iw} y={T + ih + 36} textAnchor="end" fontSize={fs} fill="currentColor" className="c-mono">hours from now, NEAR on the left</text>
          <path d={potArea} fill="var(--mustard)" />
          <path d={potLine} fill="none" stroke="var(--brown)" strokeWidth={4} strokeLinejoin="round" />
          <path d={priceLine} fill="none" stroke="var(--rust)" strokeWidth={4} strokeDasharray="9 8" strokeLinecap="round" />
          {stolen.map((h) => <line key={h} x1={X(h)} x2={X(h)} y1={T} y2={T + ih} stroke="var(--rust)" strokeWidth={3} />)}
          {phone ? null : (
            <g data-testid="moment-labels">
              <text x={L + iw + 10} y={potY - 2} fontSize={18} fill="var(--cream)" className="c-disp">THE POT<tspan x={L + iw + 10} dy={20} fontSize={15} className="c-mono">{near3(last.pot)} at {HOURS}h</tspan></text>
              <text x={L + iw + 10} y={priceY - 2} fontSize={18} fill="var(--rust)" className="c-disp">RUG PRICE<tspan x={L + iw + 10} dy={20} fontSize={15} className="c-mono">{near3(last.price)} at {HOURS}h</tspan></text>
            </g>
          )}
          {cross && stolen.length === 0 ? (
            <g data-cross>
              <circle cx={X(cross.h)} cy={Y(cross.pot)} r={10} fill="var(--pink)" stroke="var(--brown)" strokeWidth={3} />
              {phone ? null : <text x={X(cross.h) + (labelLeft ? -12 : 12)} y={labelY} textAnchor={labelLeft ? 'end' : 'start'} fontSize={20} fill="var(--brown)" className="c-disp">{cross.h === 0 ? 'Worth it right now' : `Worth it at hour ${cross.h}`}</text>}
            </g>
          ) : null}
          <line x1={X(hour)} x2={X(hour)} y1={T} y2={T + ih} stroke="var(--cobalt)" strokeWidth={3} />
          <circle cx={X(hour)} cy={Y(now.pot)} r={7} fill="var(--cobalt)" stroke="var(--cream)" strokeWidth={3} />
        </svg>
      ) : null}
    </div>
  );
}

export function Moment() {
  const live = useLive();
  const [speed, setSpeed] = useState(33); // 33 of 100 is the speed that reaches the price around hour 28
  const [net, setNet] = useState(0);
  const [hour, setHour] = useState(36);
  const [bot, setBot] = useState(false);
  const { state, params, ready, rugPrice, pot, feeBps, status } = live;

  const model = useMemo(() => {
    if (!state || !params || !ready) return null;
    const short = rugPrice > pot ? rugPrice - pot : rugPrice;
    const base = (short * 10000n) / (feeBps * 28n); // NEAR per hour that closes the distance in 28 hours
    const perHour = (base * BigInt(Math.round(speed * 3))) / 100n;
    const r = run(coreOf(state), rulesOf(params), perHour, net, bot);
    return { perHour, ...r, cross: firstCrossing(r.pts) };
  }, [state, params, ready, rugPrice, pot, feeBps, speed, net, bot]);

  if (!model) return <section id="moment" className="sec sec-moment" data-shot="moment"><p className="round-empty">{waitText(status)}</p></section>;
  const { pts, cross, stolen } = model;
  const now = at(pts, hour);
  const start = pts[0];
  const take = now.potB - now.priceB;
  const tier = heapTier(now.potB, now.costB, now.priceB);
  const firstStolen = stolen[0];
  const showBotBeat = bot && firstStolen !== undefined && hour >= firstStolen;
  const heapVisible = now.zone === 'live' || now.zone === 'warm';
  const priceMove = now.price - start.price;
  const moved = Math.abs(priceMove) >= 0.0005;
  const priceLine = showBotBeat && moved
    ? `The bot's own buys have moved the rug price ${priceMove >= 0 ? 'up' : 'down'} ${Math.abs(priceMove).toFixed(3)} NEAR so far.`
    : !moved ? (net === 0 ? 'Nobody is buying more than selling: the rug price holds still.' : 'People are buying more than selling.')
      : `Buying more than selling moved the rug price ${priceMove >= 0 ? 'up' : 'down'} ${Math.abs(priceMove).toFixed(3)} NEAR.`;
  const source = status === 'frozen' ? 'modelled from the frozen copy' : 'modelled from the live state';
  return (
    <section id="moment" className="sec sec-moment" data-shot="moment">
      <div className="m-head">
        <h2 className="l-h2">When does the heist pay for itself?</h2>
        <p className="m-lead">The pot climbs with every trade. The rug price depends on where the curve stands. The moment the pot passes it, whoever moves first keeps the difference.</p>
      </div>
      <div className="m-body">
        <div className="m-left">
          <Chart pts={pts} stolen={stolen} hour={hour} cross={cross} />
          {cross && !bot ? <p className="m-cross" data-testid="moment-cross">{cross.h === 0 ? 'The pot is already past the rug price.' : `The pot passes the rug price at hour ${cross.h}.`}</p> : null}
          <div className="m-ctrl">
            <Slider id="m-speed" testId="moment-volume" label="NEAR traded per hour: a starting guess, drag it" value={speed} min={5} max={100} onChange={setSpeed} output={toNear(model.perHour).toFixed(2)} />
            <Slider id="m-net" testId="moment-net" label="Net buying share" value={net} min={0} max={50} onChange={setNet} output={`${net}%`} />
            <Slider id="m-hour" testId="moment-hour" label="Hours from now" value={hour} min={0} max={HOURS} onChange={setHour} output={`${hour} h`} />
          </div>
        </div>
        <aside className="m-right" data-testid="moment-side">
          <button type="button" role="switch" className={`m-bot${bot ? ' on' : ''}`} aria-checked={bot} onClick={() => setBot(!bot)} data-testid="moment-bot">
            <span>Turn the bot on</span>
            <span className="m-switch" aria-hidden="true"><i>NO</i><i>YES</i><b /></span>
          </button>
          {showBotBeat ? (
            <div className="m-beat" data-testid="moment-stolen">
              <Pic n="bot-hoard" sizes="(min-width: 1100px) 26vw, 80vw" alt="A robot burglar hugs the whole heap while the rug mascot cries." />
              <p>STOLEN AT HOUR {firstStolen}. POT BACK TO 0.</p>
              <small>{stolen.length} rug{stolen.length > 1 ? 's' : ''} in {HOURS} hours. The moment the take turns positive, it's gone.</small>
            </div>
          ) : (
            <div className="m-scene">
              {heapVisible ? <Pic n={now.zone === 'warm' ? 'heap-0-crumbs' : HEAP_NAME[tier]} className="m-heap" alt="" /> : null}
              <Pic n={`corner-${now.zone}`} className="m-rug" sizes="(min-width: 1100px) 30vw, 90vw" alt={`The rug, ${ZONE_NAME[now.zone].toLowerCase()}.`} />
            </div>
          )}
          <div className="m-sum" data-testid="moment-sum">
            <Src kind="model">Hour {hour}, {source}</Src>
            <p><span>The pot</span><b>{near3(now.pot)}</b></p>
            <p><span>The rug price, fee in</span><b>{near3(now.price)}</b></p>
            <p className={take >= 0n ? 'm-pos' : ''}><span>The take</span><b data-testid="moment-take">{take >= 0n ? '+' : ''}{(Number(near3(now.pot)) - Number(near3(now.price))).toFixed(3)}</b></p>
            <small data-testid="moment-pricemove">{priceLine}</small>
          </div>
        </aside>
      </div>
      <p className="m-note">A toy model: steady trading, the contract's real formulas and parameters, starting from the {status === 'frozen' ? 'frozen copy' : 'live state'}. Real trading isn't steady, and {bot ? 'a bot takes every positive take the moment it appears.' : 'with no bot, the pot just keeps growing.'} That is what the simulation below modelled.</p>
    </section>
  );
}
