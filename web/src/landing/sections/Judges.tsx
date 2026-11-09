import { HREF } from '../../hooks/useHashRoute';
import { Pic } from '../art';
import { Copy, Jump, useIsPhone } from '../ui';
import { keysCurl } from './Trust';

const REPO = 'https://github.com/ebenbaruk/near-memecoin';
const CONTRACT = 'https://testnet.nearblocks.io/address/anyonecanrug.testnet';
const FAST = 'https://testnet.nearblocks.io/address/rugfast.acr-ops.testnet';
const TX = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;
const DEPLOY = TX('DfCp5P3SsivRPvDmmB2V5PnGYMxMp4jcwxaUz3DxJdkA');
const KEYDEL = TX('45F2veW87pLfT4GPxRhUQUrResnpqPixbGo8qjj1TZWa');
const DEPLOY_FAST = TX('E7hkM1C2eWpDUA4b4Up67LgJdFuragqJHbBmQYQPnPDw');
const KEYDEL_FAST = TX('7hfDsLZo4MLeDTjpoHf84fzb2hzTwMum3MmrDeN2imwB');

const viewCurl = (method: string, id = 'anyonecanrug.testnet', args = 'e30=') => `curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"${id}","method_name":"${method}","args_base64":"${args}"}}' | jq -r '.result.result | implode'`;

const VERIFY = 'npm ci && npx playwright install chromium && npm run verify';
const START = `git clone https://github.com/ebenbaruk/near-memecoin && cd near-memecoin && ${VERIFY}`;
const START_SEE = 'With Rust: 33 passed, 0 failed, 0 skipped, about 80 s. Without Rust: 32 passed, 0 failed, 1 skipped';

interface Cmd { text: string; testId: string; note?: React.ReactNode }
interface Req { title: string; plain: string; quote: string; where: React.ReactNode; links: React.ReactNode; see: React.ReactNode; cmds: Cmd[]; after?: React.ReactNode }

const out = { target: '_blank', rel: 'noreferrer' };

const REQS: Req[] = [
  {
    title: 'Not on a server someone can switch off', plain: 'An NEP-141 coin whose mechanic lives in the contract.',
    quote: 'An NEP-141 token with the mechanic in the contract, not in a backend somebody could switch off.',
    where: <><code>contracts/anyone-can-rug/src/lib.rs</code>: <code>buy</code>, <code>sell</code> and <code>rug</code> hold every rule. Stopping our server changes nothing.</>,
    links: <><a href={`${REPO}/blob/main/contracts/anyone-can-rug/src/lib.rs`} {...out}>Read the source</a><a href={CONTRACT} {...out}>Open the contract</a><a href={FAST} {...out}>Fast instance</a></>,
    see: <>The JSON metadata, with <code>"spec":"ft-1.0.0"</code>, <code>"name":"Anyone Can Rug"</code> and <code>"symbol":"RUGPRICE"</code>.</>,
    cmds: [
      { text: viewCurl('ft_metadata'), testId: 'req-cmd-1', note: <><b>The coin:</b> its NEP-141 metadata.</> },
      { text: viewCurl('get_gap_buy'), testId: 'req-cmd-1b', note: <><b>The mechanic itself, from the contract:</b> the rug price fields straight from <code>get_gap_buy</code> (<code>pot</code>, <code>cost</code>, <code>t_required</code>, <code>deposit_needed</code>).</> },
    ],
    after: <p className="req-opt">Optional, a second gesture: <code>npm run try:testnet</code> makes a throwaway account do a buy, a sell and a buy + rug in one transaction, each with an explorer link. It uses a faucet limited by IP; a refusal is exit code 3 and proves nothing either way.</p>,
  },
  {
    title: 'Parameters fixed at launch, no admin key', plain: 'Everything is readable, nothing can change.',
    quote: 'All parameters (…) set at launch and readable by anyone. No admin key that can change them later.',
    where: <><code>new(params)</code> runs once, in the deploy transaction. <code>get_params</code> is public. No setter exists and the account has zero keys.</>,
    links: <><a href={DEPLOY} {...out}>Deploy tx</a><a href={KEYDEL} {...out}>Key deletion tx</a><a href={DEPLOY_FAST} {...out}>Fast: deploy tx</a><a href={KEYDEL_FAST} {...out}>Fast: key deletion tx</a><a href={HREF.rules}>Every parameter</a><a href={`${REPO}/tree/main/deploy`} {...out}>Parameters in the repo</a></>,
    see: <><code>"keys":[]</code> from the first two commands (one per contract), the values below from the last two.</>,
    cmds: [
      { text: keysCurl('anyonecanrug.testnet'), testId: 'req-cmd-2', note: <><b>Keys,</b> <code>anyonecanrug.testnet</code></> },
      { text: keysCurl('rugfast.acr-ops.testnet'), testId: 'req-cmd-2d', note: <><b>Keys,</b> <code>rugfast.acr-ops.testnet</code></> },
      { text: viewCurl('get_params'), testId: 'req-cmd-2b', note: <><b>Parameters,</b> <code>anyonecanrug.testnet</code></> },
      { text: viewCurl('get_params', 'rugfast.acr-ops.testnet'), testId: 'req-cmd-2c', note: <><b>Parameters,</b> <code>rugfast.acr-ops.testnet</code></> },
    ],
    after: (
      <>
        <dl className="param-lines" data-testid="param-lines">
          <div><dt><code>anyonecanrug.testnet</code></dt><dd>fee_bps 200 · tau_bps 500 · hwm_floor_bps 9000 · pot_min 0.05 NEAR · min_buy 0.05 NEAR · rug_fee 0.006 NEAR · journal_fee 0.003 NEAR · p0 0.00001 · a 1e-10</dd></div>
          <div><dt><code>rugfast.acr-ops.testnet</code></dt><dd>fee_bps 200 · tau_bps 500 · hwm_floor_bps 9000 · pot_min 0.05 NEAR · min_buy 0.02 NEAR · rug_fee 0.006 NEAR · journal_fee 0.003 NEAR · p0 0.000005 · a 5e-11</dd></div>
        </dl>
      </>
    ),
  },
  {
    title: 'Fake accounts get no discount', plain: 'And the limits are written down.',
    quote: 'Sybil resistance good enough for a demo, with its limits written plainly in the README.',
    where: <>The coins to burn are a share of the total supply, so splitting a buy across accounts buys no discount. Fake accounts can still win, like any player: there is no identity check, and we say so.</>,
    links: <><Jump to="limits">Read the limits</Jump><a href={`${REPO}/blob/main/README.md#limits-honestly`} {...out}>Limits in the README</a><Jump to="sim-sybil-card">Fake-accounts scenario</Jump><a href={`${REPO}/blob/main/contracts/anyone-can-rug/src/tests/prop.rs`} {...out}>The property test</a></>,
    see: <><code>test result: ok</code>. The test checks that split buys never beat one buy. Needs Rust.</>,
    cmds: [{ text: 'cd contracts/anyone-can-rug && cargo test prop_split_buy_no_advantage', testId: 'req-cmd-3' }],
  },
  {
    title: 'A page with the state, the progress, every mint and burn', plain: 'This page, and the game behind it.',
    quote: "A page with the current streak, today's progress and a log of every mint and burn.",
    where: <>The browser reads the chain directly, with no backend for reads. The log comes from <code>get_journal</code> in the contract. Here, the streak is the round number and today's progress is the pot against the rug price.</>,
    links: <><a href={HREF.log}>Open the whole log</a><Jump to="live">Log, above</Jump><a href={HREF.pot}>Open the demo</a></>,
    see: <>Open the log, press <b>Audit</b>: mints minus burns matches the contract supply. Then <code>npm run verify</code> replays the same journal: a <code>PASS / FAIL / SKIP</code> table, exit code 0. A step that couldn't run prints <code>SKIP</code>, never <code>PASS</code>.</>,
    cmds: [{ text: VERIFY, testId: 'req-cmd-4' }],
  },
  {
    title: '60-day simulation, before the parameters were picked', plain: 'Several scenarios, bad results first.',
    quote: 'Simulate 60 days of community behavior first and show me supply over time under a few scenarios. Then we pick the parameters.',
    where: <><code>sim/</code> ran 11 scenarios. Results and the limits are on this page and in the README.</>,
    links: <><Jump to="sim">Results, above</Jump><a href={`${REPO}/tree/main/sim`} {...out}>Simulator source</a><a href={HREF.sim}>Every scenario</a></>,
    see: <>A smoke run with 0 rule breaks (invariant violations) and a matching check code (the golden hash), so the same seed gives the same result.</>,
    after: <p className="req-opt">The quick run uses a fixed smoke configuration, not the shipped parameters. It proves the simulator is deterministic, not the parameter choice.</p>,
    cmds: [{ text: 'npm run sim -- --quick', testId: 'req-cmd-5' }],
  },
];

const PATH: [string, React.ReactNode, React.ReactNode][] = [
  ['Clone and verify', <code key="c">{START}</code>, `Node 24. ${START_SEE}.`],
  ['Read the keys', <>The curl in <Jump key="r2" to="req-2">requirement 2</Jump>.</>, <><code>"keys":[]</code> on both contracts.</>],
  ['Open the demo', <a key="demo" href={HREF.pot}>The live game</a>, 'The pot, the rug price, the take, and the log. Bots wear a BOT badge, our test accounts a TEST badge.'],
  ['Follow a rug', <>On the <a key="w" href={HREF.wall}>Rug Wall</a>, press <b className="p-b">Explorer</b> on a poster, then <b className="p-b">View tx ↗</b>. Takes a few seconds.</>, 'The burn and the payout in a real testnet transaction.'],
  ['Do it yourself', <code key="t">npm run try:testnet</code>, 'A throwaway account: buy, sell, and a buy + rug in one transaction.'],
  ['Re-run the sim', <code key="s">npm run sim -- --quick</code>, '0 rule breaks, matching check code.'],
];

function Command({ c }: { c: Cmd }) {
  return <div className="req-cmd">{c.note ? <p className="req-opt">{c.note}</p> : null}<Copy text={c.text} testId={c.testId} /></div>;
}

function Requirement({ r, i, phone }: { r: Req; i: number; phone: boolean }) {
  const why = (
    <>
      <div className="req-claim">
        {phone ? null : <h3>{r.title}</h3>}
        <p className="req-plain">{r.plain}</p>
        <blockquote>"{r.quote}"</blockquote>
      </div>
      <div className="req-where">
        <p>{r.where}</p>
        <p className="req-links">{r.links}</p>
      </div>
    </>
  );
  return (
    <li id={`req-${i + 1}`} className="req" data-testid={`req-${i + 1}`}>
      <span className="req-n">{i + 1}</span>
      {phone ? <h3 className="req-ph">{r.title}</h3> : why}
      <p className="req-see"><b>See:</b> {r.see}</p>
      <div className={`req-cmds${r.cmds.length > 1 ? ' two-up' : ''}`}>
        {(phone ? r.cmds.slice(0, 1) : r.cmds).map((c) => <Command key={c.testId} c={c} />)}
      </div>
      {!phone && r.after ? <div className="req-after">{r.after}</div> : null}
      {phone ? <details className="req-why"><summary>Where it is, and the links</summary>{why}{r.cmds.slice(1).map((c) => <Command key={c.testId} c={c} />)}{r.after}</details> : null}
    </li>
  );
}

export function Judges() {
  const phone = useIsPhone();
  return (
    <section id="judges" className="sec sec-judges" data-shot="judges" data-testid="judges">
      <Pic n="judge" className="judge-art pop" sizes="(min-width: 1100px) 26vw, 60vw" alt="The rug mascot in a judge's wig, with a magnifying glass and a gavel." />
      <p className="eyebrow">Track: memecoins, "Memecoins With Mechanics"</p>
      <h2 className="giant">For judges.</h2>
      <p className="judge-lead">Five requirements, five checks. No wallet and no secret. Each one is a link or a copy-paste. If one fails, the claim is false.</p>

      <div className="req-start" data-testid="req-start">
        <h3>Start from zero</h3>
        <Copy text={START} testId="req-start-cmd" />
        <p><b>Node 24, curl and jq.</b> On Linux, <code>npx playwright install --with-deps chromium</code>. Expect: <code>{START_SEE}</code>.</p>
      </div>

      <ol className="reqs">
        {REQS.map((r, i) => <Requirement key={r.title} r={r} i={i} phone={phone} />)}
      </ol>

      <details className="checks-wrap" open={!phone}>
        <summary className="plan-h">The 5-minute path.</summary>
        <ol className="jpath">
          {PATH.map(([t, doIt, see], i) => (
            <li key={t}><b>{i + 1}. {t}</b><p><em>Do</em> {doIt}</p><p><em>See</em> {see}</p></li>
          ))}
        </ol>
      </details>
      <p className="judge-foot">Reading this as an automated judge? The same steps with expected output are in the README under "Judge it in 5 minutes". The page text matches the contract: the rug price here is the contract's <code>get_gap_buy</code> cost plus the fixed fee. Explorer links may refuse scripts; <code>npm run verify:chain</code> checks the same facts over RPC.</p>
    </section>
  );
}
