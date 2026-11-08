// Production entry: serves web/dist and runs the bots as a child process.
// If the bots crash the page stays up and /healthz stays 200. The page reads the chain directly,
// so this server is a convenience, not part of the mechanic.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const ROOT = resolve(import.meta.dirname, '../web/dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4',
};
const CSP = [
  "default-src 'self'", "img-src 'self' data: blob:", "style-src 'self' 'unsafe-inline'", "script-src 'self'", "font-src 'self'",
  "connect-src 'self' https://test.rpc.fastnear.com https://rpc.testnet.near.org https://archival-rpc.testnet.fastnear.com https://tx.test.fastnear.com https://helper.nearprotocol.com https: wss:",
  "frame-src https:",
].join('; ');

createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  if (path === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, bots: botState }));
    return;
  }
  let file = join(ROOT, normalize(decodeURIComponent(path)));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html');
  const hashed = file.includes('/assets/');
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'content-security-policy': CSP,
    'x-content-type-options': 'nosniff',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`page on :${PORT}`));

let botState = 'off';
function startBots() {
  if (process.env.BOTS_ENABLED === '0' || !process.env.BOT_ACCOUNTS) return;
  botState = 'running';
  const child = spawn('npx', ['tsx', 'src/run.ts'], { cwd: import.meta.dirname, stdio: 'inherit', env: process.env });
  child.on('exit', (code) => {
    botState = `exited ${code}`;
    console.log(`bots exited with ${code}, restarting in 60s`);
    setTimeout(startBots, 60_000);
  });
}
startBots();
