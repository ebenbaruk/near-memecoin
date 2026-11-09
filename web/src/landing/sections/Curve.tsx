import { useEffect, useMemo, useState } from 'react';
import { useLive, waitText } from '../data';
import { areaTo, buy, coinsToBurn, coreOf, fromNear, priceAt, rug, rulesOf, sell, toCoins, toNear, type Core } from '../math';
import { Explain, Src, coins, useIsPhone, useWidth } from '../ui';

export function Curve() {
  const live = useLive();
  const phone = useIsPhone();
  const base = useMemo(() => (live.state ? coreOf(live.state) : null), [live.state]);
  const [core, setCore] = useState<Core | null>(null);
  const [touched, setTouched] = useState(false);
  const [lastPot, setLastPot] = useState<bigint | null>(null); // the pot just before the last button pressed
  useEffect(() => {
    if (!touched && base) setCore(base);
  }, [base, touched]);
  const [ref, w] = useWidth<HTMLDivElement>();

  if (!core || !live.params) return <section id="curve" className="sec sec-curve" data-shot="curve"><p className="round-empty">{waitText(live.status)}</p></section>;
  const p = rulesOf(live.params);
  const burned = core.x - core.S;
  const frozen = live.status === 'frozen' ? live.frozen : null;
  const canRug = coinsToBurn(core, p) <= core.S;
  // A sell must still leave the seller something after the fee and the log charge (E_SELL_TOO_SMALL in the contract).
  const sellAmt = (core.S * 10n) / 100n;
  const sellGross = areaTo(p, core.x) - areaTo(p, core.x > sellAmt ? core.x - sellAmt : 0n);
  const canSell = sellGross - (sellGross * p.fee) / 10_000n - p.journal > p.journal;
  const act = (fn: (c: Core) => Core) => { setTouched(true); setLastPot(core.pot); setCore((c) => (c ? fn(c) : c)); };

  const W = Math.max(300, w || 300);
  const small = W < 620;
  const H = small ? 300 : Math.min(Math.max(300, W * 0.34 - 60), 480);
  const L = small ? 46 : 74, R = 14, T = 18, B = 46;
  const iw = W - L - R, ih = H - T - B;
  const xMaxN = Math.max(toCoins(core.x) * 1.5, toCoins(base?.x ?? core.x) * 1.35, 1000);
  const priceN = (xn: number) => (Number(p.p0) + Number(p.a) * xn) / 1e24;
  const pMax = priceN(xMaxN) * 1.05;
  const X = (x: number) => L + (iw * x) / xMaxN;
  const Y = (v: number) => T + ih - (ih * v) / pMax;
  const pos = toCoins(core.x);
  const edge = toCoins(burned);
  const areaPts = (a: number, b: number) => {
    const n = 40;
    const pts = [`M${X(a).toFixed(1)} ${Y(0).toFixed(1)}`];
    for (let i = 0; i <= n; i++) {
      const xn = a + ((b - a) * i) / n;
      pts.push(`L${X(xn).toFixed(1)} ${Y(priceN(xn)).toFixed(1)}`);
    }
    pts.push(`L${X(b).toFixed(1)} ${Y(0).toFixed(1)} Z`);
    return pts.join(' ');
  };
  const reserveLocked = areaTo(p, burned);
  const reserve = areaTo(p, core.x);
  const curve: string[] = [];
  for (let i = 0; i <= 60; i++) curve.push(`${i ? 'L' : 'M'}${X((xMaxN * i) / 60).toFixed(1)} ${Y(priceN((xMaxN * i) / 60)).toFixed(1)}`);
  const fs = small ? 12 : 14;

  return (
    <section id="curve" className="sec sec-curve" data-shot="curve">
      <h2 className="l-h2">Buying and selling walk the curve. A rug moves its left edge.</h2>
      <Explain phone={phone} label="Show the curve"><div>
      <p className="curve-sub">The price is a straight line: <code>p = p₀ + a × position</code>. The solid area is the NEAR the contract holds. Sellers can only take back what's right of the hatched zone: the NEAR behind burned coins.</p>

      <div className="curve-wide" ref={ref}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The bonding curve, with the reserve as the area under it and the burned coins' NEAR hatched at the left edge." data-testid="curve-chart">
          <defs>
            <pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="10" height="10" fill="var(--ink)" /><rect width="5" height="10" fill="var(--rust)" />
            </pattern>
          </defs>
          <path d={areaPts(edge, pos)} fill="var(--teal)" />
          <path d={areaPts(0, edge)} fill="url(#hatch)" />
          <path d={curve.join(' ')} fill="none" stroke="var(--cream)" strokeWidth={4} />
          <line x1={L} x2={L + iw} y1={Y(0)} y2={Y(0)} stroke="var(--cream)" strokeWidth={2} />
          <line x1={L} x2={L} y1={T} y2={Y(0)} stroke="var(--cream)" strokeWidth={2} />
          <text x={L + 6} y={T + 14} fontSize={fs} className="c-mono" fill="currentColor">price, NEAR per coin</text>
          <text x={W - R} y={H - 10} textAnchor="end" fontSize={fs} className="c-mono" fill="currentColor">position on the curve, in coins</text>
          {[0, 0.5, 1].map((f) => <text key={f} x={X(xMaxN * f)} y={Y(0) + 18} textAnchor={f === 1 ? 'end' : f === 0 ? 'start' : 'middle'} fontSize={fs} className="c-mono" fill="currentColor">{coins(xMaxN * f)}</text>)}
          <line x1={X(pos)} x2={X(pos)} y1={Y(priceN(pos))} y2={Y(0)} stroke="var(--pink)" strokeWidth={4} strokeDasharray="3 7" strokeLinecap="round" />
          <circle cx={X(pos)} cy={Y(priceN(pos))} r={10} fill="var(--pink)" stroke="var(--ink)" strokeWidth={3} />
          <text x={Math.min(X(pos) + 14, W - R - (small ? 150 : 260))} y={Y(priceN(pos)) + 26} fontSize={small ? 14 : 20} className="c-disp" fill="var(--pink)">you are here: {coins(pos)} on the curve</text>
          {X(pos) - X(edge) >= 120 ? <text x={(X(edge) + X(pos)) / 2} y={Y(priceN((edge + pos) / 2) / 2.4) + 6} textAnchor="middle" fontSize={small ? 15 : 24} className="c-disp" fill="var(--cream)">the reserve</text> : null}
          {edge > 0 ? (
            <g>
              <line x1={X(edge * 0.6)} y1={Y(priceN(edge * 0.6))} x2={X(edge * 0.6)} y2={Y(priceN(edge) + pMax * 0.22)} stroke="var(--cream)" strokeWidth={2} />
              <text x={X(edge * 0.6) + 6} y={Y(priceN(edge) + pMax * 0.22)} fontSize={small ? 13 : 18} className="c-disp" fill="var(--cream)">{small ? 'locked' : 'locked forever by burns'}</text>
            </g>
          ) : null}
        </svg>
      </div>

      <div className="curve-ctl">
        <div className="curve-btns">
          <button type="button" data-testid="curve-buy" onClick={() => act((c) => buy(c, p, fromNear(0.5)))}>Buy 0.5 NEAR</button>
          <button type="button" data-testid="curve-sell" disabled={!canSell} onClick={() => act((c) => sell(c, p, (c.S * 10n) / 100n))}>Sell 10% of supply</button>
          <button type="button" className="danger" data-testid="curve-rug" disabled={!canRug} onClick={() => act((c) => rug(c, p))}>Rug: burn the 5%</button>
          <button type="button" className="ghost" onClick={() => { setTouched(false); if (base) setCore(base); }}>Back to live</button>
        </div>
        <Src kind={touched ? 'model' : frozen ? 'past' : 'live'}>{touched ? ((lastPot ?? core.pot) < p.potMin ? 'What if the pot were past its 0.05 NEAR minimum. The contract refuses a rug below it (E_POT_BELOW_MIN).' : "Your buttons, the contract's arithmetic. Nothing is sent.") : frozen ? `Frozen copy, block ${frozen.block}.` : 'The contract as it is right now.'}</Src>
        <dl className="curve-read" data-testid="curve-read">
          <div><dt>Price</dt><dd>{(Number(priceAt(p, core.x)) / 1e24).toFixed(7)}</dd></div>
          <div><dt>Coins in existence</dt><dd>{coins(toCoins(core.S))}</dd></div>
          <div><dt>Reserve</dt><dd>{toNear(reserve).toFixed(3)}</dd></div>
          <div><dt>Locked forever</dt><dd>{toNear(reserveLocked).toFixed(3)}</dd></div>
        </dl>
        {!phone ? <p className="curve-note"><code>p₀</code> is the starting price, <code>a</code> how much the price rises per coin. The <b>position</b> counts coins minted on the curve and not sold back; burned coins still count. A rug burns coins from the supply but moves <b>neither</b> the price <b>nor</b> the reserve. The NEAR behind the burned coins can never come out again: the hatched area is it, drawn at the left edge of the curve.</p> : null}
      </div>
      </div></Explain>
    </section>
  );
}
