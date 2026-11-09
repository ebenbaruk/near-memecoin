import { useState } from 'react';
import { useLive, waitText } from '../data';
import { buyThenRug, coinsToBurn, coreOf, floorOf, rulesOf, sell, toCoins } from '../math';
import { fmtNearFixed } from '../../format/near';
import { Explain, Slider, Src, coins, useIsPhone } from '../ui';

const oneDec = (n: number) => (n < 0.05 ? '0' : n.toFixed(1).replace(/\.0$/, ''));

export function Trick() {
  const live = useLive();
  const phone = useIsPhone();
  const [pct, setPct] = useState(35);
  if (!live.state || !live.params) return <section id="trick" className="sec sec-trick" data-shot="trick"><p className="round-empty">{waitText(live.status)}</p></section>;
  const p = rulesOf(live.params);
  const c = coreOf(live.state);
  const S2 = (c.S * BigInt(100 - pct)) / 100n;
  const after = { ...c, S: S2 };
  const honest = coinsToBurn(c, p);
  const naive = (p.tau * S2) / 10_000n;
  // The real cost after the sell-down: the sell moves the position on the curve, which is what makes each coin cheaper.
  const soldPrice = buyThenRug(sell(c, p, (c.S * BigInt(pct)) / 100n), p).rugPrice;
  const todayPrice = buyThenRug(c, p).rugPrice;
  const real = coinsToBurn(after, p);
  const maxT = Number(honest / 10n ** 14n) || 1;
  const w = (v: bigint) => `${Math.max(2.5, (Number(v / 10n ** 14n) / maxT) * 100)}%`;
  const floor = floorOf(p, c.hwm);
  const floorApplies = S2 < floor;
  const floorAtN = 100 - Number((floor * 10000n) / (c.S || 1n)) / 100;
  const floorAt = oneDec(Math.max(0, floorAtN));
  const saved = honest > real ? honest - real : 0n;
  const savedPct = oneDec(Number((saved * 10000n) / (honest || 1n)) / 100);
  const source = live.status === 'frozen' ? 'the frozen copy' : 'the live supply';
  return (
    <section id="trick" className="sec sec-trick" data-shot="trick">
      <p className="eyebrow">The sell-down trick</p>
      <h2 className="l-h2">Sell the supply down to shrink the burn? At most 10% fewer coins.</h2>
      <Explain phone={phone} label="Show the numbers"><div>
      <p className="trick-sub"><b>The cheat:</b> a whale sells the supply down so that 5% of it costs less, takes the pot, buys back. <b>The rule:</b> you must burn 5% of the supply, and never less than 5% of 90% of its remembered high. That 90% line is the floor.</p>

      <div className="trick-lanes">
        <div className="lane">
          <span className="lane-l">Burn today, if you already hold the coins</span>
          <span className="lane-track"><i className="lane-fill f-cobalt" style={{ width: w(honest) }}><b>{coins(toCoins(honest))} coins</b></i></span>
        </div>
        <div className="lane">
          <span className="lane-l">If the rule were just "5% of the supply now"</span>
          <span className="lane-track"><i className="lane-fill f-mustard" style={{ width: w(naive) }}><b>{coins(toCoins(naive))} coins</b></i></span>
        </div>
        <div className="lane">
          <span className="lane-l">What the contract actually demands</span>
          <span className="lane-track"><i className="lane-fill f-rust" style={{ width: w(real) }}><b data-testid="trick-real">{coins(toCoins(real))} coins</b></i></span>
        </div>
        <div className="lane">
          <span className="lane-l">Rug price after this sell-down</span>
          <span className="lane-track"><i className="lane-fill f-pink" style={{ width: `${Math.max(2.5, Math.min(100, (Number(soldPrice / 10n ** 18n) / (Number(todayPrice / 10n ** 18n) || 1)) * 100))}%` }}><b data-testid="trick-price">{fmtNearFixed(soldPrice)} NEAR</b></i></span>
        </div>
      </div>

      <div className="trick-ctl">
        <Slider id="trick-sell" testId="trick-slider" label="The whale sells the supply down by" value={pct} min={0} max={80} onChange={setPct} output={`${pct}%`} />
        <Src kind="model">Starting from {source} of {coins(toCoins(c.S))} coins and the remembered high of {coins(toCoins(c.hwm))}.</Src>
      </div>

      <div className="trick-foot">
        <p data-testid="trick-verdict">{floorApplies
          ? `The floor takes over at a ${floorAt}% sell-down. The rug still needs ${coins(toCoins(real))} coins, ${savedPct}% fewer. The floor caps the coins, not the NEAR: lower on the curve each coin is cheaper. The 2% on each sale goes into the pot the whale then takes; it pays 2% again only when buying back.`
          : `Selling ${pct}% takes ${coins(toCoins(saved))} coins off the burn so far. The floor stops that at ${floorAt}%. It caps the coins, not the NEAR: lower on the curve each coin is cheaper. The 2% on each sale goes into the pot the whale then takes; it pays 2% again only when buying back.`}</p>
        <p className="trick-rule"><b>The remembered high is not the highest supply ever.</b> A buy raises it to the supply when supply tops it. A sell leaves it. A rug resets it to the supply after the burn, but never below 90% of what it was, so it fades by at most 10% per rug and a dead coin can still be rugged.</p>
        <details className="trick-formula">
          <summary>The formula</summary>
          <code className="l-formula">coins you must burn = ceil( 5% × max( supply, floor( 0.9 × remembered high ) ) )</code>
        </details>
      </div>
      </div></Explain>
    </section>
  );
}
