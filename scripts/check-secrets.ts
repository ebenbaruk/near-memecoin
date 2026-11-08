// Fails if a key or seed appears in a tracked file or anywhere in git history.
import { execSync } from 'node:child_process';

const dash = '-'.repeat(5);
const patterns: [string, RegExp][] = [
  ['private ed25519 key', /ed25519:[1-9A-HJ-NP-Za-km-z]{70,}/],
  ['PEM private key', new RegExp(`${dash}BEGIN [A-Z ]*PRIVATE KEY${dash}`)],
  ['seed phrase value', /seed_phrase["']?\s*[:=]\s*["'][a-z]+( [a-z]+){5,}/],
];
const sh = (cmd: string) => execSync(cmd, { encoding: 'utf8', maxBuffer: 1 << 30 });
const exclude = "':(exclude)fixtures/vectors.json' ':(exclude)package-lock.json'";

let bad = 0;
const tracked = sh('git ls-files').split('\n');
for (const f of tracked) {
  if (f === '.env' || (/(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.env.example'))) {
    console.log(`FAIL  ${f} is tracked`);
    bad++;
  }
}
const sources: [string, string][] = [
  ['working tree', sh(`git grep -I -n -E -e 'ed25519:|PRIVATE KEY|seed_phrase' -- . ${exclude} || true`)],
  ['history', sh(`git log -p --all --format=commit:%h -- . ${exclude}`)],
];
for (const [label, text] of sources) {
  for (const [name, re] of patterns) {
    if (re.test(text)) {
      console.log(`FAIL  ${name} found in ${label}`);
      bad++;
    }
  }
}
console.log(bad ? `${bad} problem(s)` : 'PASS  no secret in tracked files or history');
process.exit(bad ? 1 : 0);
