// Draws the README chart of what really happened on testnet, from the contract journal only.
// Read-only, no key: node scripts/chain-charts.ts  →  docs-assets/chain/history.{svg,png}
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const RPC = process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com';
const OUT = join(import.meta.dirname, '..', 'docs-assets', 'chain');
const FONTS = ['DMMono-Regular.ttf', 'DMMono-Medium.ttf'].map((f) => join(import.meta.dirname, '..', 'sim', 'assets', 'fonts', f));
const C = { ink: '#14160D', cream: '#F6EFDC', rust: '#F0562B', teal: '#0F7B6C', cobalt: '#2457A6', mustard: '#F2C230' };
const FONT = `'DM Mono', 'DejaVu Sans Mono', monospace`;

interface Entry { kind: string; account: string; tokens: string; near: string; supply_after: string; pot_after: string; ts_ms: number }

async function view<T>(contract: string, method: string, args: object): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') } }),
  });
  const body = (await res.json()) as { result?: { result: number[] }; error?: unknown };
  if (!body.result) throw new Error(JSON.stringify(body.error));
  return JSON.parse(Buffer.from(body.result.result).toString()) as T;
}

async function journal(contract: string): Promise<Entry[]> {
  const n = await view<number>(contract, 'get_journal_len', {});
  const all: Entry[] = [];
  for (let i = 0; i < n; i += 100) all.push(...(await view<Entry[]>(contract, 'get_journal', { from_index: i, limit: 100 })));
  return all;
}

const near = (y: string) => Number(BigInt(y) / 10n ** 18n) / 1e6;
const tok = (y: string) => Number(BigInt(y) / 10n ** 18n);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (x: number, y: number, s: string, o: { size?: number; anchor?: string; weight?: number; fill?: string } = {}) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${FONT}" font-size="${o.size ?? 13}" text-anchor="${o.anchor ?? 'start'}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? C.ink}">${esc(s)}</text>`;
const nice = (v: number) => { const m = 10 ** Math.floor(Math.log10(v)); const s = v / m; return (s <= 1 ? 1 : s <= 2 ? 2 : s <= 2.5 ? 2.5 : s <= 5 ? 5 : 10) * m; };

function panel(entries: Entry[], x0: number, y0: number, w: number, h: number, title: string, value: (e: Entry) => number, unit: string, color: string, rugLabels: boolean): string {
  const t0 = entries[0]!.ts_ms;
  const t1 = entries.at(-1)!.ts_ms;
  const yMax = nice(Math.max(...entries.map(value)) * 1.08);
  const X = (t: number) => x0 + ((t - t0) / (t1 - t0)) * w;
  const Y = (v: number) => y0 + h - (v / yMax) * h;
  let s = text(x0, y0 - 14, title, { size: 15, weight: 500 });
  for (let i = 0; i <= 5; i++) {
    const v = (yMax * i) / 5;
    s += `<line x1="${x0}" x2="${x0 + w}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.ink}" stroke-opacity="0.1"/>`;
    s += text(x0 - 8, Y(v) + 4, unit === 'NEAR' ? v.toFixed(1) : `${Math.round(v / 1000)}k`, { size: 11, anchor: 'end' });
  }
  const hours = (t1 - t0) / 3_600_000;
  for (let hh = 0; hh <= hours; hh += 12) s += text(X(t0 + hh * 3_600_000), y0 + h + 22, `+${hh}h`, { size: 11, anchor: 'middle' });
  // Step line: the value holds until the next event.
  let d = `M${X(entries[0]!.ts_ms).toFixed(1)},${Y(value(entries[0]!)).toFixed(1)}`;
  for (let i = 1; i < entries.length; i++) d += ` H${X(entries[i]!.ts_ms).toFixed(1)} V${Y(value(entries[i]!)).toFixed(1)}`;
  d += ` H${X(t1).toFixed(1)}`;
  s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>`;
  let k = 0;
  for (const e of entries) {
    if (e.kind !== 'rug') continue;
    const x = X(e.ts_ms);
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y0}" y2="${y0 + h}" stroke="${C.rust}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
    if (rugLabels) {
      const who = e.account.split('.')[0]!;
      const tag = e.account.endsWith('.acr-bots.testnet') ? `${who} (BOT)` : `${who} (test script)`;
      const left = x > x0 + w - 220;
      const lx = left ? x - 6 : x + 6;
      const anchor = left ? 'end' : 'start';
      const ly = y0 + 14 + (k++ % 3) * 30;
      s += text(lx, ly, `rug: ${tag}`, { size: 11, fill: C.rust, weight: 500, anchor });
      s += text(lx, ly + 14, `took ${near(e.near).toFixed(3)} NEAR`, { size: 11, fill: C.rust, anchor });
    }
  }
  return s;
}

const contract = process.argv[2] ?? 'rugfast.acr-ops.testnet';
const entries = await journal(contract);
const W = 1200;
const H = 640;
const rugs = entries.filter((e) => e.kind === 'rug').length;
const bots = entries.filter((e) => e.account.endsWith('.acr-bots.testnet')).length;
let body = `<rect width="${W}" height="${H}" fill="${C.cream}"/>`;
body += text(24, 38, `What happened on ${contract}`, { size: 22, weight: 500 });
body += text(24, 62, `Read from get_journal: ${entries.length} entries, ${rugs} rugs, ${bots} by labelled bots. ${new Date(entries[0]!.ts_ms).toISOString().slice(0, 10)} to ${new Date(entries.at(-1)!.ts_ms).toISOString().slice(0, 10)} UTC.`, { size: 13 });
body += panel(entries, 80, 120, W - 120, 210, 'Pot (NEAR): every trade adds 2 %, a rug empties it', (e) => near(e.pot_after), 'NEAR', C.teal, true);
body += panel(entries, 80, 400, W - 120, 170, 'Supply ($RUGFAST): buys mint, sells and rugs burn', (e) => tok(e.supply_after), 'tokens', C.cobalt, false);
body += text(24, H - 14, 'Testnet tokens, no value. Activity is mostly demo bots calling public methods.', { size: 12 });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">${body}</svg>\n`;
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'history.svg'), svg);
writeFileSync(join(OUT, 'history.png'), new Resvg(svg, { fitTo: { mode: 'width', value: 2 * W }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'DM Mono' } }).render().asPng());
console.log(`docs-assets/chain/history.png: ${entries.length} entries, ${rugs} rugs`);
