// Soundtrack for the demo video. Synthesizes an original heist/caper loop from scratch (no samples,
// no dependencies): walking upright bass, muted plucked chords, brushed drums and a soft vibraphone
// line in D minor at 104 BPM, plus optional sound effects placed by time.
//
// usage: node scripts/video/music.ts out.wav <seconds> [sfx.json] [--gain dB] [--seed n] [--no-music]
//   --gain shifts the whole render; --no-music renders the sound effects alone (a separate stem).
//
// sfx.json: [{ "t": 12.4, "type": "lift" | "rug" | "fail" | "tick", "gain": 1 }, ...]
//   lift = rising whoosh, rug = cloth rip + coin cascade, fail = descending two-note sting,
//   tick = small click. "gain" is optional (linear, default 1). Output: 44.1 kHz 16-bit stereo WAV.
import { readFileSync, writeFileSync } from 'node:fs';

type Sig = Float32Array;
type SfxType = 'lift' | 'rug' | 'fail' | 'tick';
type Sfx = { t: number; type: SfxType; gain: number };
type Chord = { root: number; third: number; sev: number; voicing: number[] };

const SR = 44100;
const BPM = 104;
const BEAT = 60 / BPM;
const BAR = 4 * BEAT;
const SWING = 0.6; // where the off-beat eighth lands inside a beat
const MASTER_DB = -7.3; // calibrated so the music alone measures about -20 LUFS integrated
const SFX_DB = 6; // sound effects sit a little above the bed
const TAU = 2 * Math.PI;

// ---------- args ----------
const args = process.argv.slice(2);
function flag(name: string, def: number): number {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = Number(args[i + 1]);
  args.splice(i, 2);
  return v;
}
const gainDb = flag('--gain', 0);
const seed = flag('--seed', 7);
const noMusic = args.includes('--no-music');
if (noMusic) args.splice(args.indexOf('--no-music'), 1);
const [outPath, secondsArg, sfxPath] = args;
const seconds = Number(secondsArg);
if (!outPath || !(seconds > 0)) {
  console.error('usage: node scripts/video/music.ts out.wav <seconds> [sfx.json] [--gain dB] [--seed n] [--no-music]');
  process.exit(1);
}

// ---------- helpers ----------
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(seed);
const between = (a: number, b: number) => a + (b - a) * rand();
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const dbToGain = (db: number) => 10 ** (db / 20);

function noise(len: number): Sig {
  const s = new Float32Array(len);
  for (let i = 0; i < len; i++) s[i] = rand() * 2 - 1;
  return s;
}

/** RBJ biquad, applied in place. */
function biquad(x: Sig, kind: 'lp' | 'hp' | 'bp', f: number, q = 0.707): Sig {
  const w = (TAU * Math.min(f, SR * 0.45)) / SR;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0 = al, b1 = 0, b2 = -al;
  if (kind === 'lp') { b1 = 1 - c; b0 = b1 / 2; b2 = b0; }
  if (kind === 'hp') { b1 = -(1 + c); b0 = (1 + c) / 2; b2 = b0; }
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    x[i] = y0;
  }
  return x;
}

/** State-variable filter whose cutoff can move every sample (used for sweeps). */
function svf(x: Sig, cutoff: (i: number) => number, q: number, mode: 'lp' | 'bp' | 'hp'): Sig {
  const out = new Float32Array(x.length);
  const k = 1 / q;
  let ic1 = 0, ic2 = 0;
  for (let i = 0; i < x.length; i++) {
    const g = Math.tan((Math.PI * Math.min(cutoff(i), SR * 0.45)) / SR);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    out[i] = mode === 'lp' ? v2 : mode === 'bp' ? v1 : x[i] - k * v1 - v2;
  }
  return out;
}

// ---------- mix bus ----------
const n = Math.ceil(seconds * SR);
const L = new Float32Array(n);
const R = new Float32Array(n);
const send = new Float32Array(n); // mono reverb send

function place(sig: Sig, t: number, gain: number, pan = 0, rev = 0): void {
  const start = Math.round(t * SR);
  const a = ((pan + 1) * Math.PI) / 4;
  const gl = Math.cos(a) * gain * Math.SQRT2;
  const gr = Math.sin(a) * gain * Math.SQRT2;
  for (let i = 0; i < sig.length; i++) {
    const j = start + i;
    if (j < 0) continue;
    if (j >= n) break;
    const v = sig[i];
    L[j] += v * gl;
    R[j] += v * gr;
    send[j] += v * gain * rev;
  }
}

// ---------- instruments ----------
/** Upright bass: plucked-string partials, upper ones fading faster, plus a soft finger thump. */
function upright(f: number, dur: number, vel: number): Sig {
  const len = Math.ceil((dur + 0.2) * SR);
  const out = new Float32Array(len);
  const amps = [1, 0.5, 0.28, 0.14, 0.07, 0.035];
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let v = 0;
    for (let k = 0; k < amps.length; k++) {
      const fk = f * (k + 1);
      if (fk > 4000) break;
      v += amps[k] * Math.sin(TAU * fk * t) * Math.exp(-t * (2 + k * 2.6));
    }
    const att = Math.min(1, t / 0.007);
    const rel = t > dur ? Math.exp(-(t - dur) / 0.04) : 1;
    out[i] = Math.tanh(1.2 * v * att * rel) * vel;
  }
  const thump = biquad(noise(Math.round(0.03 * SR)), 'lp', 600);
  for (let i = 0; i < thump.length; i++) out[i] += thump[i] * 0.25 * vel * Math.exp((-i / SR) * 120);
  return out;
}

/** Muted plucked string (Karplus-Strong), damped and darkened. */
function pluck(f: number, dur: number, vel: number, bright = 0.45): Sig {
  const N = Math.max(2, Math.round(SR / f - 0.5));
  const buf = new Float32Array(N);
  let p = 0, mean = 0;
  for (let j = 0; j < N; j++) { p += (rand() * 2 - 1 - p) * bright; buf[j] = p; mean += p; }
  mean /= N;
  for (let j = 0; j < N; j++) buf[j] -= mean;
  const len = Math.ceil((dur + 0.08) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const idx = i % N;
    out[i] = buf[idx];
    buf[idx] = 0.996 * 0.5 * (buf[idx] + buf[(idx + 1) % N]);
    const t = i / SR;
    const rel = t > dur ? Math.exp(-(t - dur) / 0.02) : 1;
    out[i] *= Math.exp(-t * 7) * rel * vel * 1.6;
  }
  return biquad(out, 'lp', 2600, 0.6);
}

/** Soft vibraphone: sine with a faint 4th partial and motor tremolo. */
function vibes(f: number, dur: number, vel: number): Sig {
  const len = Math.ceil((dur + 1.2) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const att = Math.min(1, t / 0.004);
    const rel = t > dur ? Math.exp(-(t - dur) / 0.35) : 1;
    const trem = 1 - 0.18 * (0.5 + 0.5 * Math.sin(TAU * 5.2 * t));
    const v = Math.sin(TAU * f * t) * Math.exp(-t * 1.4) + 0.16 * Math.sin(TAU * 3.98 * f * t) * Math.exp(-t * 9);
    out[i] = v * att * rel * trem * vel;
  }
  return out;
}

function kick(vel: number): Sig {
  const len = Math.round(0.32 * SR);
  const out = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    ph += (TAU * (46 + 70 * Math.exp(-t * 32))) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 11) * Math.min(1, t / 0.002) * vel;
  }
  return out;
}

/** Cross-stick on the rim: two damped tones and a click. */
function rim(vel: number): Sig {
  const len = Math.round(0.09 * SR);
  const click = biquad(noise(len), 'bp', 3200, 1.2);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    out[i] = (0.45 * Math.sin(TAU * 1650 * t) * Math.exp(-t * 95) +
      0.4 * Math.sin(TAU * 780 * t) * Math.exp(-t * 70) +
      0.5 * click[i] * Math.exp(-t * 140)) * vel;
  }
  return out;
}

/** Brushed hi-hat: high band noise, short. */
function hat(vel: number, decay: number): Sig {
  const len = Math.round(Math.min(0.4, 6 / decay) * SR);
  const s = biquad(biquad(noise(len), 'hp', 6500), 'lp', 10500);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    s[i] *= Math.exp(-t * decay) * Math.min(1, t / 0.003) * vel;
  }
  return s;
}

// ---------- harmony and parts ----------
const DM: Chord = { root: 38, third: 3, sev: 10, voicing: [57, 60, 65] };
const GM: Chord = { root: 43, third: 3, sev: 10, voicing: [58, 62, 65] };
const BB7: Chord = { root: 46, third: 4, sev: 10, voicing: [56, 62, 65] };
const A7: Chord = { root: 45, third: 4, sev: 10, voicing: [55, 61, 64] };
const PROG = [DM, DM, GM, DM, BB7, A7, DM, A7];

/** Beat position inside a bar, with swung off-beats (x.5 becomes x + SWING). */
const at = (bar: number, pos: number) => {
  const beat = Math.floor(pos);
  const frac = pos - beat;
  return bar * BAR + (beat + (Math.abs(frac - 0.5) < 1e-6 ? SWING : frac)) * BEAT;
};
const human = () => between(-0.006, 0.006);

// Sneaky vibraphone line, 8 bars: [position in beats, midi, length in beats].
const MELODY: [number, number, number][][] = [
  [[1.5, 69, 0.4], [2, 70, 0.4], [2.5, 69, 0.4], [3, 65, 0.9]],
  [[0.5, 62, 0.4], [1, 64, 0.4], [1.5, 65, 0.4], [2, 64, 0.4], [2.5, 61, 1.2]],
  [[1.5, 70, 0.4], [2, 72, 0.4], [2.5, 70, 0.4], [3, 67, 0.9]],
  [[0.5, 65, 0.4], [1, 64, 0.4], [1.5, 62, 1.6]],
  [[1.5, 65, 0.4], [2, 68, 0.4], [2.5, 70, 0.4], [3, 74, 0.9]],
  [[0, 73, 0.9], [1, 70, 0.4], [1.5, 69, 0.4], [2, 67, 0.4], [2.5, 64, 0.4], [3, 61, 0.9]],
  [[0, 62, 1.8], [2.5, 69, 0.4], [3, 68, 0.4], [3.5, 67, 0.4]],
  [[0, 64, 0.4], [1, 61, 0.4], [2, 57, 1.5]],
];

const BASS_SHAPES = [[0, 'third', 7], [0, 7, 'sev'], [0, -2, -5], [0, 2, 'third'], [0, 12, 7]] as const;

let lastShape = -1;
function walk(bar: number, c: Chord, next: Chord): void {
  const target = next.root + (bar % 2 ? 1 : -1); // chromatic approach into the next bar
  let best = 0, bestCost = Infinity;
  BASS_SHAPES.forEach((shape, si) => {
    const s3 = shape[2];
    const last = c.root + (s3 === 'third' ? c.third : s3 === 'sev' ? c.sev : s3);
    const cost = Math.abs(last - target) + (si === lastShape ? 4 : 0) + rand() * 3;
    if (cost < bestCost) { bestCost = cost; best = si; }
  });
  lastShape = best;
  const notes = BASS_SHAPES[best].map((s) => c.root + (s === 'third' ? c.third : s === 'sev' ? c.sev : s));
  notes.push(target);
  notes.forEach((m, beat) => {
    place(upright(hz(m), BEAT * 0.9, beat === 0 ? 1 : between(0.78, 0.9)), at(bar, beat) + human(), 0.5, 0, 0.05);
  });
  if (bar % 2 === 1) {
    place(upright(hz(notes[2]), BEAT * 0.18, 0.35), at(bar, 2.5) + human(), 0.5, 0, 0.03); // ghost skip note
  }
}

function comp(bar: number, c: Chord): void {
  for (const pos of [1.5, 3.5]) {
    c.voicing.forEach((m, k) => {
      place(pluck(hz(m), BEAT * 0.22, between(0.75, 1)), at(bar, pos) + k * 0.007 + human(), 0.2, 0.35, 0.18);
    });
  }
  if (bar % 4 === 2) place(pluck(hz(c.voicing[2] + 12), BEAT * 0.2, 0.7), at(bar, 3), 0.08, 0.5, 0.25);
}

function drums(bar: number, intro: boolean): void {
  if (!intro) {
    place(kick(1), at(bar, 0), 0.32, 0, 0);
    place(kick(0.8), at(bar, 2), 0.28, 0, 0);
  }
  for (const b of [1, 3]) place(rim(between(0.8, 1)), at(bar, b) + human(), 0.3, -0.15, 0.12);
  for (let e = 0; e < 8; e++) {
    const pos = e / 2;
    const off = e % 2 === 1;
    place(hat(off ? between(0.8, 1) : between(0.4, 0.55), off ? 45 : 70), at(bar, pos) + human(), 0.42, 0.3, 0.05);
  }
  if (bar % 8 === 7 && !intro) { // little fill into the next phrase
    place(rim(0.7), at(bar, 3.5), 0.16, -0.15, 0.12);
    place(kick(0.6), at(bar, 3.5), 0.22, 0, 0);
  }
}

const bars = Math.ceil(seconds / BAR) + 1;
for (let b = 0; b < bars && !noMusic; b++) {
  const c = PROG[b % 8];
  const next = PROG[(b + 1) % 8];
  const intro = b < 2;
  walk(b, c, next);
  drums(b, intro);
  if (!intro) comp(b, c);
  if (Math.floor(b / 8) % 2 === 1) {
    for (const [pos, m, len] of MELODY[b % 8]) {
      place(vibes(hz(m), len * BEAT, between(0.8, 1)), at(b, pos) + human(), 0.085, -0.25, 0.35);
    }
  }
}

// ---------- sound effects ----------
function sfxLift(t: number, gain: number): void {
  const len = Math.round(1.8 * SR);
  const env = (i: number) => {
    const x = i / len;
    return x < 0.88 ? (x / 0.88) ** 2.2 : Math.exp(-(x - 0.88) * 30);
  };
  const sweep = (i: number) => 250 * 20 ** (i / len);
  for (const pan of [-0.6, 0.6]) {
    const s = svf(noise(len), sweep, 1.6, 'bp');
    for (let i = 0; i < len; i++) s[i] *= env(i);
    place(s, t, 0.35 * gain, pan, 0.25);
  }
  const tone = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    ph += (TAU * 220 * 4 ** (i / len)) / SR;
    tone[i] = Math.sin(ph) * env(i);
  }
  place(tone, t, 0.05 * gain, 0, 0.3);
}

function sfxRug(t: number, gain: number): void {
  // Cloth rip: crackly band of noise sweeping up, made of tiny random grains.
  const rl = Math.round(0.42 * SR);
  const rip = svf(noise(rl), (i) => 1400 + 2600 * (i / rl), 0.9, 'bp');
  const body = biquad(noise(rl), 'lp', 900);
  let grain = 1;
  for (let i = 0; i < rl; i++) {
    if (i % Math.round(0.005 * SR) === 0) grain = between(0.25, 1);
    const x = i / rl;
    const env = Math.min(1, x / 0.04) * (1 - x) ** 1.5;
    rip[i] = (rip[i] * grain * 1.6 + body[i] * 0.5) * env;
  }
  place(rip, t, 1.1 * gain, 0, 0.15);
  // A soft thud as the rug lands.
  const th = new Float32Array(Math.round(0.3 * SR));
  for (let i = 0; i < th.length; i++) {
    const tt = i / SR;
    th[i] = Math.sin(TAU * (60 + 40 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 14);
  }
  place(th, t + 0.32, 0.4 * gain, 0, 0.05);
  // Coin cascade: inharmonic metallic pings, each bouncing a few times, thinning out.
  const coins = 26;
  for (let c = 0; c < coins; c++) {
    const start = t + 0.28 + 1.5 * rand() ** 1.8;
    const f = between(2300, 4600);
    const pan = between(-0.7, 0.7);
    const level = 0.25 * (1 - (start - t) / 2.2) * between(0.6, 1);
    let bt = start, bl = level, gap = between(0.07, 0.12);
    for (let b = 0; b < 3; b++) {
      place(coinPing(f * between(0.99, 1.01)), bt, bl * gain, pan, 0.3);
      bt += gap; gap *= 0.6; bl *= 0.5;
    }
  }
}

function coinPing(f: number): Sig {
  const len = Math.round(0.3 * SR);
  const out = new Float32Array(len);
  const parts: [number, number, number][] = [[1, 1, 28], [2.76, 0.45, 45], [5.4, 0.2, 70]];
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let v = 0;
    for (const [r, a, d] of parts) if (f * r < 15000) v += a * Math.sin(TAU * f * r * t) * Math.exp(-t * d);
    out[i] = v * Math.min(1, t / 0.0015);
  }
  return biquad(out, 'lp', 7500);
}

/** Muted-brass "wah... wahh": band-limited saw with a closing brightness. */
function sfxFail(t: number, gain: number): void {
  const notes: [number, number, number][] = [[0, 62, 0.3], [0.36, 56, 0.85]];
  for (const [dt, m, dur] of notes) {
    const f0 = hz(m);
    const len = Math.round((dur + 0.15) * SR);
    const out = new Float32Array(len);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / SR;
      const vib = dur > 0.5 ? 1 + 0.012 * Math.sin(TAU * 5.5 * tt) * Math.min(1, tt / 0.25) : 1;
      const droop = dur > 0.5 ? 1 - 0.03 * Math.max(0, (tt - dur * 0.6) / (dur * 0.4)) : 1;
      ph += (TAU * f0 * vib * droop) / SR;
      const bright = 0.35 + 0.35 * Math.exp(-tt * 4);
      let v = 0;
      for (let k = 1; k <= 12; k++) v += (bright ** (k - 1) / k) * Math.sin(k * ph);
      const att = Math.min(1, tt / 0.025);
      const rel = tt > dur ? Math.exp(-(tt - dur) / 0.06) : 1;
      out[i] = v * att * rel;
    }
    place(out, t + dt, 0.17 * gain, 0, 0.2);
  }
}

function sfxTick(t: number, gain: number): void {
  const len = Math.round(0.03 * SR);
  const hi = biquad(noise(len), 'hp', 4000);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    out[i] = 0.6 * Math.sin(TAU * 2900 * tt) * Math.exp(-tt * 260) +
      0.4 * Math.sin(TAU * 1250 * tt) * Math.exp(-tt * 180) + 0.25 * hi[i] * Math.exp(-tt * 500);
  }
  place(out, t, 0.42 * gain, 0, 0.05);
}

const SFX: Record<SfxType, (t: number, gain: number) => void> = { lift: sfxLift, rug: sfxRug, fail: sfxFail, tick: sfxTick };

if (sfxPath) {
  const raw = JSON.parse(readFileSync(sfxPath, 'utf8')) as unknown;
  const list = (Array.isArray(raw) ? raw : (raw as { events?: unknown[] }).events ?? []) as Partial<Sfx & { time: number }>[];
  for (const e of list) {
    const t = Number(e.t ?? e.time);
    if (!e.type || !(e.type in SFX) || !Number.isFinite(t)) {
      console.error(`skipping bad sfx entry: ${JSON.stringify(e)}`);
      continue;
    }
    SFX[e.type](t, (e.gain ?? 1) * dbToGain(SFX_DB));
  }
}

// ---------- reverb (small Freeverb-style room) ----------
function room(inp: Sig, spread: number): Sig {
  const out = new Float32Array(inp.length);
  for (const d0 of [1116, 1188, 1277, 1356, 1422, 1491]) {
    const d = d0 + spread;
    const buf = new Float32Array(d);
    let idx = 0, lp = 0;
    for (let i = 0; i < inp.length; i++) {
      const y = buf[idx];
      lp = y * 0.62 + lp * 0.38;
      buf[idx] = inp[i] * 0.02 + lp * 0.8;
      out[i] += y;
      if (++idx === d) idx = 0;
    }
  }
  for (const d0 of [556, 441, 341, 225]) {
    const d = d0 + spread;
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < out.length; i++) {
      const b = buf[idx];
      buf[idx] = out[i] + b * 0.5;
      out[i] = b - out[i];
      if (++idx === d) idx = 0;
    }
  }
  return out;
}
const wetL = room(send, 0);
const wetR = room(send, 23);

// ---------- master: sum, clean the lows, soft limit, fades ----------
const master = dbToGain(MASTER_DB + gainDb);
for (let i = 0; i < n; i++) { L[i] += wetL[i] * 0.9; R[i] += wetR[i] * 0.9; }
biquad(L, 'hp', 28); biquad(R, 'hp', 28);
const soft = (x: number) => {
  const T = 0.7, a = Math.abs(x);
  return a <= T ? x : Math.sign(x) * (T + (1 - T) * Math.tanh((a - T) / (1 - T)));
};
const fadeIn = 0.15 * SR, fadeOut = Math.min(2.5, seconds / 4) * SR;
const pcm = Buffer.alloc(44 + n * 4);
for (let i = 0; i < n; i++) {
  const g = master * Math.min(1, i / fadeIn) * Math.min(1, (n - i) / fadeOut);
  for (const [ch, buf] of [[0, L], [1, R]] as const) {
    const dither = (rand() - rand()) / 32768;
    const v = Math.max(-1, Math.min(1, soft(buf[i] * g) + dither));
    pcm.writeInt16LE(Math.round(v * 32767), 44 + i * 4 + ch * 2);
  }
}
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 4, 4); pcm.write('WAVE', 8);
pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(n * 4, 40);
writeFileSync(outPath, pcm);
console.log(`wrote ${outPath}: ${seconds}s, ${noMusic ? 'no music' : `${BPM} BPM`}, ${sfxPath ? 'with' : 'no'} sfx`);
