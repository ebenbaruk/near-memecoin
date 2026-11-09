import { useState, type ReactNode } from 'react';
import { B, fmtNear, fmtNearFixed } from '../../format/near';
import { useLive, waitText } from '../data';
import { areaTo, feeOn, fromNear, rulesOf, coreOf } from '../math';
import { Slider, Src, useIsPhone } from '../ui';

interface Part { pct: number; cls: string; value: bigint; label: string; pull?: string }

const pctOf = (part: bigint, whole: bigint) => (whole > 0n ? Number((part * 10000n) / whole) / 100 : 0);
const amount = (v: bigint) => (v === 0n ? '0' : v < 10n ** 22n ? fmtNear(v) : fmtNearFixed(v));

/** A hundred knots of 1% each, woven as one band; the share that goes to the pot is pulled out on its own fringe. */
function Row({ parts, testId, wide, knots, children }: { parts: Part[]; testId: string; wide?: boolean; knots: number; children: ReactNode }) {
  const counts = parts.map((p) => Math.round((p.pct * knots) / 100));
  const fix = knots - counts.reduce((a, b) => a + b, 0);
  counts[counts.indexOf(Math.max(...counts))] += fix;
  const pulled = parts.find((p) => p.pull);
  return (
    <div className={`flow${wide ? ' flow-wide' : ''}`} data-testid={testId}>
      <header>{children}</header>
      <div className="flow-body">
        <div className="knots" aria-hidden="true">
          {parts.flatMap((p, i) => Array.from({ length: Math.max(0, counts[i]) }, (_, k) => <i key={`${i}-${k}`} className={`${p.cls}${p.pull ? ' knot-out' : ''}`} />))}
        </div>
        {pulled ? <p className="knot-pull"><span aria-hidden="true" />{pulled.pull}</p> : null}
        <ul className="bar-key">
          {parts.map((p) => <li key={p.label}><i className={p.cls} /><span>{p.label}</span><b>{amount(p.value)}</b></li>)}
        </ul>
      </div>
    </div>
  );
}

export function FollowNear() {
  const live = useLive();
  const [amt, setAmt] = useState(1);
  const phone = useIsPhone();
  const knots = phone ? 50 : 100;
  const unit = 100 / knots;
  const params = live.params;
  if (!params || !live.state) return <section id="money" className="sec sec-money" data-shot="money"><p className="round-empty">{waitText(live.status)}</p></section>;
  const p = rulesOf(params);
  const c = coreOf(live.state);
  const A = fromNear(amt);

  // A buy: the log fee comes off first, then 2 % of the rest goes to the pot, and the rest goes on the curve.
  const d = A > p.journal ? A - p.journal : 0n;
  const buyFee = feeOn(p, d);
  const buyNet = d - buyFee;
  // A sell of coins worth A: 2 % of the curve value to the pot, the log fee, and the rest back to the seller.
  const sellFee = feeOn(p, A);
  const sellLog = A > sellFee + p.journal ? p.journal : 0n;
  const sellBack = A > sellFee + p.journal ? A - sellFee - p.journal : 0n;

  const last = live.lastRug;
  const rugPot = last ? B(last.pot_before) : c.pot;
  const rugPaid = last ? B(last.payout) : c.pot > p.rugFee ? c.pot - p.rugFee : 0n;
  const rugFee = rugPot - rugPaid;

  return (
    <section id="money" className="sec sec-money" data-shot="money">
      <h2 className="giant">Follow the NEAR.</h2>
      <p className="money-sub">One knot is {unit}% of the money in that row. So 2% looks as small as it is: it adds up because it is taken on every trade, both ways.</p>
      <div className="money-amt">
        <Slider id="amt" testId="money-amount" label="Amount moved" value={amt} min={0.1} max={10} step={0.1} onChange={setAmt} output={<>{amt.toFixed(1)} NEAR</>} />
        <Src kind="model">Exact contract arithmetic on an amount you choose, for an account that has bought before; a first buy also pays 0.00125 NEAR once. Nothing is sent.</Src>
      </div>

      <div className="flow-pair">
        <Row knots={knots} testId="flow-buy" parts={[
          { pct: pctOf(buyNet, A), cls: 'k-cobalt', value: buyNet, label: 'To the reserve, the NEAR the contract keeps to buy coins back' },
          { pct: pctOf(buyFee, A), cls: 'k-mustard', value: buyFee, label: 'To the pot', pull: `2% pulled out: ${amount(buyFee)} NEAR for the pot` },
          { pct: pctOf(p.journal, A), cls: 'k-rust', value: p.journal, label: 'Pays for the log entry' },
        ]}>
          <span className="l-stamp s-mustard">Buy</span><h3>NEAR in. Coins out.</h3>
        </Row>

        <Row knots={knots} testId="flow-sell" parts={[
          { pct: pctOf(sellBack, A), cls: 'k-cream', value: sellBack, label: 'Back to you' },
          { pct: pctOf(sellFee, A), cls: 'k-mustard', value: sellFee, label: 'To the pot', pull: `2% pulled out: ${amount(sellFee)} NEAR for the pot` },
          { pct: pctOf(sellLog, A), cls: 'k-rust', value: sellLog, label: 'Pays for the log entry' },
        ]}>
          <span className="l-stamp s-rust">Sell</span><h3>Coins back. NEAR out.</h3>
        </Row>
      </div>

      <Row knots={knots} wide testId="flow-rug" parts={rugPot > 0n ? [
        { pct: pctOf(rugPaid, rugPot), cls: 'k-pink', value: rugPaid, label: 'To whoever rugged' },
        { pct: pctOf(rugFee, rugPot), cls: 'k-cream', value: rugFee, label: 'Fixed fee, stays in the contract' },
      ] : [{ pct: 100, cls: 'k-dim', value: 0n, label: 'The pot is empty right now' }]}>
        <span className="l-stamp s-pink">Rug</span><h3>The pot leaves. The reserve doesn't move.</h3>
        {last ? <Src kind="past">Round {last.round_id}, the real payout. Here one knot is {unit}% of the pot.</Src> : <Src kind="live">The pot right now. Here one knot is {unit}% of the pot.</Src>}
      </Row>
      <p className="reserve-still"><b>{fmtNearFixed(areaTo(p, c.x))} NEAR</b> sits in the reserve, before and after a rug. Not the smallest fraction of a NEAR leaves it: the coins burn and the NEAR that paid for them stays locked, for good.</p>
    </section>
  );
}
