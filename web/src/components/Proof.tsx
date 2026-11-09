import { useEffect, useState } from 'react';
import { audit } from '../chain/journal';
import { currentRpc } from '../chain/rpc';
import type { JournalEntry, Params } from '../chain/types';
import * as v from '../chain/views';
import { B, fmtNear } from '../format/near';
import { useApp, useChain } from '../hooks/context';
import type { Route } from '../hooks/useHashRoute';
import { Art, Link } from './common';
import { Disclosure } from './Disclosure';
import { ProofSim } from './ProofSim';

export function ProofTabs({ route }: { route: Route }) {
  const tabs: { key: Route; label: string; id: string }[] = [
    { key: 'rules', label: 'Rules', id: 'proof-tab-rules' },
    { key: 'sim', label: 'Simulation', id: 'proof-tab-sim' },
    { key: 'verify', label: 'How to verify', id: 'proof-tab-verify' },
  ];
  return (
    <nav className="proof-tabs" aria-label="Proof">
      {tabs.map((t) => (
        <Link key={t.key} to={t.key} testId={t.id} className={`chip${route === t.key ? ' active' : ''}`}>{t.label}</Link>
      ))}
    </nav>
  );
}

const PARAM_ROWS: { key: keyof Params; what: string; show?: (p: Params) => string }[] = [
  { key: 'name', what: 'Token name.' },
  { key: 'symbol', what: 'Ticker.' },
  { key: 'p0', what: 'Starting price, per whole token.', show: (p) => `${fmtNear(B(p.p0), 6)} NEAR` },
  { key: 'a', what: 'How fast the price climbs per token minted.' },
  { key: 'fee_bps', what: 'Fee on every buy and sell, paid into the pot.', show: (p) => `${p.fee_bps / 100}%` },
  { key: 'tau_bps', what: 'Share of supply you burn to take the pot.', show: (p) => `${p.tau_bps / 100}%` },
  { key: 'hwm_floor_bps', what: 'The coins to burn are never computed on less than this share of the remembered high.', show: (p) => `${p.hwm_floor_bps / 100}%` },
  { key: 'pot_min', what: 'Below this the pot cannot be taken.', show: (p) => `${fmtNear(B(p.pot_min))} NEAR` },
  { key: 'min_buy', what: 'Smallest buy accepted.', show: (p) => `${fmtNear(B(p.min_buy))} NEAR` },
  { key: 'journal_fee', what: 'Pays storage for one journal line.', show: (p) => `${fmtNear(B(p.journal_fee))} NEAR` },
  { key: 'rug_fee', what: 'Storage for one rug record, taken from the pot.', show: (p) => `${fmtNear(B(p.rug_fee))} NEAR` },
];

const METHODS: [string, string][] = [
  ['buy, sell, rug', 'Anyone'],
  ['ft_transfer, ft_transfer_call, storage_deposit', 'Anyone, NEP-141 and NEP-145'],
  ['storage_unregister', 'Always refuses (see README)'],
  ['on_payout, ft_resolve_transfer', 'Only the contract itself'],
  ['get_params, get_state, get_gap_*, get_rugs, get_journal, quote_*', 'Read-only'],
];

const accountCurl = (id: string) => `curl -s ${currentRpc()} -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"${id}"}}' | jq -r .result.code_hash`;

/** How to compare the two hashes by hand. A recompile is not part of it: the proof is about the binary that was committed. */
function HashCheck({ id }: { id: string }) {
  return (
    <>
      <p>Check it yourself. Expect <code>code hash equals committed wasm</code>:</p>
      <pre className="cli" data-testid="hash-cli">npm run verify:chain</pre>
      <p>Or read the hash on chain directly:</p>
      <pre className="cli" data-testid="hash-curl">{accountCurl(id)}</pre>
      <p className="small"><code>contracts/anyone-can-rug/res/anyone_can_rug.wasm.sha256</code> holds the same hash in hex, <code>0fdf55cd…</code>. A rebuild is not expected to match; the proof is about the committed binary.</p>
    </>
  );
}

export function ProofRules() {
  const { chain } = useApp();
  const { params } = useChain();
  const [keys, setKeys] = useState<number | null>(null);
  const [liveHash, setLiveHash] = useState<string | null>(null);

  useEffect(() => {
    void v.accessKeys(chain.contractId).then((k) => setKeys(k.length)).catch(() => setKeys(null));
    void v.viewAccount(chain.contractId).then((a) => setLiveHash(a?.code_hash ?? null)).catch(() => setLiveHash(null));
  }, [chain.contractId]);

  const published = __WASM_HASH__;
  const match = liveHash !== null && published !== '' && liveHash === published;
  const fee = params ? params.fee_bps / 100 : 2;

  return (
    <main className="page proof proof-rules">
      <h1 className="page-title">Rules</h1>
      <Art name="screens/rules.webp" className="page-art" eager />
      <section className="proof-keys">
        <h2>Access keys</h2>
        <p className="big-count">
          <span data-testid="access-keys-count">{keys === null ? '…' : `${keys} key${keys === 1 ? '' : 's'}`}</span>
          {keys === 0 ? <Art name="stamps/zero-keys.webp" className="stamp-img" alt="Zero keys" /> : null}
        </p>
        {keys === 0 ? (
          <p className="ok">Locked account. No key exists that could change the code.</p>
        ) : keys !== null ? (
          <p className="danger-banner" role="alert">Warning: this account still has {keys} access key{keys === 1 ? '' : 's'}. Whoever holds it can change the code. The final deployment deletes every key.</p>
        ) : <p>Reading <code>view_access_key_list</code>…</p>}
      </section>
      <section>
        <h2>Code hash</h2>
        <dl className="receipt-list">
          <dt>On chain</dt><dd className="break" data-testid="code-hash-live">{liveHash ?? '…'}</dd>
          <dt>In the repo</dt><dd className="break" data-testid="code-hash-published">{published || 'not available'}</dd>
        </dl>
        {liveHash ? <p className={match ? 'ok' : 'notice danger'}>{match ? 'They match.' : 'They differ: this instance was deployed from a different wasm.'}</p> : null}
        <HashCheck id={chain.contractId} />
      </section>
      <section>
        <h2>Every parameter</h2>
        <div className="table-wrap">
          <table className="param-table">
            <thead><tr><th>Parameter</th><th>Value</th><th>Meaning</th><th>Status</th></tr></thead>
            <tbody>
              {params ? PARAM_ROWS.map((r) => (
                <tr key={r.key} data-testid="param-row" data-param={r.key}>
                  <th scope="row">{r.key}</th>
                  <td className="mono" title={r.show ? String(params[r.key]) : undefined}>{r.show ? r.show(params) : String(params[r.key])}</td>
                  <td>{r.what}</td>
                  <td><span className="badge immutable">Immutable</span></td>
                </tr>
              )) : <tr><td colSpan={4}>Reading the chain…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>Methods</h2>
        <dl className="receipt-list">
          {METHODS.map(([m, who]) => (
            <div key={m} className="method-row"><dt className="mono">{m}</dt><dd>{who}</dd></div>
          ))}
        </dl>
        <div className="no-owner"><p className="ok">No owner method exists.</p><Art name="stamps/no-admin.webp" className="stamp-img" alt="No admin" /></div>
      </section>
      <section data-testid="sybil-limits">
        <h2>Fake accounts</h2>
        <p>Splitting across 100 accounts doesn't help: the coins you must burn are a share of supply, not of accounts. Wash trading pays {fee}% into a pot you may not win. Limits: a whale doesn't need fake accounts, and a bot watching the take will usually beat you.</p>
      </section>
      <Disclosure long />
    </main>
  );
}

interface Step { id: number; title: string; expect: string; cli: string; run: () => Promise<string> }

function VerifyStep({ step }: { step: Step }) {
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <li className="verify-step" data-testid="verify-step" data-step={step.id}>
      <span className="vs-n" aria-hidden="true">{step.id}</span>
      <div className="vs-main">
        <h3>{step.title}</h3>
        <p className="expect"><b>Expect:</b> {step.expect}</p>
        <pre className="cli" data-testid="verify-cli">{step.cli}</pre>
      </div>
      <div className="vs-run">
        <button type="button" className="btn btn-sell" data-testid="verify-run" disabled={busy} onClick={() => { setBusy(true); step.run().then(setResult, (e: Error) => setResult(`Error: ${e.message}`)).finally(() => setBusy(false)); }}>
          {busy ? 'Reading…' : 'Run'}
        </button>
        {result ? <p className="verify-result" data-testid="verify-result">{result}</p> : null}
      </div>
    </li>
  );
}

export function ProofVerify() {
  const { chain } = useApp();
  const c = chain.contractId;
  const auditRun = async () => {
    await chain.ensureAll();
    const { value: s } = await v.getState(c);
    await chain.ensureRange(0, s.journal_len, s.journal_len);
    const list = chain.getSnapshot().journal.slice(0, s.journal_len).filter((e): e is JournalEntry => Boolean(e));
    const a = audit(list, B(s.supply));
    return a.ok ? `Journal matches supply: ${a.events} events` : 'MISMATCH';
  };
  const curl = `curl -s ${currentRpc()} -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"optimistic","account_id":"${c}","method_name":"get_state","args_base64":"e30="}}'`;
  const steps: Step[] = [
    {
      id: 1, title: 'Run the checks', expect: 'tests pass, journal equals supply, 0 access keys, code hash matches.', cli: 'npm ci && npx playwright install chromium && npm run verify',
      run: async () => {
        const [keys, acct, auditText] = await Promise.all([v.accessKeys(c), v.viewAccount(c), auditRun()]);
        return `${keys.length} key${keys.length === 1 ? '' : 's'} · ${acct?.code_hash === __WASM_HASH__ ? 'code hash matches' : 'code hash differs'} · ${auditText}`;
      },
    },
    { id: 2, title: 'Open #/proof/rules', expect: '"keys":[] over RPC, 0 keys on the page.', cli: `curl -s ${currentRpc()} -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"${c}"}}'`, run: async () => `${(await v.accessKeys(c)).length} keys` },
    { id: 3, title: 'Open #/log, press Audit', expect: 'matches supply', cli: 'Log tab, Audit button', run: auditRun },
    {
      id: 4, title: 'Run a real rug yourself', expect: 'a throwaway account buys, sells, then buys and rugs the fast instance, and prints the hashes.', cli: 'npm run try:testnet',
      run: async () => {
        const { value: s } = await v.getState(c);
        if (s.rugs_count === 0) return 'No rug on chain yet.';
        const r = (await v.getRugs(c, s.rugs_count - 1, 1))[0];
        return `Latest rug on chain: round ${r.round_id} by ${r.rugger}`;
      },
    },
    { id: 5, title: 'Read the raw state over RPC', expect: 'the same numbers the page shows.', cli: curl, run: async () => { const { value } = await v.getState(c); return `round ${value.round_id} · pot ${value.pot} yocto · supply ${value.supply}`; } },
  ];
  return (
    <main className="page proof proof-verify">
      <header className="verify-head">
        <div>
          <h1 className="page-title">How to verify</h1>
          <p className="page-lead">Read-only, no key needed. Do this, see that.</p>
        </div>
        <Art name="screens/verify.webp" className="page-art" eager />
      </header>
      <ol className="verify-list">{steps.map((s) => <VerifyStep key={s.id} step={s} />)}</ol>
    </main>
  );
}

export function ProofRoute({ route }: { route: Route }) {
  return (
    <>
      <ProofTabs route={route} />
      {route === 'rules' ? <ProofRules /> : route === 'sim' ? <ProofSim /> : <ProofVerify />}
    </>
  );
}
