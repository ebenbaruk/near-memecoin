import { fmtNear, fmtTokens, shortAccount } from '../format/near';
import { useAccount, useApp } from '../hooks/context';

export function BurnerSetup() {
  const { account } = useApp();
  const acct = useAccount();
  return (
    <div className="burner-setup">
      <button type="button" className="btn btn-try" data-testid="try-no-wallet" disabled={acct.creating} onClick={() => void account.createBurner()}>
        {acct.creating ? 'Asking the faucet…' : 'Try it, no wallet'}
      </button>
      <button type="button" className="btn btn-ghost" data-testid="wallet-connect" onClick={() => void account.connectWallet()}>Connect a wallet</button>
      {acct.faucetError ? (
        <div className="notice" data-testid="faucet-error" role="status">
          <p><strong>Faucet is busy.</strong>{acct.faucetError.retry ? ` Try again in ${acct.faucetError.retry}.` : ''}</p>
          <p>Connect a wallet instead. The rest of the page keeps working.</p>
        </div>
      ) : null}
      {acct.walletError ? <p className="notice">{acct.walletError}</p> : null}
      <p className="fine-print">A throwaway account is created by the public testnet faucet and funded with 10 test NEAR.</p>
    </div>
  );
}

/** Who is playing, on one line. */
export function AccountLine() {
  const acct = useAccount();
  if (!acct.id) return null;
  return (
    <p className="account-line mono">
      <span data-testid="account-id" title={acct.id}>{shortAccount(acct.id, 22)}</span>
      {' · '}
      <span data-testid="account-balance">{acct.near === null ? '…' : `${fmtNear(acct.near)} NEAR`} · {fmtTokens(acct.tokens)} tokens</span>
    </p>
  );
}

/** What can be done with the account: kept out of the way on the screen where every pixel is for the rug. */
export function AccountActions({ status }: { status: string }) {
  const { account } = useApp();
  const acct = useAccount();
  if (!acct.id) return null;
  return acct.kind === 'burner' ? (
    <>
      <p className="burner-status" data-testid="burner-status">{status}</p>
      <p className="fine-print">This is a throwaway testnet key stored in this browser. Don't put anything real here.</p>
      <button type="button" className="btn btn-ghost" data-testid="burner-forget" onClick={account.forget}>Forget this account</button>
    </>
  ) : (
    <button type="button" className="btn btn-ghost" onClick={() => void account.disconnectWallet()}>Disconnect</button>
  );
}

export function AccountSummary() {
  const acct = useAccount();
  if (!acct.id) return null;
  return (
    <div className="account-summary">
      <AccountLine />
      <AccountActions status={`Free account ready: ${acct.near === null ? '…' : `${fmtNear(acct.near, 0)} test NEAR`}`} />
    </div>
  );
}

export function AccountPanel() {
  const acct = useAccount();
  return (
    <section className="account-panel" aria-label="Your account">
      {acct.id ? <AccountSummary /> : <BurnerSetup />}
    </section>
  );
}
