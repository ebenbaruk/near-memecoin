// JSON-RPC over fetch, with silent failover through the public testnet endpoints.
export const RPC_URLS = [
  'https://test.rpc.fastnear.com',
  'https://rpc.testnet.near.org',
  'https://archival-rpc.testnet.fastnear.com',
];

export class ChainDownError extends Error {
  constructor() {
    super('all RPC endpoints failed');
  }
}

/** The endpoint answered, and the answer is an error about this query (no such account, no code). */
export class QueryError extends Error {
  constructor(message: string, readonly cause_: string) {
    super(message);
  }
}

let cursor = 0;
export const rpcIndex = () => cursor;
export const currentRpc = () => RPC_URLS[cursor];

const QUERY_FAILURES = ['UNKNOWN_ACCOUNT', 'NO_CONTRACT_CODE', 'CONTRACT_EXECUTION_ERROR', 'UNKNOWN_ACCESS_KEY'];

export async function rpc<T>(method: string, params: unknown): Promise<T> {
  for (let i = 0; i < RPC_URLS.length; i++) {
    const idx = (cursor + i) % RPC_URLS.length;
    try {
      const res = await fetch(RPC_URLS[idx], {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        result?: T & { error?: string };
        error?: { cause?: { name?: string }; message?: string; data?: unknown };
      };
      if (body.error) {
        const name = body.error.cause?.name ?? '';
        if (QUERY_FAILURES.includes(name)) throw new QueryError(body.error.message ?? name, name);
        throw new Error(name || body.error.message || 'rpc error');
      }
      if (body.result && typeof body.result === 'object' && 'error' in body.result && body.result.error) {
        const text = String(body.result.error);
        const name = text.includes('does not exist') || text.includes('UnknownAccount')
          ? 'UNKNOWN_ACCOUNT'
          : text.includes('CodeDoesNotExist') || text.includes('NoContractCode')
            ? 'NO_CONTRACT_CODE'
            : 'CONTRACT_EXECUTION_ERROR';
        throw new QueryError(text, name);
      }
      cursor = idx;
      return body.result as T;
    } catch (e) {
      if (e instanceof QueryError) throw e;
    }
  }
  throw new ChainDownError();
}
