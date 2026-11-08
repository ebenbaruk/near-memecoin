// Everything that signs is loaded on demand: the first paint needs neither library.
import { currentRpc } from './rpc';

export interface Call { method: string; args: object; gas: bigint; deposit: bigint }
export interface TxResult { hash: string; failure: unknown | null; logs: string[] }

export const TGAS_100 = 100n * 10n ** 12n;

interface Outcome {
  status: { Failure?: unknown; SuccessValue?: string } | string;
  transaction_outcome: { id: string };
  receipts_outcome: { outcome: { logs: string[] } }[];
}

function toResult(r: Outcome): TxResult {
  const failure = typeof r.status === 'object' ? (r.status.Failure ?? null) : null;
  return { hash: r.transaction_outcome.id, failure, logs: r.receipts_outcome.flatMap((o) => o.outcome.logs) };
}

export async function newBurnerKey(): Promise<{ publicKey: string; secret: string }> {
  const { KeyPair } = await import('near-api-js');
  const key = KeyPair.fromRandom('ed25519');
  return { publicKey: key.getPublicKey().toString(), secret: key.toString() };
}

export async function burnerSend(accountId: string, secret: string, receiverId: string, calls: Call[]): Promise<TxResult> {
  const { Account, JsonRpcProvider, KeyPairSigner, actions } = await import('near-api-js');
  const provider = new JsonRpcProvider({ url: currentRpc() });
  const account = new Account(accountId, provider, KeyPairSigner.fromSecretKey(secret as `ed25519:${string}`));
  const res = await account.signAndSendTransaction({
    receiverId,
    actions: calls.map((c) => actions.functionCall(c.method, c.args as Record<string, unknown>, c.gas, c.deposit)),
    waitUntil: 'EXECUTED_OPTIMISTIC',
    throwOnFailure: false,
  });
  return toResult(res as unknown as Outcome);
}

// ---- NEAR Connect wallets
type NearConnectorT = import('@hot-labs/near-connect').NearConnector;
let connector: NearConnectorT | null = null;

async function getConnector(): Promise<NearConnectorT> {
  if (!connector) {
    const { NearConnector } = await import('@hot-labs/near-connect');
    connector = new NearConnector({ network: 'testnet' });
  }
  return connector;
}

export async function walletConnect(): Promise<string> {
  const c = await getConnector();
  const wallet = await c.connect();
  const accounts = await wallet.getAccounts({ network: 'testnet' });
  if (!accounts[0]) throw new Error('No account in the wallet.');
  return accounts[0].accountId;
}

export async function walletRestore(): Promise<string | null> {
  const c = await getConnector();
  try {
    const { accounts } = await c.getConnectedWallet();
    return accounts[0]?.accountId ?? null;
  } catch {
    return null;
  }
}

export async function walletDisconnect(): Promise<void> {
  if (connector) await connector.disconnect();
}

export async function walletSend(receiverId: string, calls: Call[]): Promise<TxResult> {
  const c = await getConnector();
  const { wallet } = await c.getConnectedWallet();
  const res = await wallet.signAndSendTransaction({
    network: 'testnet',
    receiverId,
    actions: calls.map((call) => ({
      type: 'FunctionCall' as const,
      params: { methodName: call.method, args: call.args as Record<string, unknown>, gas: call.gas.toString(), deposit: call.deposit.toString() },
    })),
  });
  return toResult(res as unknown as Outcome);
}
