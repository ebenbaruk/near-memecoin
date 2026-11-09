import { useCallback, useEffect, useRef, useState } from 'react';
import { errorCode, errorText, isRaceLost, isUserRejection } from '../chain/errors';
import { TGAS_100 } from '../chain/signer';
import type { GapBuy } from '../chain/types';
import * as v from '../chain/views';
import { zoneOf } from '../chain/store';
import { B, YOCTO, ceilPct, fmtNear, fmtNearFixed, fmtNearSignedFixed, fmtTokens, parseUnits, shownTake, shownValue, toNearInput } from '../format/near';
import { useAccount, useApp, useChain } from '../hooks/context';
import { AccountActions, AccountLine, BurnerSetup } from './AccountPanel';
import { Sheet } from './common';
import { HoldButton } from './HoldButton';
import { Mascot } from './Mascot';
import { TxOutcome } from './TradeSheet';

const GAS_RESERVE = YOCTO / 20n;

interface Quote {
  round: number; pot: bigint; t: bigint; hold: bigint; toBuy: bigint; needsBuy: boolean;
  deposit: bigint; maxBurn: bigint; net: bigint; rugFee: bigint; gap: GapBuy;
}

export interface LostInfo { round: number; sent: boolean }

type Phase = 'quoting' | 'locked' | 'signing' | 'sent' | 'done' | 'failed' | 'cancelled';

export function RugSheet({ onClose, onLost, onWon, inline }: { onClose: () => void; onLost: (i: LostInfo) => void; onWon: (hash: string) => void; inline?: boolean }) {
  const { chain, account: accountStore } = useApp();
  const { params, state: liveState, gapBuy } = useChain();
  const acct = useAccount();
  const [q, setQ] = useState<Quote | null>(null);
  const [phase, setPhase] = useState<Phase>('quoting');
  const [error, setError] = useState('');
  const [hash, setHash] = useState('');
  const [requoted, setRequoted] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [minPayoutText, setMinPayoutText] = useState('');
  const [twoStep, setTwoStep] = useState(() => {
    try {
      return localStorage.getItem('acr:two-step') === '1';
    } catch {
      return false;
    }
  });
  const [armed, setArmed] = useState(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const advancedRef = useRef(advanced);
  advancedRef.current = advanced;

  // `silent` refreshes the frozen quote in place: the desktop panel stays open beside the live numbers.
  const freeze = useCallback(async (silent = false) => {
    if (!silent) {
      setPhase('quoting');
      setArmed(false);
    }
    const c = chain.contractId;
    const [{ value: s }, gap, bal, holder] = await Promise.all([
      v.getState(c), v.getGapBuy(c, acct.id), acct.id ? v.ftBalance(c, acct.id) : Promise.resolve('0'), v.getGapHolder(c),
    ]);
    const p = chain.getSnapshot().params ?? (await v.getParams(c));
    const hold = B(bal);
    const liveT = B(s.t_required);
    const needsBuy = hold < liveT;
    const t = needsBuy ? B(gap.t_required) : liveT;
    const rugFee = B(p.rug_fee);
    const pot = B(s.pot);
    // Printed figures, so what the sheet shows adds up by hand: the take is the pot on screen minus the rug price on screen.
    const net = needsBuy ? shownTake(pot, B(gap.cost) + rugFee) : holder.positive ? B(holder.abs) : -B(holder.abs);
    if (silent && phaseRef.current !== 'locked') return;
    setQ({
      round: s.round_id, pot, t, hold, toBuy: needsBuy ? B(gap.tokens_needed) : 0n, needsBuy,
      deposit: ceilPct(B(gap.deposit_needed), 1n) + 1n, maxBurn: ceilPct(t, 1n), net, rugFee, gap,
    });
    if (!silent || !advancedRef.current) setMinPayoutText(toNearInput(pot > rugFee ? pot - rugFee : 0n));
    setPhase('locked');
  }, [chain, acct.id]);

  useEffect(() => {
    void freeze().catch(() => setPhase('failed'));
  }, [freeze]);

  const liveLen = liveState?.journal_len;
  const quotedLen = useRef(liveLen);
  useEffect(() => {
    if (!inline || liveLen === undefined || quotedLen.current === liveLen) return;
    quotedLen.current = liveLen;
    if (phaseRef.current === 'locked') void freeze(true).catch(() => undefined);
  }, [inline, liveLen, freeze]);

  const potMin = params ? B(params.pot_min) : 0n;
  const belowMin = q ? (q.needsBuy ? !q.gap.feasible : q.pot < potMin) : false; // a buy-then-rug counts its own fee, as the contract does
  // A buy-then-rug takes back the pot plus its own 2%, minus the fee: what you send plus the take, to the same three decimals.
  const send = q?.needsBuy ? shownValue(B(q.gap.deposit_needed)) : 0n;
  const back = !q ? 0n : q.needsBuy ? (send + q.net > 0n ? send + q.net : 0n) : shownValue(q.pot > q.rugFee ? q.pot - q.rugFee : 0n);
  const margin = q?.needsBuy ? shownValue(q.deposit) - send : 0n;
  const zone = liveState && params ? zoneOf(liveState, params, gapBuy) : 'cold';
  const defaultMin = q && q.pot > q.rugFee ? q.pot - q.rugFee : 0n;
  const minPayout = advanced ? (parseUnits(minPayoutText, 24) ?? defaultMin) : defaultMin;
  const needed = q && q.needsBuy ? q.deposit + GAS_RESERVE : GAS_RESERVE;
  const short = q && acct.id && acct.near !== null && acct.near < needed ? needed - acct.near : null;
  const ready = !!q && !!acct.id && !belowMin && short === null && phase === 'locked';
  const loss = q ? q.net < 0n : false;
  const busy = phase === 'signing' || phase === 'sent';
  const lockedLabel = `Locked until ${fmtNear(potMin)} NEAR`;

  const execute = async () => {
    if (!q) return;
    setError('');
    setPhase('signing');
    try {
      const { value: fresh } = await v.getState(chain.contractId);
      if (fresh.round_id !== q.round) {
        onLost({ round: q.round, sent: false });
        return;
      }
      const rug = {
        method: 'rug',
        args: { round_id: q.round, min_payout: minPayout.toString(), max_burn: q.maxBurn.toString() },
        gas: TGAS_100,
        deposit: 1n,
      };
      const calls = q.needsBuy
        ? [{ method: 'buy', args: { min_out: '0' }, gas: TGAS_100, deposit: q.deposit }, rug]
        : [rug];
      const pending = accountStore.send(calls);
      if (acct.kind === 'burner') setPhase('sent');
      const res = await pending;
      setPhase('sent');
      setHash(res.hash);
      if (!res.failure) {
        setPhase('done');
        onWon(res.hash);
        void accountStore.refresh();
        return;
      }
      const code = errorCode(res.failure);
      if (isRaceLost(code)) {
        onLost({ round: q.round, sent: true });
        return;
      }
      if (code === 'E_BURN_ABOVE_MAX') {
        setRequoted(true);
        await freeze();
        return;
      }
      setError(errorText(code, res.failure));
      setPhase('failed');
    } catch (e) {
      if (isUserRejection(e)) setPhase('cancelled');
      else {
        setError(errorText(null, String((e as Error)?.message ?? e)));
        setPhase('failed');
      }
    }
  };

  const setStep = (on: boolean) => {
    setTwoStep(on);
    setArmed(false);
    try {
      localStorage.setItem('acr:two-step', on ? '1' : '0');
    } catch {
      /* preference only */
    }
  };

  return (
    <Sheet testId="rug-sheet" title="Rug it" onClose={onClose} full inline={inline}>
      <div className="rug-hero">
        <Mascot zone={zone} className="rug-hero-art" />
        <p data-testid="rug-title">{!q ? 'Reading the price…' : belowMin ? <>Locked until the pot reaches <b>{fmtNear(potMin)} NEAR</b></> : q.needsBuy ? <>Burn <b>{fmtTokens(q.t)}</b>. Send <b>{fmtNearFixed(send)}</b>, get back <b>{fmtNearFixed(back)}</b>, net <b>{fmtNearSignedFixed(q.net)}</b></> : <>Burn <b>{fmtTokens(q.t)}</b> you hold. Get <b>{fmtNearFixed(back)}</b>, net <b>{fmtNearSignedFixed(q.net)}</b> against selling them</>}</p>
      </div>
      {acct.id ? <AccountLine /> : <BurnerSetup />}
      {q ? (
        <dl className="receipt-list frozen">
          <dt>Coins you must burn</dt><dd data-testid="rug-burn-tokens">{fmtTokens(q.t)}</dd>
          {q.needsBuy ? <><dt>You send</dt><dd data-testid="rug-send">{fmtNearFixed(send)} NEAR</dd></> : <><dt>You hold</dt><dd>{fmtTokens(q.hold)}</dd></>}
          <dt>The take, estimated</dt><dd className={q.net < 0n ? 'neg' : 'pos'} data-testid="rug-net">{fmtNearSignedFixed(q.net)} NEAR</dd>
        </dl>
      ) : (
        <p className="tx-line">Freezing the quote…</p>
      )}
      {q?.needsBuy && margin > 0n ? <p className="margin-note" data-testid="rug-margin">+{fmtNearFixed(margin)} NEAR, a 1% margin: sent too, buys spare coins you keep.</p> : null}
      {q?.needsBuy ? <p className="batch-note">Buy and rug in one transaction. If the rug fails, the buy is undone and your deposit comes back.</p> : null}
      {requoted ? <p className="notice">The price moved, so this is a fresh quote.</p> : null}
      {belowMin && params && !inline ? <p className="notice">The pot needs {fmtNearFixed(potMin)} NEAR before anyone can take it.</p> : null}
      {q && loss && !belowMin ? <p className="notice danger" data-testid="rug-loss-warning">You would lose {fmtNearFixed(-q.net)} NEAR doing this.</p> : null}
      {short !== null ? (
        <p className="notice" data-testid="insufficient">
          You're {fmtNear(short)} NEAR short. <a href="https://near-faucet.io/" target="_blank" rel="noreferrer">Testnet faucet</a>.
        </p>
      ) : null}

      <div className="rug-options">
      <details className="fold-out" open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)} data-testid="rug-advanced">
        <summary>Advanced</summary>
        {q ? (
          <dl className="receipt-list">
            <dt>Round</dt><dd data-testid="rug-round">{q.round}</dd>
            <dt>Pot you see</dt><dd data-testid="rug-pot-seen">{fmtNearFixed(q.pot)} NEAR</dd>
            <dt>You hold</dt><dd>{fmtTokens(q.hold)}</dd>
            <dt>Coins to buy first</dt><dd data-testid="rug-tokens-to-buy">{q.needsBuy ? fmtTokens(q.toBuy) : '0'}</dd>
            <dt>Minimum payout</dt><dd data-testid="rug-min-payout">{fmtNear(minPayout)} NEAR</dd>
            <dd className="note">The floor under which the transaction fails. It is not the expected gain.</dd>
          </dl>
        ) : null}
        <label className="field">
          <span>Minimum payout (NEAR). You can only lower it.</span>
          <input inputMode="decimal" value={minPayoutText} onChange={(e) => setMinPayoutText(e.target.value)} />
        </label>
        {acct.id ? <div className="account-summary rug-account"><AccountActions status="Throwaway account ready" /></div> : null}
      </details>

      <label className="check">
        <input type="checkbox" checked={twoStep} onChange={(e) => setStep(e.target.checked)} data-testid="rug-two-step-toggle" />
        <span>Two-step confirm</span>
      </label>
      </div>

      <TxOutcome phase={busy || phase === 'failed' || phase === 'cancelled' ? phase : ''} hash={hash} error={error} />

      <div className="rug-cta">
        {twoStep ? (
          armed ? (
            <button type="button" className="btn btn-rug btn-submit" data-testid="rug-confirm" disabled={!ready} onClick={() => void execute()}>
              Yes, burn it. Take the pot.
            </button>
          ) : (
            <button type="button" className="btn btn-rug btn-submit" data-testid="rug-hold" disabled={!ready} onClick={() => setArmed(true)}>
              {belowMin ? lockedLabel : loss ? 'Rug it anyway' : 'Rug it'}
            </button>
          )
        ) : (
          <HoldButton testId="rug-hold" label={belowMin ? lockedLabel : loss ? 'Hold to rug anyway' : 'Hold to rug'} disabled={!ready} onDone={() => void execute()} />
        )}
      </div>
    </Sheet>
  );
}
