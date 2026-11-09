// Monitors the demo: last bot action on the fast instance, bot balances, /healthz. Reads only.
// Tells the owner once per problem, and once when it clears. Run by a user timer on the dev machine.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { finalHeight, Pinned, rpc } from './lib/rpc';

const URL = process.env.DEMO_URL ?? 'https://web-production-69c90.up.railway.app';
const FAST = 'rugfast.acr-ops.testnet';
const BOTS = [1, 2, 3, 4, 5].map((i) => `bot-${i}.acr-bots.testnet`);
const SILENCE_MS = 60 * 60_000;
const MIN_BALANCE = 3n * 10n ** 24n;
const STATE = 'var/watch-state.json';

const problems: string[] = [];
const health = await fetch(`${URL}/healthz`, { signal: AbortSignal.timeout(15_000) }).then((r) => r.json() as Promise<{ ok: boolean; bots: string }>).catch(() => null);
if (!health?.ok) problems.push('demo /healthz is not answering');
else if (health.bots !== 'running') problems.push(`bots state on the server: ${health.bots}`);

const c = new Pinned(FAST, await finalHeight());
const len = await c.view<number>('get_journal_len');
const last = await c.view<{ account: string; ts_ms: number }[]>('get_journal', { from_index: Math.max(0, len - 50), limit: 50 });
const lastBot = last.filter((e) => e.account.endsWith('.acr-bots.testnet')).at(-1);
if (!lastBot) problems.push('no bot action in the last 50 journal entries');
else if (Date.now() - Number(lastBot.ts_ms) > SILENCE_MS) problems.push(`no bot action since ${new Date(Number(lastBot.ts_ms)).toISOString()}`);

for (const id of BOTS) {
  const a = await rpc<{ amount: string }>('query', { request_type: 'view_account', finality: 'final', account_id: id });
  if (BigInt(a.amount) < MIN_BALANCE) problems.push(`${id} is low on NEAR`);
}

mkdirSync('var', { recursive: true });
const before: string[] = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : [];
const fresh = problems.filter((p) => !before.includes(p));
const notify = (m: string) => { try { execFileSync('surface-notify', [m]); } catch { console.error('notify failed'); } };
if (fresh.length) notify(`Anyone Can Rug: ${fresh.join('; ')}`);
if (before.length && !problems.length) notify('Anyone Can Rug: demo and bots are back to normal');
writeFileSync(STATE, JSON.stringify(problems));
console.log(problems.length ? problems.join('\n') : 'ok');
