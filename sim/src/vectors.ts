// Shared test vectors (spec §2): generated from rules.ts, replayed by this package and by the Rust contract tests.
import { readFileSync, writeFileSync } from "node:fs";
import {
  BPS, ONE, X_MAX, burned, buy, ceilDiv, gapBuy, gapHolder, newCore, r, rug, sell, tRequired,
  type Core, type ErrorCode, type GapBuyView, type GapView, type Params,
} from "./rules.ts";
import { fork, type Rng } from "./rng.ts";
import { JOURNAL_FEE, MIN_BUY, REG_MIN, RUG_FEE } from "./params.ts";

export type Op = "buy" | "sell" | "rug" | "transfer" | "buy_rug";
type Args = Record<string, string>;

export interface Step {
  op: Op;
  actor: string;
  args: Args;
  expect: {
    ok: boolean;
    error: ErrorCode | null;
    returned: string | null;
    state: Record<string, string>;
    balance: Record<string, string>;
    gap_buy: Record<string, string | boolean>;
    gap_holder: Record<string, string | boolean>;
  };
}
export interface Sequence {
  id: string;
  params: Record<string, string | number>;
  steps: Step[];
}
export interface VectorFile {
  version: number;
  sequences: Sequence[];
}

export function paramsToJson(p: Params): Record<string, string | number> {
  return {
    tau_bps: Number(p.tau_bps),
    fee_bps: Number(p.fee_bps),
    hwm_floor_bps: Number(p.hwm_floor_bps),
    pot_min: p.pot_min.toString(),
    min_buy: p.min_buy.toString(),
    journal_fee: p.journal_fee.toString(),
    rug_fee: p.rug_fee.toString(),
    reg_min: p.reg_min.toString(),
    p0: p.p0.toString(),
    a: p.a.toString(),
  };
}

export function paramsFromJson(j: Record<string, string | number>): Params {
  return {
    tau_bps: BigInt(j.tau_bps),
    fee_bps: BigInt(j.fee_bps),
    hwm_floor_bps: BigInt(j.hwm_floor_bps),
    pot_min: BigInt(j.pot_min),
    min_buy: BigInt(j.min_buy),
    journal_fee: BigInt(j.journal_fee),
    rug_fee: BigInt(j.rug_fee),
    reg_min: BigInt(j.reg_min),
    p0: BigInt(j.p0),
    a: BigInt(j.a),
  };
}

const gapJson = (g: GapView): Record<string, string | boolean> => ({
  feasible: g.feasible,
  positive: g.positive,
  abs: g.abs.toString(),
  tokens_needed: g.tokens_needed.toString(),
  t_required: g.t_required.toString(),
  pot: g.pot.toString(),
});
const gapBuyJson = (g: GapBuyView): Record<string, string | boolean> => ({
  ...gapJson(g),
  deposit_needed: g.deposit_needed.toString(),
  min_out: g.min_out.toString(),
  cost: g.cost.toString(),
});

/** Minimal in-memory contract used to generate and to replay sequences. */
export class VectorMachine {
  core: Core = newCore();
  balances = new Map<string, bigint>();
  registered = new Set<string>();
  seen = new Set<string>();

  constructor(readonly p: Params) {}

  bal(a: string): bigint {
    return this.balances.get(a) ?? 0n;
  }

  private doBuy(actor: string, deposit: bigint, minOut: bigint): { error: ErrorCode } | { minted: bigint } {
    const o = buy(this.core, this.p, deposit, this.registered.has(actor), minOut);
    if (!o.ok) return { error: o.error };
    this.core = o.core;
    this.balances.set(actor, this.bal(actor) + o.minted);
    this.registered.add(actor);
    return { minted: o.minted };
  }

  private doRug(actor: string, round: bigint, minPayout: bigint, maxBurn: bigint): { error: ErrorCode } | { payout: bigint } {
    const o = rug(this.core, this.p, this.bal(actor), round, minPayout, maxBurn);
    if (!o.ok) return { error: o.error };
    this.core = o.core;
    this.balances.set(actor, this.bal(actor) - o.burned);
    return { payout: o.payout };
  }

  apply(op: Op, actor: string, args: Args): Step {
    this.seen.add(actor);
    if (op === "transfer") this.seen.add(args.to);
    let ok = false;
    let error: ErrorCode | null = null;
    let returned: string | null = null;
    switch (op) {
      case "buy": {
        const res = this.doBuy(actor, BigInt(args.deposit), BigInt(args.min_out));
        if ("error" in res) error = res.error;
        else { ok = true; returned = res.minted.toString(); }
        break;
      }
      case "sell": {
        const o = sell(this.core, this.p, this.bal(actor), BigInt(args.amount), BigInt(args.min_out));
        if (!o.ok) error = o.error;
        else {
          this.core = o.core;
          this.balances.set(actor, this.bal(actor) - BigInt(args.amount));
          ok = true;
          returned = o.payout.toString();
        }
        break;
      }
      case "rug": {
        const res = this.doRug(actor, BigInt(args.round), BigInt(args.min_payout), BigInt(args.max_burn));
        if ("error" in res) error = res.error;
        else { ok = true; returned = res.payout.toString(); }
        break;
      }
      case "transfer": {
        const amount = BigInt(args.amount);
        this.balances.set(actor, this.bal(actor) - amount);
        this.balances.set(args.to, this.bal(args.to) + amount);
        ok = true;
        break;
      }
      case "buy_rug": {
        const snapshot = {
          core: this.core,
          balances: new Map(this.balances),
          registered: new Set(this.registered),
        };
        const bought = this.doBuy(actor, BigInt(args.deposit), BigInt(args.min_out));
        if ("error" in bought) {
          error = bought.error;
          break;
        }
        const res = this.doRug(actor, BigInt(args.round), BigInt(args.min_payout), BigInt(args.max_burn));
        if ("error" in res) {
          this.core = snapshot.core;
          this.balances = snapshot.balances;
          this.registered = snapshot.registered;
          error = res.error;
        } else {
          ok = true;
          returned = res.payout.toString();
        }
        break;
      }
    }
    const c = this.core;
    const balance: Record<string, string> = {};
    for (const a of [...this.seen].sort()) balance[a] = this.bal(a).toString();
    return {
      op,
      actor,
      args,
      expect: {
        ok,
        error,
        returned,
        state: {
          x: c.x.toString(),
          S: c.S.toString(),
          B: burned(c).toString(),
          R: c.R.toString(),
          pot: c.pot.toString(),
          hwm: c.hwm.toString(),
          T: tRequired(c, this.p).toString(),
          round: c.round.toString(),
        },
        balance,
        gap_buy: gapBuyJson(gapBuy(c, this.p, this.bal(actor), this.registered.has(actor))),
        gap_holder: gapJson(gapHolder(c, this.p)),
      },
    };
  }
}

const HUGE = 10n ** 38n;

/**
 * x^f for f in [0, 1), from the bits of f and repeated square roots. Math.log and Math.exp may differ in the
 * last bit between CPUs (ARM64 and x86 gave different vectors); sqrt, * and / are correctly rounded IEEE 754
 * operations, so this gives the same double everywhere and the vectors regenerate byte for byte on any machine.
 */
function powFrac(x: number, f: number): number {
  let out = 1;
  let root = x;
  for (let i = 0; i < 40; i++) {
    root = Math.sqrt(root);
    f *= 2;
    if (f >= 1) {
      out *= root;
      f -= 1;
    }
  }
  return out;
}

function logUniform(rng: Rng, low: bigint, high: bigint): bigint {
  const lo = Number(low);
  const v = BigInt(Math.round(lo * powFrac(Number(high) / lo, rng.next())));
  return v < low ? low : v > high ? high : v;
}

function randomParams(rng: Rng): Params {
  const journal_fee = logUniform(rng, 10n ** 20n, 10n ** 22n);
  const rug_fee = logUniform(rng, 10n ** 20n, 2n * 10n ** 22n);
  return {
    p0: logUniform(rng, 10n ** 16n, 10n ** 25n),
    a: logUniform(rng, 10n ** 9n, 10n ** 20n),
    fee_bps: BigInt(1 + Math.floor(rng.next() * 1000)),
    tau_bps: BigInt(1 + Math.floor(rng.next() * 5000)),
    hwm_floor_bps: 9000n,
    pot_min: rug_fee + journal_fee + logUniform(rng, 1n, 3n * 10n ** 24n),
    min_buy: logUniform(rng, 10n ** 21n, 10n ** 23n),
    journal_fee,
    rug_fee,
    reg_min: REG_MIN,
  };
}

function near(rng: Rng, lo: number, hi: number): bigint {
  const v = lo * powFrac(hi / lo, rng.next());
  return BigInt(Math.floor(v * 1e6)) * 10n ** 18n;
}

function fuzzSequence(seed: number, index: number): Sequence {
  const rng = fork(seed, `vectors.fuzz.${index}`);
  const p = randomParams(rng);
  const m = new VectorMachine(p);
  const actors = ["a0", "a1", "a2", "a3", "a4"];
  const steps: Step[] = [];
  const pick = <T>(xs: T[]): T => xs[Math.floor(rng.next() * xs.length)];
  while (steps.length < 50) {
    const u = rng.next();
    const actor = pick(actors);
    const c = m.core;
    const T = tRequired(c, p);
    const bal = m.bal(actor);
    if (u < 0.42) {
      const v = rng.next();
      const deposit = v < 0.05 ? 1n : v < 0.1 ? near(rng, 0.001, 0.2) : near(rng, 0.05, 800);
      const minOut = rng.next() < 0.1 ? HUGE : 0n;
      steps.push(m.apply("buy", actor, { deposit: deposit.toString(), min_out: minOut.toString() }));
    } else if (u < 0.65) {
      const v = rng.next();
      const amount = v < 0.08 ? 0n : v < 0.16 ? bal + 1n : v < 0.3 ? bal : (bal * BigInt(1 + Math.floor(rng.next() * 999))) / 1000n;
      const minOut = rng.next() < 0.1 ? HUGE : 0n;
      steps.push(m.apply("sell", actor, { amount: amount.toString(), min_out: minOut.toString() }));
    } else if (u < 0.82) {
      const v = rng.next();
      const round = v < 0.08 ? c.round + 1n : c.round;
      const payoutRef = c.pot - p.rug_fee;
      const minPayout = v >= 0.08 && v < 0.16 ? (payoutRef > 0n ? payoutRef + 1n : 1n) : 0n;
      const maxBurn = v >= 0.16 && v < 0.24 && T > 0n ? T - 1n : HUGE;
      steps.push(m.apply("rug", actor, { round: round.toString(), min_payout: minPayout.toString(), max_burn: maxBurn.toString() }));
    } else if (u < 0.93) {
      const gb = gapBuy(c, p, bal, m.registered.has(actor));
      const v = rng.next();
      const round = v < 0.1 ? c.round + 5n : c.round;
      const deposit = v >= 0.1 && v < 0.2 ? gb.deposit_needed / 2n : (gb.deposit_needed * 101n) / 100n;
      steps.push(m.apply("buy_rug", actor, {
        deposit: deposit.toString(),
        min_out: "0",
        round: round.toString(),
        min_payout: "0",
        max_burn: HUGE.toString(),
      }));
    } else {
      const to = pick(actors.filter((a) => a !== actor));
      if (m.registered.has(actor) && m.registered.has(to) && bal > 0n) {
        const share = (bal * BigInt(1 + Math.floor(rng.next() * 999))) / 1000n;
        const amount = rng.next() < 0.2 || share === 0n ? bal : share;
        steps.push(m.apply("transfer", actor, { to, amount: amount.toString() }));
      }
    }
  }
  return { id: `fuzz-${String(index).padStart(4, "0")}`, params: paramsToJson(p), steps };
}

// ---------------------------------------------------------------- Named edge cases

const live: Params = {
  p0: 10n ** 19n,
  a: 10n ** 13n,
  fee_bps: 200n,
  tau_bps: 500n,
  hwm_floor_bps: 9000n,
  pot_min: 10n ** 24n,
  min_buy: MIN_BUY,
  journal_fee: JOURNAL_FEE,
  rug_fee: RUG_FEE,
  reg_min: REG_MIN,
};
const N = (n: number): bigint => BigInt(Math.round(n * 1e6)) * 10n ** 18n;
const mkBuy = (deposit: bigint, minOut = 0n): Args => ({ deposit: deposit.toString(), min_out: minOut.toString() });
const mkRug = (round: bigint, minPayout: bigint, maxBurn: bigint): Args => ({ round: round.toString(), min_payout: minPayout.toString(), max_burn: maxBurn.toString() });

function edge(id: string, p: Params, build: (m: VectorMachine, push: (op: Op, actor: string, args: Args) => Step) => void): Sequence {
  const m = new VectorMachine(p);
  const steps: Step[] = [];
  build(m, (op, actor, args) => {
    const s = m.apply(op, actor, args);
    steps.push(s);
    return s;
  });
  return { id: `edge-${id}`, params: paramsToJson(p), steps };
}

const fund = (m: VectorMachine, push: (op: Op, actor: string, args: Args) => Step): void => {
  push("buy", "a0", mkBuy(N(200)));
  push("buy", "a1", mkBuy(N(200)));
};

/** Smallest deposit whose net (after fee) reaches `net` exactly, for an already-registered buyer. */
function depositForNet(p: Params, net: bigint, reg: bigint): bigint {
  let d = (net * BPS) / (BPS - p.fee_bps);
  while (d - ceilDiv(d * p.fee_bps, BPS) < net) d++;
  return d + p.journal_fee + reg;
}

function edgeCases(): Sequence[] {
  const out: Sequence[] = [];
  out.push(edge("buy-1-yocto", live, (m, push) => {
    push("buy", "a0", mkBuy(1n));
  }));
  out.push(edge("buy-exact-min", live, (m, push) => {
    push("buy", "a0", mkBuy(live.reg_min + live.journal_fee + live.min_buy));
    push("buy", "a1", mkBuy(live.reg_min + live.journal_fee + live.min_buy - 1n));
    push("buy", "a0", mkBuy(live.journal_fee + live.min_buy));
    push("buy", "a0", mkBuy(live.journal_fee + live.min_buy - 1n));
  }));
  out.push(edge("buy-slippage", live, (m, push) => {
    const s = push("buy", "a0", mkBuy(N(5)));
    push("buy", "a1", mkBuy(N(5), BigInt(s.expect.returned as string) + 1n));
  }));

  // Pot exactly at pot_min and one yocto below: pot_min is set to the pot a fixed script reaches.
  const probe = new VectorMachine({ ...live, pot_min: live.rug_fee + live.journal_fee });
  probe.apply("buy", "a0", mkBuy(N(100)));
  const probePot = probe.core.pot;
  out.push(edge("pot-equals-min", { ...live, pot_min: probePot }, (m, push) => {
    push("buy", "a0", mkBuy(N(100)));
    push("rug", "a0", mkRug(1n, 0n, HUGE));
  }));
  out.push(edge("pot-one-below-min", { ...live, pot_min: probePot + 1n }, (m, push) => {
    push("buy", "a0", mkBuy(N(100)));
    push("rug", "a0", mkRug(1n, 0n, HUGE));
  }));

  // Balance exactly T, and T - 1.
  const cheap: Params = { ...live, pot_min: live.rug_fee + live.journal_fee };
  for (const offset of [0n, 1n]) {
    out.push(edge(offset === 0n ? "balance-equals-T" : "balance-T-minus-1", cheap, (m, push) => {
      fund(m, push);
      const T = tRequired(m.core, cheap);
      push("transfer", "a0", { to: "a1", amount: (m.bal("a0") - (T - offset)).toString() });
      push("rug", "a0", mkRug(1n, 0n, HUGE));
    }));
  }

  out.push(edge("round-stale", cheap, (m, push) => {
    fund(m, push);
    push("rug", "a0", mkRug(2n, 0n, HUGE));
    push("rug", "a0", mkRug(1n, 0n, HUGE));
    push("rug", "a1", mkRug(1n, 0n, HUGE));
  }));
  out.push(edge("min-payout-limits", cheap, (m, push) => {
    fund(m, push);
    const payout = m.core.pot - cheap.rug_fee;
    push("rug", "a0", mkRug(1n, payout + 1n, HUGE));
    push("rug", "a0", mkRug(1n, payout, HUGE));
  }));
  out.push(edge("burn-above-max", cheap, (m, push) => {
    fund(m, push);
    const T = tRequired(m.core, cheap);
    push("rug", "a0", mkRug(1n, 0n, T - 1n));
    push("rug", "a0", mkRug(1n, 0n, T));
  }));
  out.push(edge("sell-too-small", live, (m, push) => {
    push("buy", "a0", mkBuy(N(10)));
    push("sell", "a0", { amount: "0", min_out: "0" });
    push("sell", "a0", { amount: "1", min_out: "0" });
    push("sell", "a1", { amount: "1", min_out: "0" });
  }));
  out.push(edge("sell-slippage-and-exact", live, (m, push) => {
    push("buy", "a0", mkBuy(N(10)));
    const half = m.bal("a0") / 2n;
    const gross = r(live, m.core.x) - r(live, m.core.x - half);
    const fee = ceilDiv(gross * live.fee_bps, BPS);
    const payout = gross - fee - live.journal_fee;
    push("sell", "a0", { amount: half.toString(), min_out: (payout + 1n).toString() });
    push("sell", "a0", { amount: half.toString(), min_out: payout.toString() });
  }));
  out.push(edge("sell-all-supply", live, (m, push) => {
    push("buy", "a0", mkBuy(N(10)));
    push("sell", "a0", { amount: m.bal("a0").toString(), min_out: "0" });
    push("buy", "a0", mkBuy(N(1)));
  }));
  out.push(edge("sell-all-after-rug", cheap, (m, push) => {
    fund(m, push);
    push("rug", "a0", mkRug(1n, 0n, HUGE));
    push("sell", "a0", { amount: m.bal("a0").toString(), min_out: "0" });
    push("sell", "a1", { amount: m.bal("a1").toString(), min_out: "0" });
    push("buy", "a2", mkBuy(N(1)));
  }));

  // Largest authorised buy: a deposit that lands exactly on X_MAX, then one that overshoots.
  const netToMax = r(live, X_MAX);
  const reg = live.reg_min;
  const maxDeposit = depositForNet(live, netToMax, reg);
  out.push(edge("buy-up-to-x-max", live, (m, push) => {
    push("buy", "a0", mkBuy(maxDeposit));
    push("buy", "a1", mkBuy(N(100)));
  }));
  out.push(edge("buy-above-x-max", live, (m, push) => {
    push("buy", "a0", mkBuy(depositForNet(live, r(live, X_MAX + ONE), reg)));
    push("buy", "a1", mkBuy(N(1)));
  }));

  // inv() on a perfect square: p0^2 + 2aR = k^2 with k = p0 + a*t.
  const square: Params = { ...live, p0: 2n * 10n ** 19n, a: 2n * 10n ** 13n };
  const t = 3n * 10n ** 6n;
  const k = square.p0 + square.a * t;
  const netSquare = (k * k - square.p0 * square.p0) / (2n * square.a);
  out.push(edge("isqrt-perfect-square", square, (m, push) => {
    push("buy", "a0", mkBuy(depositForNet(square, netSquare, reg)));
    push("buy", "a0", mkBuy(depositForNet(square, 1000n * 10n ** 18n, 0n) + N(3)));
  }));

  out.push(edge("buy-rug-success-then-stale", cheap, (m, push) => {
    fund(m, push);
    const gb = gapBuy(m.core, cheap, 0n, false);
    push("buy_rug", "a2", { deposit: gb.deposit_needed.toString(), min_out: "0", ...mkRug(1n, 0n, HUGE) });
    const gb2 = gapBuy(m.core, cheap, 0n, false);
    push("buy_rug", "a3", { deposit: gb2.deposit_needed.toString(), min_out: "0", ...mkRug(1n, 0n, HUGE) });
    push("buy", "a3", mkBuy(N(1)));
  }));
  out.push(edge("buy-rug-rollback-keeps-unregistered", cheap, (m, push) => {
    fund(m, push);
    const gb = gapBuy(m.core, cheap, 0n, false);
    const fail = { deposit: gb.deposit_needed.toString(), min_out: "0", ...mkRug(9n, 0n, HUGE) };
    push("buy_rug", "a2", fail);
    push("buy", "a2", mkBuy(cheap.reg_min + cheap.journal_fee + cheap.min_buy - 1n));
  }));
  out.push(edge("buy-rug-buy-fails", cheap, (m, push) => {
    fund(m, push);
    push("buy_rug", "a2", { deposit: "1", min_out: "0", ...mkRug(1n, 0n, HUGE) });
  }));
  out.push(edge("hwm-floor-after-rug", cheap, (m, push) => {
    fund(m, push);
    push("sell", "a1", { amount: (m.bal("a1") * 9n / 10n).toString(), min_out: "0" });
    push("rug", "a0", mkRug(1n, 0n, HUGE));
    push("rug", "a0", mkRug(2n, 0n, HUGE));
  }));
  out.push(edge("t-above-supply-holder-infeasible", { ...cheap, tau_bps: 5000n }, (m, push) => {
    push("buy", "a0", mkBuy(N(50)));
    push("sell", "a0", { amount: (m.bal("a0") * 95n / 100n).toString(), min_out: "0" });
    push("rug", "a0", mkRug(1n, 0n, HUGE));
  }));
  out.push(edge("register-once", live, (m, push) => {
    push("buy", "a0", mkBuy(N(1)));
    push("buy", "a0", mkBuy(N(1)));
    push("buy", "a1", mkBuy(N(1)));
    push("transfer", "a0", { to: "a1", amount: m.bal("a0").toString() });
  }));
  return out;
}

export function generateVectors(seed: number): VectorFile {
  const sequences: Sequence[] = edgeCases();
  for (let i = 0; i < 500; i++) sequences.push(fuzzSequence(seed, i));
  return { version: 1, sequences };
}

/** One sequence per line: minimal size, line-based diffs. */
export function serializeVectors(v: VectorFile): string {
  return `{"version":${v.version},"sequences":[\n${v.sequences.map((s) => JSON.stringify(s)).join(",\n")}\n]}\n`;
}

export function writeVectors(path: string, seed: number): VectorFile {
  const v = generateVectors(seed);
  writeFileSync(path, serializeVectors(v));
  return v;
}

export function replaySequence(s: Sequence): string[] {
  const m = new VectorMachine(paramsFromJson(s.params));
  const errors: string[] = [];
  s.steps.forEach((step, i) => {
    const got = m.apply(step.op, step.actor, step.args);
    if (JSON.stringify(got.expect) !== JSON.stringify(step.expect)) errors.push(`${s.id} step ${i} (${step.op})`);
  });
  return errors;
}

export function replayFile(path: string): { sequences: number; steps: number; errors: string[] } {
  const v = JSON.parse(readFileSync(path, "utf8")) as VectorFile;
  const errors = v.sequences.flatMap(replaySequence);
  return { sequences: v.sequences.length, steps: v.sequences.reduce((n, s) => n + s.steps.length, 0), errors };
}
