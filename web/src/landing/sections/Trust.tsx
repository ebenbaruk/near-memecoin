import { Art } from '../../components/common';
import { Pic } from '../art';
import { Copy, Jump, useIsPhone } from '../ui';

const POWERS: [string, string, string][] = [
  ['Change the fees', 'Often', 'No setter exists'],
  ['Mint more coins for themselves', 'Often', 'Only the curve can mint'],
  ['Pause trading', 'Often', 'No pause method'],
  ['Blacklist your account', 'Sometimes', 'No such method'],
  ['Upgrade the code', 'Often', 'Zero keys, nothing can sign it'],
  ['Empty the reserve', 'Often', 'Only sells, along the curve'],
  ['Decide who may rug', 'They do', 'Anyone who burns the 5%'],
];

export const keysCurl = (id: string) => `curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"${id}"}}'`;

const codeCurl = (id: string) => `curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"${id}"}}' | jq -r .result.code_hash`;

export function Trust() {
  const phone = useIsPhone();
  return (
    <>
      <div className="l-banner" data-shot="banner">
        <Pic n="banner-pink" sizes="100vw" className="l-banner-art" alt="" />
        <p className="l-banner-text">WHO CAN CHEAT?</p>
      </div>
      <section id="trust" className="sec sec-trust" data-shot="trust">
        <header className="trust-head">
          <h2 className="giant"><span className="t1">Nobody holds the keys.</span> <span className="t2">Not even us.</span></h2>
          <p className="trust-lead">The usual way a memecoin hurts you is a team with powers. This contract has no team and no powers. Don't take our word for it.</p>
          <div className="trust-stamps">
            <Art name="stamps/no-admin.webp" alt="No admin stamp" />
            <Art name="stamps/zero-keys.webp" alt="Zero keys stamp" />
          </div>
          <Pic n="judge-proof" className="trust-judge pop" sizes="(min-width: 1100px) 46vw, 86vw" alt="A judge inspects a key ring holding zero keys while a nervous thief holds it up." />
        </header>

        <div className="powers" data-testid="powers" role="table" aria-label="What a normal memecoin team can do, against what this contract allows">
          <div className="pw-row pw-head" role="row"><span role="columnheader">The power</span><span role="columnheader">Many memecoin teams</span><span role="columnheader">This contract</span></div>
          {POWERS.map(([what, them, us]) => (
            <div className="pw-row" role="row" key={what}>
              <span role="cell">{what}</span>
              <span role="cell" className="pw-them">{them}</span>
              <span role="cell" className="pw-us"><span>{us}</span></span>
            </div>
          ))}
        </div>

        <details className="checks-wrap" open={!phone}>
          <summary className="plan-h">Three checks. None needs a wallet.</summary>
          <ol className="checks">
            <li>
              <div>
                <h4>Zero keys on the account</h4>
                <p>Without a key nobody can sign for that account, so nobody can redeploy or change a parameter. Run this. See <code>"keys":[]</code>.</p>
                <Copy testId="curl-live" text={keysCurl('anyonecanrug.testnet')} />
                <Copy testId="curl-fast" text={keysCurl('rugfast.acr-ops.testnet')} />
              </div>
            </li>
            <li>
              <div>
                <h4>The code is the code</h4>
                <p><code>new(params)</code> ran once, in the deploy transaction. The <b>code hash</b> is a fingerprint of the program. Run this. See <code>code hash equals committed wasm</code>.</p>
                <Copy testId="code-verify" text="npm run verify:chain" />
                <p>Or read the hash on chain. See <code>24xdnXK4NTyHrj7S82Bv1EzkNZBBguGy8qCAugor2s9m</code>.</p>
                <Copy testId="code-curl" text={codeCurl('anyonecanrug.testnet')} />
                <p className="check-see"><code>res/anyone_can_rug.wasm.sha256</code> holds the same hash in hex, <code>0fdf55cd…</code>. A rebuild is not expected to match; the proof is about the committed binary.</p>
                <p className="check-see">Links: <a href="https://testnet.nearblocks.io/txns/DfCp5P3SsivRPvDmmB2V5PnGYMxMp4jcwxaUz3DxJdkA" target="_blank" rel="noreferrer">deploy tx</a> · <a href="https://testnet.nearblocks.io/txns/45F2veW87pLfT4GPxRhUQUrResnpqPixbGo8qjj1TZWa" target="_blank" rel="noreferrer">key deletion tx</a> (<code>anyonecanrug.testnet</code>)</p>
              </div>
            </li>
            <li>
              <div>
                <h4>The books balance</h4>
                <p>Replay every line of the on-chain journal and compare it with the supply and the pot. See a <code>PASS / FAIL / SKIP</code> table, exit code 0. <Jump to="live">Or read the log below.</Jump></p>
                <Copy text="npm ci && npx playwright install chromium && npm run verify" />
              </div>
            </li>
          </ol>
        </details>
      </section>
    </>
  );
}
