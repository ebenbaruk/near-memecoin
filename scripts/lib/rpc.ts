// Minimal read-only NEAR JSON-RPC client, with every query pinned to one block when asked.
export const RPC_URL = process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com';

export async function rpc<T = any>(method: string, params: unknown): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json()) as any;
      if (body.error) throw new Error(JSON.stringify(body.error));
      return body.result as T;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw last;
}

export const finalHeight = async (): Promise<number> =>
  (await rpc<any>('block', { finality: 'final' })).header.height;

export class Pinned {
  constructor(readonly account: string, readonly block: number) {}

  query<T = any>(request: Record<string, unknown>): Promise<T> {
    return rpc<T>('query', { block_id: this.block, account_id: this.account, ...request });
  }

  async view<T = any>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    const r = await this.query<any>({
      request_type: 'call_function',
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    });
    if (r.error) throw new Error(r.error);
    return JSON.parse(Buffer.from(r.result).toString()) as T;
  }
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58(bytes: Uint8Array): string {
  let n = bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}
