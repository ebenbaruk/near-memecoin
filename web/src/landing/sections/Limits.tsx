import { useTryIt } from '../../hooks/context';
import { HREF } from '../../hooks/useHashRoute';
import { Pic } from '../art';
import { useIsPhone } from '../ui';

const LIMITS: [string, string][] = [
  ['"Anyone can" is the whole promise.', 'Fees are 2% each way, plus a flat 0.003 NEAR per trade for the log line: on a small trade that is the main cost. Bots and whales probably win, and our model says so.'],
  ['Fake accounts: no identity check, none claimed.', 'The coins to burn are a share of supply, not a per-account limit. Extra accounts get no discount on the coins to burn, and each one pays gas and registration. A pool of fake accounts can still win, like any big player. That is enough for a testnet demo and nothing more.'],
  ['The demo activity is our bots and our test accounts.', 'They only call public methods and they are labelled. None of it is a community.'],
  ['Burned means locked.', "The NEAR behind burned coins stays in the reserve forever. That's the design."],
  ['Immutable cuts both ways.', "A bug can't be fixed. A fix would be a new contract, and this one would stay."],
  ['The lowest price is a position on a curve.', 'Reachable only by selling down the curve. It says nothing about value.'],
  ['Transfers are ordinary NEP-141.', 'A wrapper or an outside market is not prevented.'],
  ['One departure from the storage standard.', 'NEP-145 storage_unregister always panics, so registration storage is never refunded. This closes a griefing path.'],
  ['The simulation is assumed behaviour.', 'Not measured. The campaign was reduced for runtime, and the viable range rests on a 20-seed screen.'],
  ['Verify has edges.', "It checks keys, code hash and past bookkeeping. It doesn't prove future behaviour, and the wasm is not a reproducible build."],
  ['Wallet signing is not tested end to end.', 'Wallet flows use a stubbed signer in the page tests. Real transactions are covered by sandbox tests and testnet scripts.'],
  ['Testnet only.', 'Testnet NEAR has no value. Nothing here is an investment.'],
];

export function Limits() {
  const phone = useIsPhone();
  const shown = phone ? LIMITS.slice(0, 2) : LIMITS;
  return (
    <section id="limits" className="sec sec-limits" data-shot="limits">
      <p className="eyebrow">Limits, honestly</p>
      <h2 className="giant">Everything we'd normally sweep under the rug.</h2>
      <Pic n="swept" className="limits-art" sizes="100vw" alt="A bulge under the rug: the mascot, thieves and a whale, all swept under it." />
      <ul className="limits" data-testid="limits">
        {shown.map(([t, d]) => <li key={t}><b>{t}</b> {d}</li>)}
      </ul>
      {phone ? (
        <details className="more-limits">
          <summary>{LIMITS.length - 2} more limits</summary>
          <ul className="limits">{LIMITS.slice(2).map(([t, d]) => <li key={t}><b>{t}</b> {d}</li>)}</ul>
        </details>
      ) : null}
    </section>
  );
}

export function Footer() {
  const tryIt = useTryIt();
  return (
    <footer className="foot" data-shot="foot">
      <Pic n="heap-5-hoard" className="foot-hoard" sizes="100vw" alt="" />
      <Pic n="hand-fist" className="foot-fist" sizes="32vw" alt="A fist grabs a fringe and yanks it." />
      <div className="foot-links">
        <button type="button" onClick={tryIt} data-testid="foot-try">Try it, no wallet</button>
        <a href={HREF.wall}>Wall of Rugs</a>
        <a href="https://github.com/ebenbaruk/near-memecoin" target="_blank" rel="noreferrer">Repository</a>
        <a href="https://testnet.nearblocks.io/address/anyonecanrug.testnet" target="_blank" rel="noreferrer">anyonecanrug.testnet</a>
        <a href="https://testnet.nearblocks.io/address/rugfast.acr-ops.testnet" target="_blank" rel="noreferrer">rugfast.acr-ops.testnet</a>
        <a href="https://github.com/ebenbaruk/near-memecoin#readme" target="_blank" rel="noreferrer">README</a>
      </div>
      <p className="foot-tiny">Built for NEAR HACKATHON, track memecoins, by Eli Benbaruk. Other project by the same author: <a href="https://github.com/ebenbaruk/TokenGo" target="_blank" rel="noreferrer">TokenGo</a> (track: games), an independent project with no shared code, contract or token. Testnet only. Testnet NEAR has no value.</p>
      <Pic n="getaway" className="foot-getaway" sizes="100vw" alt="Five thieves run away with the rug, the mascot fleeing in front." />
      <p className="foot-word" aria-hidden="true">Anyone can rug</p>
    </footer>
  );
}
