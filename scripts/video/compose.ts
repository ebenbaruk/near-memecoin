// Edit of the demo video from the takes in var/video/raw/ (scripts/video/record.ts) and the narration in var/video/audio/.
// Each shot lasts as long as its narration line (measured with ffprobe). Captions, frame, cards: HTML rendered by Chromium.
// Outputs in docs-assets/video/: rug-demo-portrait.mp4 (1080x1350), rug-demo.mp4 (1920x1080), rug-loop.mp4, thumbnail.png.
// Usage: node scripts/video/compose.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

const ROOT = new URL('../../', import.meta.url).pathname;
const RAW = `${ROOT}var/video/raw`;
const AUD = `${ROOT}var/video/audio`;
const TMP = `${ROOT}var/video/tmp`;
const OUT = `${ROOT}docs-assets/video`;
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
const ff = (args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const probe = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const marks = (take: string) => Object.fromEntries((JSON.parse(readFileSync(`${RAW}/${take}/marks.json`, 'utf8')).marks as { name: string; t: number }[]).map((m) => [m.name, m.t]));
const W = 1080;
const H = 1350;
const FPS = 30;

/** A piece of a take: [from, to] seconds of the take, played at `speed`. */
interface Seg { take: string; from: number; to: number; speed?: number }
interface Shot { id: string; segs: Seg[]; title: string; sub?: string; card?: 'terminal' | 'end'; cardFrom?: number; sfx?: { at: number | 'end'; name: string }[] }

const st = marks('steal');
const rc = marks('race');
const tr = marks('trades');
const SHOTS: Shot[] = [
  { id: 's1', segs: [{ take: 'trades', from: Math.max(0, tr.live - 3.2), to: tr.live + 3 }], title: 'Anyone can steal this pot', sfx: [{ at: 1.2, name: 'lift' }] },
  { id: 's2', segs: [{ take: 'landing', from: 0.3, to: 3.6 }, { take: 'trades', from: 0.5, to: 4.5 }], title: 'Steal this pot.', sub: 'A pot. A price. No team. No permission.' },
  { id: 's3', segs: [{ take: 'landing', from: 3.6, to: 9.5, speed: 1.15 }, { take: 'trades', from: 4.5, to: tr.live + 4, speed: 1.4 }], title: '2% per trade → the pot', sub: 'Burn 5% of the supply → take all of it', sfx: [{ at: 'end', name: 'lift' }] },
  {
    id: 's4',
    segs: [
      { take: 'steal', from: 1.2, to: st.try + 0.4, speed: 1.5 },
      { take: 'steal', from: st.try + 0.4, to: st.hold - 0.6, speed: 4 },
      { take: 'steal', from: st.hold - 0.6, to: st.sent + 0.3 },
      { take: 'steal', from: st.sent + 0.3, to: st.climax, speed: 2 },
      { take: 'steal', from: st.climax, to: st.climax + 8 },
    ],
    title: 'Real testnet tx', sub: 'No wallet. Hold. Your name on the Wall.',
    sfx: [{ at: (st.try + 0.4 - 1.2) / 1.5 + (st.hold - 1 - st.try) / 4 + (st.sent + 0.9 - st.hold) + (st.climax - st.sent - 0.3) / 2, name: 'rug' }],
  },
  { id: 's5', segs: [{ take: 'keys', from: 1.5, to: 8.4 }], title: '0 access keys', sub: 'Nobody can change the rules. Check it.', card: 'terminal', cardFrom: 0.55 },
  { id: 's6', segs: [{ take: 'sim', from: 1, to: 10 }], title: 'Bots and whales probably win', sub: '60 days simulated before the parameters were fixed' },
  { id: 's7', segs: [{ take: 'race', from: rc.hold - 0.6, to: rc.lost + 4 }], title: 'Too slow.', sub: 'bot-6 rugged first. The page sent nothing.', card: 'end', cardFrom: 0.72, sfx: [{ at: 1.9, name: 'fail' }] },
];

const font = (f: string) => `file://${ROOT}node_modules/${f}`;
const CSS = `
@font-face{font-family:Bagel;src:url(${font('@fontsource/bagel-fat-one/files/bagel-fat-one-latin-400-normal.woff2')})}
@font-face{font-family:Inst;src:url(${font('@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2')});font-weight:100 900}
@font-face{font-family:Mono;src:url(${font('@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2')})}
*{margin:0;box-sizing:border-box} html,body{background:transparent;overflow:hidden}
.bg{position:absolute;inset:0;background:#f0562b repeating-linear-gradient(90deg, rgb(20 22 13 / .08) 0 2px, transparent 2px 5px)}
.fr{position:absolute;left:0;right:0;height:56px;background:url(${ROOT}web/public/art/decor/fringe-strip.webp) repeat-x center/auto 100%}
h1{font-family:Bagel;color:#f6efdc;line-height:.95;letter-spacing:-.01em;-webkit-text-stroke:0;text-shadow:0 6px 0 #3a1d0e}
p{font-family:Inst;font-weight:650;color:#f6efdc}
.tag{display:inline-block;background:#f2c230;color:#14160d;font-family:Mono;padding:6px 14px;border:3px solid #14160d}
`;

async function render(html: string, w: number, h: number, out: string, transparent = true) {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: w, height: h } });
  writeFileSync(`${TMP}/card.html`, `<!doctype html><meta charset="utf-8"><style>${CSS}</style><body>${html}</body>`);
  await p.goto(`file://${TMP}/card.html`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  await p.screenshot({ path: out, omitBackground: transparent });
  await b.close();
}

// Portrait layout: caption band at the top, the page below it at 86 %, on the woven rust ground.
const K = 0.86;
const PW = Math.round(W * K / 2) * 2;
const PH = Math.round(H * K / 2) * 2;
const PX = (W - PW) / 2;
const PY = H - PH - 16;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function cards() {
  await render(`<div class="bg"></div><div class="fr" style="bottom:-22px;opacity:.9"></div><div style="position:absolute;left:${PX - 8}px;top:${PY - 8}px;width:${PW + 16}px;height:${PH + 16}px;background:#14160d;border-radius:6px"></div>`, W, H, `${TMP}/bg-portrait.png`, false);
  for (const s of SHOTS) {
    const big = s.title.length > 22 ? 64 : 80;
    await render(`<div style="position:absolute;left:40px;right:40px;top:${s.sub ? 26 : 44}px;text-align:center"><h1 style="font-size:${big}px">${esc(s.title)}</h1>${s.sub ? `<p style="font-size:32px;margin-top:10px">${esc(s.sub)}</p>` : ''}</div>`, W, H, `${TMP}/cap-${s.id}.png`);
  }
  // The real output of `npm run verify` on a fresh clone without .env (2026-11-09).
  const lines = [
    'PASS  live: account has zero access keys  (0 keys)',
    'PASS  live: code hash equals committed wasm',
    'PASS  live: get_params equals the init file',
    'PASS  live: journal replays to ft_total_supply',
    'PASS  live: journal replays to the pot',
    'PASS  live: contract is solvent',
    'PASS  60-day simulation, quick run',
    '',
    '33 passed, 0 failed, 0 skipped',
  ];
  await render(`<div style="position:absolute;left:${PX + 40}px;right:${PX + 40}px;top:${PY + 330}px;background:#14160d;border:4px solid #f6efdc;box-shadow:12px 12px 0 #3a1d0e;padding:30px 30px 34px;font-family:Mono;font-size:25px;line-height:1.55;color:#f6efdc">
    <div style="color:#f2c230;margin-bottom:14px">$ npm ci &amp;&amp; npm run verify</div>
    ${lines.map((l) => `<div>${l.startsWith('PASS') ? `<span style="color:#7fd3a8">PASS</span>${esc(l.slice(4))}` : l ? `<b style="color:#f2c230">${esc(l)}</b>` : '&nbsp;'}</div>`).join('')}
  </div>`, W, H, `${TMP}/card-terminal.png`);
  await render(`<div class="bg"></div><div class="fr" style="top:-22px;transform:scaleY(-1)"></div><div class="fr" style="bottom:-22px"></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center;padding:0 60px">
      <img src="${ROOT}web/public/art/landing/getaway-1000.webp" style="width:760px">
      <h1 style="font-size:118px">Anyone Can Rug</h1>
      <p style="font-size:38px">Every coin has a rug price. This one prints it.</p>
      <span class="tag" style="font-size:28px">Built at NEAR HACKATHON · testnet · github.com/ebenbaruk/near-memecoin</span>
    </div>`, W, H, `${TMP}/card-end.png`, false);
  // Landscape ground: the portrait master in a pillar, the caption on the left, the token on the right.
  await render(`<div class="bg"></div><div class="fr" style="bottom:-22px"></div><div class="fr" style="top:-22px;transform:scaleY(-1)"></div>
    <div style="position:absolute;left:60px;top:80px;width:400px;display:flex;flex-direction:column;gap:26px">
      <img src="${ROOT}web/public/art/brand/wordmark.webp" style="width:360px">
      <p style="font-size:34px;line-height:1.15">A memecoin with a public, priced rug.</p>
      <span class="tag" style="font-size:22px;align-self:flex-start">NEAR testnet · zero admin keys</span>
    </div>
    <img src="${ROOT}web/public/art/landing/thief-run-800.webp" style="position:absolute;right:40px;bottom:60px;width:560px">
    <div style="position:absolute;left:${(1920 - 864) / 2 - 8}px;top:0;width:${864 + 16}px;height:1080px;background:#14160d"></div>`, 1920, 1080, `${TMP}/bg-land.png`, false);
  await render(`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:40px;background:#14160d">
      <img src="${ROOT}web/public/art/landing/thief-reach-800.webp" style="width:520px">
      <div style="width:640px"><h1 style="font-size:120px">Anyone Can Rug</h1><p style="font-size:40px;margin-top:20px">The pot is public. So is its price.</p><p style="font-size:30px;margin-top:22px;color:#f2c230;font-family:Mono">NEAR testnet · zero admin keys</p></div>
    </div>`, 1280, 720, `${OUT}/thumbnail.png`, false);
}

/** One shot: segments joined, fitted to the narration, framed, captioned. */
function shot(s: Shot, dur: number) {
  const ins: string[] = [];
  const parts: string[] = [];
  s.segs.forEach((g, i) => {
    ins.push('-ss', String(g.from), '-t', String(g.to - g.from), '-i', `${RAW}/${g.take}.mp4`);
    parts.push(`[${i}:v]setpts=(PTS-STARTPTS)/${g.speed ?? 1},fps=${FPS},scale=${PW}:${PH}:flags=lanczos,setsar=1[p${i}]`);
  });
  const n = s.segs.length;
  const iBg = n;
  const iCap = n + 1;
  ins.push('-loop', '1', '-i', `${TMP}/bg-portrait.png`, '-loop', '1', '-i', `${TMP}/cap-${s.id}.png`);
  let f = `${parts.join(';')};${s.segs.map((_, i) => `[p${i}]`).join('')}concat=n=${n}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${dur}[pg];`;
  f += `[${iBg}:v][pg]overlay=${PX}:${PY}:shortest=0[a];[a][${iCap}:v]overlay=0:0`;
  if (s.card) {
    ins.push('-loop', '1', '-i', `${TMP}/card-${s.card}.png`);
    const t0 = (dur * (s.cardFrom ?? 0.5)).toFixed(2);
    f += `[b];[${n + 2}:v]format=rgba,fade=in:st=${t0}:d=0.35:alpha=1[c];[b][c]overlay=0:0`;
  }
  f += `,trim=duration=${dur},format=yuv420p[v]`;
  ff([...ins, '-filter_complex', f, '-map', '[v]', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-t', String(dur), `${TMP}/${s.id}.mp4`]);
}

await cards();
const PAD = 0.45;
const timeline: { id: string; start: number; dur: number }[] = [];
let t = 0;
for (const s of SHOTS) {
  const a = `${AUD}/${s.id}.wav`;
  if (!existsSync(a)) throw new Error(`missing ${a}`);
  const dur = +(probe(a) + PAD + (s.id === 's7' ? 3.2 : s.id === 's4' ? 4.2 : 0)).toFixed(3);
  shot(s, dur);
  timeline.push({ id: s.id, start: t, dur });
  t += dur;
}
const TOTAL = +t.toFixed(3);
writeFileSync(`${TMP}/list.txt`, SHOTS.map((s) => `file '${TMP}/${s.id}.mp4'`).join('\n') + '\n');
ff(['-f', 'concat', '-safe', '0', '-i', `${TMP}/list.txt`, '-c', 'copy', `${TMP}/picture.mp4`]);

// Narration placed at the start of each shot (+0.15 s), music under it, effects at their marks.
const sfx: { t: number; type: string; gain: number }[] = [];
for (const s of SHOTS) {
  const at = timeline.find((x) => x.id === s.id)!;
  for (const e of s.sfx ?? []) sfx.push({ t: +(at.start + (e.at === "end" ? at.dur - 0.5 : e.at)).toFixed(2), type: e.name, gain: 1 });
}
writeFileSync(`${TMP}/sfx.json`, JSON.stringify(sfx));
execFileSync('node', [`${ROOT}scripts/video/music.ts`, `${TMP}/music.wav`, String(TOTAL + 1), `${TMP}/sfx.json`], { stdio: 'inherit' });
const vIns = SHOTS.flatMap((s) => ['-i', `${AUD}/${s.id}.wav`]);
const delays = SHOTS.map((s, i) => `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round((timeline[i]!.start + 0.15) * 1000)}:all=1[n${i}]`).join(';');
const mix = `${delays};${SHOTS.map((_, i) => `[n${i}]`).join('')}amix=inputs=${SHOTS.length}:normalize=0,apad=whole_dur=${TOTAL},asplit=2[voice][voicek];`
  + `[0:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.55[mus];[mus][voicek]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck];`
  + `[duck][voice]amix=inputs=2:normalize=0,atrim=duration=${TOTAL},loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
ff(['-i', `${TMP}/music.wav`, ...vIns, '-filter_complex', mix, '-map', '[a]', '-c:a', 'pcm_s16le', `${TMP}/sound.wav`]);

const enc = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];
ff(['-i', `${TMP}/picture.mp4`, '-i', `${TMP}/sound.wav`, '-map', '0:v', '-map', '1:a', ...enc, '-shortest', `${OUT}/rug-demo-portrait.mp4`]);
ff(['-loop', '1', '-i', `${TMP}/bg-land.png`, '-i', `${OUT}/rug-demo-portrait.mp4`, '-filter_complex', `[1:v]scale=864:1080:flags=lanczos[p];[0:v][p]overlay=(W-w)/2:0:shortest=1,format=yuv420p[v]`, '-map', '[v]', '-map', '1:a', ...enc, '-t', String(TOTAL), `${OUT}/rug-demo.mp4`]);
// Six-second loop: the steal, from the hold to the poster.
const s4 = timeline.find((x) => x.id === 's4')!;
ff(['-ss', String(s4.start + s4.dur - 6.2), '-t', '6', '-i', `${OUT}/rug-demo-portrait.mp4`, '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${OUT}/rug-loop.mp4`]);
writeFileSync(`${TMP}/timeline.json`, JSON.stringify({ total: TOTAL, timeline }, null, 1));
console.log(`total ${TOTAL.toFixed(1)} s`, timeline.map((x) => `${x.id} ${x.start.toFixed(1)}+${x.dur.toFixed(1)}`).join(' | '));
