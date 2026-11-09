import { useEffect, useMemo, useRef, useState } from 'react';
import { errorCode, errorText, isUserRejection } from '../chain/errors';
import { explorerTx } from '../chain/journal';
import { TGAS_100 } from '../chain/signer';
import type { JournalEntry } from '../chain/types';
import * as v from '../chain/views';
import type { Params } from '../chain/types';
import { B, YOCTO, fmtNear, fmtTokens, parseUnits, shortAccount, toNearInput, toTokenInput } from '../format/near';
import { useAccount, useApp, useChain } from '../hooks/context';
import { BurnerSetup, AccountSummary } from './AccountPanel';
import { Sheet } from './common';

const GAS_RESERVE = YOCTO / 20n; // 0.05 NEAR kept for gas.
const PCTS = [25n, 50n, 100n];

type Phase = 'idle' | 'signing' | 'sent' | 'done' | 'failed' | 'cancelled';
type Mode = 'buy' | 'sell';

/** What a trade does to the pot, in one sentence: said beside the form on every screen size. */
export function tradeHint(mode: Mode, params: Params | null): string {
  const fee = params ? `${params.fee_bps / 100}%` : 'A fee';
  return mode === 'buy' ? `Buy ${params ? `$${params.symbol}` : 'the coin'} on the curve. ${fee} of it drops into the pot.` : `Sell back to the curve at any time. ${fee} drops into the pot.`;
}

export interface Prefill { amount: string; n: number }

export function TradeSheet({ mode, onClose, inline, prefill }: { mode: Mode; onClose: () => void; inline?: boolean; prefill?: Prefill | null }) {
  const { chain, account: accountStore } = useApp();
  const { params, journal, state } = useChain();
  const acct = useAccount();
  const [text, setText] = useState('');
  const [quote, setQuote] = useState<bigint | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [hash, setHash] = useState('');
  const [printed, setPrinted] = useState<JournalEntry | null>(null);
  const lenBefore = useRef(state?.journal_len ?? 0);

  const buy = mode === 'buy';
  const decimals = buy ? 24 : 18;
  const amount = text === '' ? null : parseUnits(text, decimals);
  const invalid = text !== '' && (amount === null || amount === 0n);
  const budget = buy ? (acct.near !== null && acct.near > GAS_RESERVE ? acct.near - GAS_RESERVE : 0n) : acct.tokens;
  const minBuy = params ? B(params.min_buy) : 0n;
  const belowMin = buy && amount !== null && amount > 0n && amount < minBuy;
  const short = acct.id && amount !== null && amount > budget ? amount - budget : null;
  const busy = phase === 'signing' || phase === 'sent';

  useEffect(() => {
    setQuote(null);
    if (!amount || invalid) {
      setQuoting(false);
      return;
    }
    setQuoting(true);
    let cancelled = false;
    const t = window.setTimeout(() => {
      const job = buy ? v.quoteBuy(chain.contractId, amount, acct.id) : v.quoteSell(chain.contractId, amount);
      job.then((q) => {
        if (!cancelled) {
          setQuote(B(q));
          setQuoting(false);
        }
      }).catch(() => {
        if (!cancelled) setQuoting(false);
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [amount, invalid, buy, chain.contractId, acct.id]);

  // The "Next" line suggests an amount: it lands in the field, ready to send.
  const prefillN = prefill?.n;
  useEffect(() => {
    if (prefill && !busy) {
      setPhase('idle');
      setHash('');
      setPrinted(null);
      setText(prefill.amount);
    }
  }, [prefillN]); // eslint-disable-line react-hooks/exhaustive-deps

  // When our line shows up in the journal, print it.
  useEffect(() => {
    if (phase !== 'done' || printed) return;
    for (let i = journal.length - 1; i >= lenBefore.current; i--) {
      const e = journal[i];
      if (e && e.account === acct.id) {
        setPrinted(e);
        return;
      }
    }
  }, [phase, printed, journal, acct.id]);

  const fee = useMemo(() => (params && amount ? (amount * BigInt(params.fee_bps)) / 10000n : 0n), [params, amount]);
  const minOut = quote !== null ? (quote * 99n) / 100n : 0n;
  const canSubmit = !!acct.id && !!amount && !invalid && !belowMin && short === null && quote !== null && quote > 0n && !busy && phase !== 'done';

  const submit = async () => {
    if (!amount || quote === null) return;
    setError('');
    setPhase('signing');
    lenBefore.current = chain.getSnapshot().state?.journal_len ?? 0;
    try {
      const calls = buy
        ? [{ method: 'buy', args: { min_out: minOut.toString() }, gas: TGAS_100, deposit: amount }]
        : [{ method: 'sell', args: { amount: amount.toString(), min_out: minOut.toString() }, gas: TGAS_100, deposit: 1n }];
      const pending = accountStore.send(calls);
      if (acct.kind === 'burner') setPhase('sent');
      const res = await pending;
      setPhase('sent');
      setHash(res.hash);
      if (res.failure) {
        const code = errorCode(res.failure);
        setError(errorText(code, res.failure));
        setPhase('failed');
      } else {
        setPhase('done');
      }
    } catch (e) {
      if (isUserRejection(e)) setPhase('cancelled');
      else {
        setError(errorText(null, String((e as Error)?.message ?? e)));
        setPhase('failed');
      }
    }
    void chain.refresh();
    void accountStore.refresh();
  };

  const pick = (pct: bigint) => {
    const v2 = (budget * pct) / 100n;
    setText(buy ? toNearInput(v2) : toTokenInput(v2));
  };

  const prefix = buy ? 'buy' : 'sell';
  const label = phase === 'signing' ? 'Signing…' : phase === 'sent' ? 'Sent' : phase === 'done' ? 'Done' : buy ? 'Buy' : 'Sell';
  const unit = buy ? 'NEAR' : (params?.symbol ?? 'tokens');

  return (
    <Sheet testId={`${prefix}-sheet`} title={buy ? 'Buy' : 'Sell'} onClose={onClose} inline={inline}>
      {inline ? null : <p className="sheet-hint" data-testid="trade-hint">{tradeHint(mode, params)}</p>}
      {acct.id ? <AccountSummary /> : <BurnerSetup />}
      <label className="field">
        <span>{buy ? 'Amount in NEAR' : `Amount in $${unit}`}</span>
        <input
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid={`${prefix}-amount`}
          placeholder="0.0"
          disabled={busy || phase === 'done'}
        />
      </label>
      {acct.id ? <p className="pct-label" data-testid="pct-label">Share of your {buy ? `${fmtNear(budget)} NEAR, 0.05 kept for gas` : `${fmtTokens(budget)} tokens`}</p> : null}
      <div className="pct-row">
        {PCTS.map((p) => (
          <button key={p.toString()} type="button" className="btn btn-pct" disabled={!acct.id || budget === 0n || busy} onClick={() => pick(p)}>{p.toString()}%</button>
        ))}
      </div>
      {invalid ? <p className="notice">That's not an amount.</p> : null}
      {belowMin ? <p className="notice">The minimum buy is {fmtNear(minBuy)} NEAR.</p> : null}
      {short !== null ? (
        <p className="notice" data-testid="insufficient">
          You're {fmtNear(short)} {buy ? 'NEAR' : 'tokens'} short.{buy ? <> <a href="https://near-faucet.io/" target="_blank" rel="noreferrer">Testnet faucet</a>.</> : null}
        </p>
      ) : null}
      <dl className="receipt-list">
        {buy ? (
          <>
            <dt>You get</dt>
            <dd data-testid="buy-quote-tokens">{quoting ? '…' : quote !== null ? `${fmtTokens(quote)} $${params?.symbol}` : '—'}</dd>
            <dt>To the pot</dt>
            <dd data-testid="buy-quote-fee">{amount ? `≈ ${fmtNear(fee)} NEAR` : '—'}</dd>
            <dt>Minimum, 1% tolerance</dt>
            <dd>{quote !== null ? fmtTokens(minOut) : '—'}</dd>
          </>
        ) : (
          <>
            <dt>You get</dt>
            <dd data-testid="sell-quote-near">{quoting ? '…' : quote !== null ? `${fmtNear(quote)} NEAR` : '—'}</dd>
            <dt>To the pot</dt>
            <dd>{params ? `${params.fee_bps / 100}%` : '—'}</dd>
            <dt>Minimum, 1% tolerance</dt>
            <dd>{quote !== null ? `${fmtNear(minOut)} NEAR` : '—'}</dd>
          </>
        )}
      </dl>
      <button type="button" className={`btn btn-submit ${buy ? 'btn-buy' : 'btn-sell'}`} data-testid={`${prefix}-submit`} disabled={!canSubmit} onClick={() => void submit()}>
        {label}
      </button>
      {inline && phase === 'done' ? <button type="button" className="btn btn-ghost" data-testid="trade-again" onClick={() => { setPhase('idle'); setText(''); setQuote(null); setHash(''); setPrinted(null); }}>{buy ? 'Buy again' : 'Sell again'}</button> : null}
      <TxOutcome phase={phase} hash={hash} error={error} />
      {printed ? (
        <div className="receipt-print" data-testid="tx-printed">
          <span>{printed.kind === 'buy' ? 'MINT' : 'BURN'}</span>
          <span>{shortAccount(printed.account, 20)}</span>
          <span>{fmtTokens(B(printed.tokens))}</span>
          <span>{fmtNear(B(printed.near))} NEAR</span>
        </div>
      ) : null}
    </Sheet>
  );
}

export function TxOutcome({ phase, hash, error }: { phase: string; hash: string; error: string }) {
  if (phase === 'cancelled') return <p className="notice" data-testid="tx-cancelled">You cancelled. Nothing happened.</p>;
  if (phase === 'failed') return <p className="notice danger" data-testid="tx-error">{error}</p>;
  if (phase === 'signing' || phase === 'sent' || phase === 'done') {
    return (
      <p className="tx-line" data-testid="tx-status" aria-live="polite">
        {phase === 'signing' ? 'Waiting for the signature.' : phase === 'sent' ? 'On its way.' : 'Done. '}
        {hash ? <a data-testid="tx-link" href={explorerTx(hash)} target="_blank" rel="noreferrer">See the transaction ↗</a> : null}
      </p>
    );
  }
  return null;
}
