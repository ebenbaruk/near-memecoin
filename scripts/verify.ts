// One command for a judge: `npm ci && npm run verify`. No secret needed, nothing is signed.
// Prints PASS / FAIL / SKIP per step and exits non-zero on any FAIL. A SKIP is never reported as a pass.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { checkInstance, instanceList } from './verify-chain.ts';
import { finalHeight } from './lib/rpc.ts';

type Status = 'PASS' | 'FAIL' | 'SKIP';
const rows: { step: string; status: Status; note: string }[] = [];
const quick = process.argv.includes('--no-e2e');

function record(step: string, status: Status, note = '') {
  rows.push({ step, status, note });
  console.log(`${status}  ${step}${note ? `  (${note})` : ''}`);
}

function run(cmd: string, args: string[]): { ok: boolean; tail: string; seconds: number } {
  const started = Date.now();
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, CI: '1' } });
  const tail = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n').slice(-12).join('\n');
  return { ok: r.status === 0, tail, seconds: Math.round((Date.now() - started) / 1000) };
}

function step(name: string, cmd: string, args: string[]) {
  const r = run(cmd, args);
  record(name, r.ok ? 'PASS' : 'FAIL', `${r.seconds}s`);
  if (!r.ok) console.log(r.tail);
}

const has = (bin: string) => spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0;
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

step('TypeScript typecheck (sim)', 'npm', ['run', '-s', '-w', 'sim', 'typecheck']);
step('TypeScript unit tests (rules, invariants, determinism)', 'npm', ['run', '-s', '-w', 'sim', 'test']);

if (has('cargo')) {
  step('Rust contract tests (unit, property, shared vectors)', 'cargo', ['test', '-p', 'anyone-can-rug']);
} else {
  record('Rust contract tests', 'SKIP', 'cargo not installed');
}

const vectors = 'fixtures/vectors.json';
const before = sha(vectors);
const regen = run('npm', ['run', '-s', 'sim', '--', 'vectors', '--seed', '1']);
const same = regen.ok && sha(vectors) === before;
record('Shared vectors regenerate byte for byte', same ? 'PASS' : 'FAIL', `${regen.seconds}s`);
if (!same) console.log(regen.tail);

step('Page builds', 'npm', ['run', '-s', '-w', 'web', 'build']);

if (quick) {
  record('Playwright smoke on fixtures', 'SKIP', '--no-e2e');
} else if (existsSync('playwright.config.ts')) {
  step('Playwright smoke on fixtures, 390x844', 'npx', ['playwright', 'test', '--grep', 'first visit|journal: filled|rules: zero keys|static checks']);
} else {
  record('Playwright smoke on fixtures', 'SKIP', 'no playwright.config.ts');
}

let online = true;
try {
  await finalHeight();
} catch {
  online = false;
}
if (!online) {
  record('Testnet checks (keys, code hash, params, journal replay)', 'SKIP', 'no network');
} else {
  for (const t of instanceList()) {
    try {
      const checks = await checkInstance(t.contract, t.init, { keys: true });
      for (const c of checks) record(`${t.key}: ${c.name}`, c.ok ? 'PASS' : 'FAIL', c.detail);
    } catch (e) {
      record(`${t.key}: testnet checks on ${t.contract}`, 'FAIL', String(e).slice(0, 160));
    }
  }
}

step('60-day simulation, quick run', 'npm', ['run', '-s', 'sim', '--', '--quick']);

const count = (s: Status) => rows.filter((r) => r.status === s).length;
console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`);
if (count('SKIP')) console.log('Skipped steps were NOT verified.');
process.exit(count('FAIL') ? 1 : 0);
