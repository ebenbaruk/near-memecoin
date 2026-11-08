// The visitor's account: a throwaway burner key in this browser, or a NEAR Connect wallet.
import { B } from '../format/near';
import { burnerSend, newBurnerKey, walletConnect, walletDisconnect, walletRestore, walletSend, type Call, type TxResult } from './signer';
import { ftBalance, spendable, viewAccount } from './views';

export interface AccountSnapshot {
  kind: 'none' | 'burner' | 'wallet';
  id: string | null;
  near: bigint | null;
  tokens: bigint;
  creating: boolean;
  faucetError: { retry: string | null } | null;
  walletError: string | null;
}

interface StoredBurner { id: string; secret: string }

const FAUCET_URL = 'https://helper.nearprotocol.com/account';
const WALLET_FLAG = 'acr:wallet';

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function retryHint(body: string): string | null {
  const m = /retry in ([^".]+)/i.exec(body);
  return m ? m[1].trim() : null;
}

export class AccountStore {
  private snap: AccountSnapshot = { kind: 'none', id: null, near: null, tokens: 0n, creating: false, faucetError: null, walletError: null };
  private listeners = new Set<() => void>();
  private secret: string | null = null;

  constructor(private readonly contractId: string, private readonly onAccount: (id: string | null) => void) {
    this.restore();
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = () => this.snap;
  private set(p: Partial<AccountSnapshot>) {
    this.snap = { ...this.snap, ...p };
    this.listeners.forEach((l) => l());
  }

  private key() {
    return `acr:burner:${this.contractId}`;
  }

  private restore() {
    try {
      const raw = localStorage.getItem(this.key());
      if (raw) {
        const b = JSON.parse(raw) as StoredBurner;
        this.secret = b.secret;
        this.set({ kind: 'burner', id: b.id });
        this.onAccount(b.id);
        void this.refresh();
        return;
      }
      if (localStorage.getItem(WALLET_FLAG)) {
        void walletRestore().then((id) => {
          if (id) {
            this.set({ kind: 'wallet', id });
            this.onAccount(id);
            void this.refresh();
          }
        }).catch(() => undefined);
      }
    } catch {
      /* storage blocked: start with no account */
    }
  }

  refresh = async () => {
    const { id } = this.snap;
    if (!id) return;
    try {
      const [acct, tokens] = await Promise.all([viewAccount(id), ftBalance(this.contractId, id)]);
      this.set({ near: acct ? spendable(acct) : 0n, tokens: B(tokens) });
    } catch {
      /* the next successful poll fills it in */
    }
  };

  createBurner = async () => {
    if (this.snap.creating) return;
    this.set({ creating: true, faucetError: null });
    try {
      const { publicKey, secret } = await newBurnerKey();
      const id = `rugger-${randomHex(4)}.testnet`;
      const res = await fetch(FAUCET_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newAccountId: id, newAccountPublicKey: publicKey }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const retry = retryHint(await res.text().catch(() => ''));
        this.set({ creating: false, faucetError: { retry } });
        return;
      }
      this.secret = secret;
      try {
        localStorage.setItem(this.key(), JSON.stringify({ id, secret } satisfies StoredBurner));
      } catch {
        /* still usable for this session */
      }
      this.set({ kind: 'burner', id, creating: false, faucetError: null, near: null });
      this.onAccount(id);
      await this.waitFunded();
    } catch {
      this.set({ creating: false, faucetError: { retry: null } });
    }
  };

  private async waitFunded() {
    for (let i = 0; i < 12; i++) {
      await this.refresh();
      if (this.snap.near && this.snap.near > 0n) return;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  forget = () => {
    try {
      localStorage.removeItem(this.key());
    } catch {
      /* nothing stored */
    }
    this.secret = null;
    this.set({ kind: 'none', id: null, near: null, tokens: 0n, faucetError: null });
    this.onAccount(null);
  };

  connectWallet = async () => {
    this.set({ walletError: null });
    try {
      const id = await walletConnect();
      try {
        localStorage.setItem(WALLET_FLAG, '1');
      } catch {
        /* reconnects next time */
      }
      this.set({ kind: 'wallet', id, walletError: null });
      this.onAccount(id);
      void this.refresh();
    } catch (e) {
      const text = String((e as Error)?.message ?? e);
      if (!/reject|cancel|closed/i.test(text)) this.set({ walletError: 'Could not reach a wallet. The rest of the page keeps working.' });
    }
  };

  disconnectWallet = async () => {
    await walletDisconnect().catch(() => undefined);
    try {
      localStorage.removeItem(WALLET_FLAG);
    } catch {
      /* nothing stored */
    }
    this.set({ kind: 'none', id: null, near: null, tokens: 0n });
    this.onAccount(null);
  };

  send = (calls: Call[]): Promise<TxResult> => {
    const { kind, id } = this.snap;
    if (kind === 'burner' && id && this.secret) return burnerSend(id, this.secret, this.contractId, calls);
    if (kind === 'wallet') return walletSend(this.contractId, calls);
    throw new Error('No account connected.');
  };
}
