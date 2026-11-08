// Validates var/submission.json and prints it. Sends it only with --send, once.
// Without --send this script never touches the network.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import 'dotenv/config';

const PATH = 'var/submission.json';
const SENT = 'var/submitted';
const API = 'https://nearhackathon.com/api/applications';
const DEADLINE = Date.UTC(2026, 10, 14, 23, 59, 0);
const FIELDS = ['requestId', 'projectName', 'leadName', 'email', 'size', 'tracks', 'nearAddress', 'projectUrl', 'demoUrl', 'idea', 'consent'];
const NEAR_ADDRESS = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Payload = Record<string, unknown> & { tracks: string[]; idea: string; projectUrl: string; demoUrl: string };

function validate(p: Payload): string[] {
  const e: string[] = [];
  for (const k of Object.keys(p)) if (!FIELDS.includes(k)) e.push(`unexpected field: ${k}`);
  for (const k of FIELDS) if (p[k] === undefined) e.push(`missing field: ${k}`);
  const str = (k: string, min: number, max: number) => {
    const v = p[k];
    if (typeof v !== 'string' || v.length < min || v.length > max) e.push(`${k}: expected ${min}-${max} characters`);
  };
  if (typeof p.requestId !== 'string' || !UUID.test(p.requestId)) e.push('requestId: expected a lowercase UUID');
  str('projectName', 2, 80); str('leadName', 2, 80); str('email', 3, 160); str('idea', 20, 2000);
  str('projectUrl', 8, 300); str('demoUrl', 8, 300);
  if (p.size !== '1') e.push('size: this project is solo, expected "1"');
  if (JSON.stringify(p.tracks) !== '["memecoins"]') e.push('tracks: expected ["memecoins"]');
  const near = String(p.nearAddress ?? '');
  if (near.length < 2 || near.length > 64 || !NEAR_ADDRESS.test(near)) e.push('nearAddress: invalid format');
  if (near.endsWith('.testnet')) e.push('nearAddress: must be a mainnet account');
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(p.projectUrl ?? '')) e.push('projectUrl: expected a GitHub repository URL');
  if (!/^https:\/\/(www\.)?(x|twitter)\.com\//.test(p.demoUrl ?? '')) e.push('demoUrl: expected a post on x.com');
  if (p.consent !== true) e.push('consent: must be true, set only after the human accepted the contact notice');
  if (Buffer.byteLength(JSON.stringify(p)) > 12000) e.push('body: over 12000 bytes');
  return e;
}

async function preflight(p: Payload): Promise<string[]> {
  const e: string[] = [];
  if (existsSync(SENT)) e.push(`${SENT} exists: already submitted, use https://nearhackathon.com/request-changes`);
  if (Date.now() > DEADLINE) e.push('deadline passed');
  const anon = await fetch(p.projectUrl, { redirect: 'manual' }).catch(() => null);
  if (anon?.status !== 200) e.push(`repository is not public (anonymous GET: ${anon?.status ?? 'no answer'})`);
  const post = await fetch(p.demoUrl, { redirect: 'follow' }).catch(() => null);
  if (!post || post.status >= 400) e.push(`demo post does not answer (${post?.status ?? 'no answer'})`);
  return e;
}

const payload = JSON.parse(readFileSync(PATH, 'utf8')) as Payload;
payload.email = process.env.SUBMIT_EMAIL ?? payload.email;
const problems = validate(payload);
console.log(JSON.stringify(payload, null, 2));
if (problems.length) {
  console.error(`\nINVALID:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('\nvalid.');
if (!process.argv.includes('--send')) {
  console.log('Dry run: nothing was sent.');
  process.exit(0);
}

const blocked = await preflight(payload);
if (blocked.length) {
  console.error(`\nNOT SENT:\n- ${blocked.join('\n- ')}`);
  process.exit(1);
}

// One attempt. A network error or a 503 is retried by rerunning this script: requestId stays the same.
const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
const body = await res.text();
console.log(`\nHTTP ${res.status}\n${body}`);
if (res.status === 201) {
  writeFileSync(SENT, `${new Date().toISOString()}\n${body}\n`);
  console.log('Saved. Further changes go through https://nearhackathon.com/request-changes only.');
  process.exit(0);
}
process.exit(1);
