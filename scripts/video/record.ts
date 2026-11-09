// Demo shoot: the real page, driven by Playwright, filmed frame by frame through the CDP screencast,
// against the dedicated instance film.acr-ops.testnet with real testnet transactions.
// Each take goes to var/video/raw/<take>/ (frames, ffmpeg concat list, marks) and var/video/raw/<take>.mp4.
// Usage: serve web/dist on VIDEO_ORIGIN (default http://localhost:5181), then `node scripts/video/record.ts [take…]`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { CONTRACT, BOT, NEAR, createBurner, deleteBurner, rug, show, snap, untilLive, wash } from './chain.ts';

const ORIGIN = process.env.VIDEO_ORIGIN ?? 'http://localhost:5181';
const ROOT = new URL('../../', import.meta.url).pathname;
const RAW = `${ROOT}var/video/raw`;
const VP = { width: 540, height: 675 };
const DSF = 2;
const STATE = `${ROOT}var/video/burner.json`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log('[video]', ...a);

interface Rec { mark: (m: string) => void; stop: () => Promise<void> }
async function record(page: Page, name: string): Promise<Rec> {
  const dir = `${RAW}/${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames: { file: string; ts: number }[] = [];
  const marks: { name: string; t: number }[] = [];
  let n = 0;
  let last = Date.now();
  cdp.on('Page.screencastFrame', (f) => {
    const file = `f${String(++n).padStart(5, '0')}.jpg`;
    writeFileSync(`${dir}/${file}`, Buffer.from(f.data, 'base64'));
    frames.push({ file, ts: f.metadata.timestamp ?? Date.now() / 1000 });
    last = Date.now();
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const opts = { format: 'jpeg', quality: 92, maxWidth: VP.width * DSF, maxHeight: VP.height * DSF, everyNthFrame: 1 } as const;
  await cdp.send('Page.startScreencast', opts);
  const t0 = Date.now() / 1000;
  let restarting = false;
  // A static page sends no frame; restart the screencast so the timeline stays dense.
  const watchdog = setInterval(() => {
    if (restarting || Date.now() - last < 800) return;
    restarting = true;
    void cdp.send('Page.stopScreencast').then(() => cdp.send('Page.startScreencast', opts)).catch(() => {}).finally(() => { restarting = false; });
  }, 400);
  return {
    mark: (m) => { marks.push({ name: m, t: Date.now() / 1000 - t0 }); log(name, 'mark', m); },
    stop: async () => {
      const tEnd = Date.now() / 1000;
      clearInterval(watchdog);
      await cdp.send('Page.stopScreencast').catch(() => {});
      await cdp.detach().catch(() => {});
      if (!frames.length) throw new Error(`${name}: no frames`);
      const start = Math.min(t0, frames[0]!.ts);
      const lines: string[] = [];
      for (let i = 0; i < frames.length; i++) {
        const from = i === 0 ? start : frames[i]!.ts;
        const to = i + 1 < frames.length ? frames[i + 1]!.ts : tEnd;
        lines.push(`file '${frames[i]!.file}'`, `duration ${Math.max(0.001, to - from).toFixed(4)}`);
      }
      lines.push(`file '${frames.at(-1)!.file}'`);
      writeFileSync(`${dir}/list.txt`, lines.join('\n') + '\n');
      writeFileSync(`${dir}/marks.json`, JSON.stringify({ duration: tEnd - start, offset: t0 - start, marks }, null, 1));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`,
        '-vf', `fps=30,scale=${VP.width * DSF}:${VP.height * DSF}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', `${RAW}/${name}.mp4`]);
      log(name, `${frames.length} frames, ${(tEnd - start).toFixed(1)} s`);
    },
  };
}

/** A visible finger: a soft dot that presses, holds, and ripples out. Purely visual. */
const FINGER = () => {
  (window as unknown as { __tap: (x: number, y: number, hold?: number) => void }).__tap = (x, y, hold = 0) => {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;left:${x - 24}px;top:${y - 24}px;width:48px;height:48px;border-radius:50%;background:rgba(255,248,230,.6);border:3px solid rgba(40,22,14,.8);box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:none;z-index:2147483647`;
    document.documentElement.appendChild(d);
    d.animate([{ transform: 'scale(1.5)', opacity: 0 }, { transform: 'scale(.85)', opacity: 1 }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
    setTimeout(() => {
      const a = d.animate([{ transform: 'scale(.85)', opacity: 1 }, { transform: 'scale(2.1)', opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
      a.onfinish = () => d.remove();
    }, 160 + hold);
  };
};

async function tap(page: Page, testid: string, hold = 0) {
  const el = page.getByTestId(testid).first();
  await el.scrollIntoViewIfNeeded();
  const box = (await el.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(([x, y, h]) => (window as unknown as { __tap: (x: number, y: number, h: number) => void }).__tap(x, y, h), [x, y, hold] as const);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await sleep(hold || 90);
  await page.mouse.up();
}

/** Smooth scroll to an element or a y, at reading speed. */
async function glide(page: Page, to: number | string, ms: number) {
  await page.evaluate(async ([to, ms]) => {
    const target = typeof to === 'number' ? to : (document.querySelector(`[data-testid="${to}"]`)?.getBoundingClientRect().top ?? 0) + scrollY - 110;
    const from = scrollY;
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        scrollTo(0, from + (target - from) * e);
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
  }, [to, ms] as const);
}

async function newPage(instance = 'film') {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: DSF, hasTouch: false, reducedMotion: 'no-preference' });
  await ctx.addInitScript(FINGER);
  // The shoot points the page at the film instance; the other two stay listed so the proof shots read the real ones.
  await ctx.route('**/instances.json', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.default = instance;
    body.instances.film = { contractId: CONTRACT, label: 'FILM INSTANCE', tagline: 'same wasm, for the video', bots: 'A demo bot trades through the public methods only.' };
    await route.fulfill({ response: res, json: body });
  });
  // The page asks the public faucet for a throwaway account. The faucet rate-limits per IP for hours,
  // so the operator creates that same account, with the page's own key and the faucet's 10 NEAR.
  await ctx.route('https://helper.nearprotocol.com/account', async (route) => {
    const { newAccountId, newAccountPublicKey } = route.request().postDataJSON() as { newAccountId: string; newAccountPublicKey: string };
    await createBurner(newAccountId, newAccountPublicKey, 10n * NEAR);
    log('burner', newAccountId);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 160)); });
  return { browser, ctx, page };
}

async function saveBurner(page: Page) {
  const stored = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.includes('burner')).map(([, v]) => v));
  if (stored[0]) writeFileSync(STATE, stored[0], { mode: 0o600 });
}

const takes: Record<string, () => Promise<void>> = {
  /** The landing, read from the top: name, pot, price, then the move-by-move diagram. */
  async landing() {
    const { browser, page } = await newPage('fast');
    await page.goto(`${ORIGIN}/#/`);
    await page.getByTestId('hero').waitFor();
    await sleep(2500);
    const r = await record(page, 'landing');
    await sleep(3500);
    r.mark('scroll');
    await glide(page, 'loop-diagram', 4200);
    await sleep(4000);
    await r.stop();
    await browser.close();
  },
  /** Trades fill the pot until the take turns positive: the corner lifts. */
  async trades() {
    const { browser, page } = await newPage();
    await page.goto(`${ORIGIN}/#/play`);
    await page.getByTestId('pot-value').waitFor();
    await sleep(3000);
    const r = await record(page, 'trades');
    await sleep(2000);
    const s = await untilLive(NEAR / 50n, 2n * NEAR, (s) => { r.mark(`pot ${s.pot}`); log(show(s)); });
    r.mark('live');
    log('live', show(s));
    await sleep(7000);
    await r.stop();
    await browser.close();
  },
  /** A visitor with no wallet takes the pot: Try it, no wallet, hold, climax, poster. */
  async steal() {
    const s0 = await snap();
    if (!(s0.feasible && s0.take > 0n)) await untilLive(NEAR / 50n);
    const { browser, page } = await newPage();
    await page.goto(`${ORIGIN}/#/play`);
    await page.getByTestId('pot-value').waitFor();
    await sleep(3000);
    const r = await record(page, 'steal');
    await sleep(1500);
    await tap(page, 'dock-rug');
    await sleep(1800);
    r.mark('try');
    await tap(page, 'try-no-wallet');
    await page.getByTestId('rug-hold').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('[data-testid="rug-hold"]')?.hasAttribute('disabled'), null, { timeout: 60000 });
    await saveBurner(page);
    await sleep(2500);
    r.mark('hold');
    await tap(page, 'rug-hold', 1900);
    r.mark('sent');
    await page.getByTestId('rug-climax').waitFor({ timeout: 60000 });
    r.mark('climax');
    await page.getByTestId('rug-climax-poster').waitFor({ timeout: 30000 }).catch(() => null);
    await sleep(9000);
    r.mark('poster');
    await r.stop();
    await saveBurner(page);
    await browser.close();
  },
  /** Second try: the visitor holds again, the request is slow, bot-6 rugs first. Real transactions, real refusal. */
  async race() {
    await untilLive(NEAR / 50n);
    const saved = JSON.parse(readFileSync(STATE, 'utf8')) as { id: string; secret: string };
    const { browser, ctx, page } = await newPage();
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`acr:burner:${CONTRACT}`, JSON.stringify(saved)] as const);
    await page.goto(`${ORIGIN}/#/play`);
    await page.getByTestId('pot-value').waitFor();
    // Hold the visitor's transaction at the door until bot-6's rug has landed.
    let botDone: Promise<unknown> | null = null;
    await ctx.route('https://test.rpc.fastnear.com/**', async (route) => {
      const body = route.request().postData() ?? '';
      if (/"method":"(send_tx|broadcast_tx_commit|broadcast_tx_async)"/.test(body) && !botDone) {
        botDone = rug().then((h) => log('bot rug', h));
        await botDone;
        await sleep(1200);
      }
      await route.continue();
    });
    await sleep(3000);
    const r = await record(page, 'race');
    await sleep(1200);
    await tap(page, 'dock-rug');
    await page.getByTestId('rug-hold').waitFor({ timeout: 30000 });
    await sleep(2200);
    r.mark('hold');
    await tap(page, 'rug-hold', 1900);
    await page.getByTestId('race-lost').waitFor({ timeout: 60000 });
    r.mark('lost');
    await sleep(6000);
    await r.stop();
    await browser.close();
  },
  /** The proof: zero keys on the main contract, read live. */
  async keys() {
    const { browser, page } = await newPage('live');
    await page.goto(`${ORIGIN}/?i=live#/proof/rules`);
    await page.getByTestId('access-keys-count').waitFor();
    await sleep(2500);
    const r = await record(page, 'keys');
    await sleep(2000);
    await glide(page, 'access-keys-count', 1500);
    await sleep(5000);
    await r.stop();
    await browser.close();
  },
  /** The simulation section of the landing. */
  async sim() {
    const { browser, page } = await newPage('fast');
    await page.goto(`${ORIGIN}/#/`);
    await page.getByTestId('hero').waitFor();
    await page.getByTestId('sim-hits').waitFor({ state: 'attached', timeout: 20000 });
    await page.evaluate(() => document.querySelector('[data-testid="sim-hits"]')?.scrollIntoView({ block: 'start' }));
    await sleep(2500);
    const r = await record(page, 'sim');
    await sleep(2500);
    await glide(page, (await page.evaluate(() => scrollY)) + 420, 4500);
    await sleep(3000);
    await r.stop();
    await browser.close();
  },
  /** Gives the throwaway account's NEAR back to the operator. */
  async refund() {
    if (!existsSync(STATE)) return log('no burner saved');
    const b = JSON.parse(readFileSync(STATE, 'utf8')) as { id: string; secret: string };
    log('refund', b.id, await deleteBurner(b.id, b.secret));
    rmSync(STATE);
  },
};
void wash;
void BOT;

mkdirSync(RAW, { recursive: true });
const wanted = process.argv.slice(2);
for (const name of wanted.length ? wanted : Object.keys(takes)) {
  if (!takes[name]) throw new Error(`unknown take ${name}`);
  log('take', name);
  await takes[name]!();
}
