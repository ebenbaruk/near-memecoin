import { describe, expect, it } from "vitest";
import { buy, checkInvariants, gapBuy, newCore, netSell, rug, sell, tRequired, type Core, type Params } from "../src/rules.ts";
import { fork, type Rng } from "../src/rng.ts";
import { JOURNAL_FEE, MIN_BUY, REG_MIN, RUG_FEE } from "../src/params.ts";
import { runGame } from "../src/engine.ts";
import { cellParams, DEFAULT_CELL } from "../src/params.ts";
import { DEFAULT_ASSUMPTIONS } from "../src/types.ts";

const HUGE = 10n ** 38n;
const N = (n: number): bigint => BigInt(Math.round(n * 1e6)) * 10n ** 18n;

function randomParams(rng: Rng): Params {
  const taus = [100n, 200n, 500n, 1000n, 2000n, 5000n];
  const fees = [50n, 100n, 200n, 300n, 500n, 1000n];
  const slopes = [10n ** 12n, 10n ** 13n, 5n * 10n ** 13n, 10n ** 14n, 10n ** 15n];
  const pick = <T>(xs: T[]): T => xs[Math.floor(rng.next() * xs.length)];
  return {
    p0: pick([10n ** 18n, 10n ** 19n, 10n ** 20n]),
    a: pick(slopes),
    fee_bps: pick(fees),
    tau_bps: pick(taus),
    hwm_floor_bps: 9000n,
    pot_min: RUG_FEE + JOURNAL_FEE,
    min_buy: MIN_BUY,
    journal_fee: JOURNAL_FEE,
    rug_fee: RUG_FEE,
    reg_min: REG_MIN,
  };
}

/** Random trades by other accounts; returns the coin and the pot they funded. */
function othersPlay(p: Params, rng: Rng): Core {
  let c = newCore();
  const balances: bigint[] = [0n, 0n, 0n];
  for (let i = 0; i < 30; i++) {
    const who = Math.floor(rng.next() * 3);
    if (rng.next() < 0.7 || balances[who] === 0n) {
      const o = buy(c, p, N(0.05 + rng.next() * rng.next() * 200), i > 2, 0n);
      if (o.ok) {
        c = o.core;
        balances[who] += o.minted;
      }
    } else {
      const amount = (balances[who] * BigInt(1 + Math.floor(rng.next() * 100))) / 100n;
      const o = sell(c, p, balances[who], amount, 0n);
      if (o.ok) {
        c = o.core;
        balances[who] -= amount;
      }
    }
  }
  return c;
}

/** Cash delta of a solo attacker over a random sequence, with the remaining bag valued at its net sale. */
function attacker(p: Params, start: Core, rng: Rng): { gain: bigint; core: Core } {
  let c = start;
  let bal = 0n;
  let registered = false;
  let cash = 0n;
  for (let i = 0; i < 40; i++) {
    const u = rng.next();
    if (u < 0.4) {
      const deposit = N(0.05 + rng.next() * 300);
      const o = buy(c, p, deposit, registered, 0n);
      if (o.ok) {
        c = o.core;
        bal += o.minted;
        registered = true;
        cash -= deposit;
      }
    } else if (u < 0.65 && bal > 0n) {
      const amount = (bal * BigInt(1 + Math.floor(rng.next() * 100))) / 100n;
      const o = sell(c, p, bal, amount, 0n);
      if (o.ok) {
        c = o.core;
        bal -= amount;
        cash += o.payout;
      }
    } else if (u < 0.85) {
      const o = rug(c, p, bal, c.round, 0n, HUGE);
      if (o.ok) {
        c = o.core;
        bal -= o.burned;
        cash += o.payout;
      }
    } else if (c.pot >= p.pot_min) {
      const g = gapBuy(c, p, bal, registered);
      const b = buy(c, p, g.deposit_needed, registered, 0n);
      if (b.ok) {
        const o = rug(b.core, p, bal + b.minted, b.core.round, 0n, HUGE);
        if (o.ok) {
          c = o.core;
          bal += b.minted - o.burned;
          registered = true;
          cash += o.payout - g.deposit_needed;
        }
      }
    }
    expect(checkInvariants(c, p)).toBeNull();
  }
  const exit = bal > 0n ? netSell(c, p, bal) : 0n;
  return { gain: cash + exit, core: c };
}

describe("no slot machine", () => {
  it("a solo attacker gains at most the pot funded by others", () => {
    let profitable = 0;
    for (let s = 0; s < 500; s++) {
      const rng = fork(s, "prop.slot");
      const p = randomParams(rng);
      const start = othersPlay(p, rng);
      const { gain } = attacker(p, start, rng);
      expect(gain <= start.pot).toBe(true);
      if (gain > 0n) profitable++;
    }
    // A random attacker mostly bleeds fees; the bound's teeth are checked by the greedy attacker below.
    expect(profitable).toBeGreaterThan(5);
  });
  it("a greedy attacker taking every profitable rug still gains at most the others' pot", () => {
    let profitable = 0;
    for (let s = 0; s < 400; s++) {
      const rng = fork(s, "prop.greedy");
      const p = randomParams(rng);
      let start = newCore();
      // Heavy two-way flow by others, so that a pot worth taking exists.
      for (let i = 0; i < 60; i++) {
        const o = buy(start, p, N(50 + rng.next() * 50), true, 0n);
        if (!o.ok) continue;
        const back = sell(o.core, p, o.minted, o.minted / 2n, 0n);
        start = back.ok ? back.core : o.core;
      }
      const pot = start.pot;
      let c = start;
      let cash = 0n;
      let bal = 0n;
      let registered = false;
      for (let i = 0; i < 5; i++) {
        const g = gapBuy(c, p, bal, registered);
        if (!g.feasible || !g.positive) break;
        const b = buy(c, p, g.deposit_needed, registered, 0n);
        if (!b.ok) break;
        const o = rug(b.core, p, bal + b.minted, b.core.round, 0n, HUGE);
        if (!o.ok) break;
        c = o.core;
        bal += b.minted - o.burned;
        registered = true;
        cash += o.payout - g.deposit_needed;
      }
      const exit = bal > 0n ? netSell(c, p, bal) : 0n;
      const gain = cash + exit;
      expect(gain <= pot).toBe(true);
      if (gain > 0n) profitable++;
    }
    expect(profitable).toBeGreaterThan(40);
  });
  it("with no pot funded by others, the attacker never gains", () => {
    for (let s = 0; s < 200; s++) {
      const rng = fork(s, "prop.empty");
      const p = randomParams(rng);
      const { gain } = attacker(p, newCore(), rng);
      expect(gain <= 0n).toBe(true);
    }
  });
});

describe("wash trading is neutral", () => {
  it("own round trips never turn a losing rug into a winning one", () => {
    let losing = 0;
    for (let s = 0; s < 400; s++) {
      const rng = fork(s, "prop.wash");
      const p = randomParams(rng);
      const start = othersPlay(p, rng);
      const direct = gapBuy(start, p, 0n, false);
      const directValue = direct.positive ? direct.abs : -direct.abs;
      let c = start;
      let cash = 0n;
      let registered = false;
      const trips = 1 + Math.floor(rng.next() * 4);
      for (let t = 0; t < trips; t++) {
        const deposit = N(1 + rng.next() * 100);
        const b = buy(c, p, deposit, registered, 0n);
        if (!b.ok) continue;
        registered = true;
        const o = sell(b.core, p, b.minted, b.minted, 0n);
        if (!o.ok) continue;
        c = o.core;
        cash += o.payout - deposit;
      }
      const after = gapBuy(c, p, 0n, registered);
      const afterValue = after.positive ? after.abs : -after.abs;
      const total = afterValue + cash;
      // Direct rug includes registration; after washing the account is already registered and paid it in cash.
      if (directValue < 0n) {
        expect(total < 0n).toBe(true);
        losing++;
      }
      expect(total <= directValue + 1n).toBe(true);
    }
    expect(losing).toBeGreaterThan(30);
  });
});

describe("gap_buy", () => {
  it("deposit_needed always lets buy-then-rug succeed when feasible", () => {
    let checked = 0;
    for (let s = 0; s < 800; s++) {
      const rng = fork(s, "prop.gapbuy");
      const p = randomParams(rng);
      const c = othersPlay(p, rng);
      const bal = rng.next() < 0.3 ? 0n : N(rng.next() * 3);
      const g = gapBuy(c, p, bal, false);
      if (!g.feasible) continue;
      const b = buy(c, p, g.deposit_needed, false, g.min_out);
      if (!b.ok) throw new Error(`buy failed: ${b.error}`);
      const o = rug(b.core, p, bal + b.minted, b.core.round, 0n, g.t_required);
      if (!o.ok) throw new Error(`rug failed: ${o.error} (seed ${s})`);
      expect(tRequired(b.core, p)).toBe(g.t_required);
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
  });
});

describe("sybil", () => {
  it("splitting across accounts costs more registration and gas for the same burn", () => {
    const p = { ...cellParams(DEFAULT_CELL) };
    const start = bought(newCore(), p, N(2000));
    const n = 100;
    const each = N(4);
    let cSybil = start;
    let totalSybil = 0n;
    for (let i = 0; i < n; i++) {
      const o = buy(cSybil, p, each + REG_MIN, false, 0n);
      if (!o.ok) throw new Error(o.error);
      cSybil = o.core;
      totalSybil += o.minted;
    }
    const whale = buy(start, p, BigInt(n) * each + REG_MIN, false, 0n);
    if (!whale.ok) throw new Error(whale.error);
    expect(whale.minted > totalSybil).toBe(true);
  });
  it("in the engine, the sybil pool earns no more than a whale with the same schedule", () => {
    const params = cellParams(DEFAULT_CELL);
    let sybilTotal = 0;
    let whaleTotal = 0;
    for (let seed = 1; seed <= 10; seed++) {
      sybilTotal += runGame({ scenario: "sybil", seed, params, assumptions: DEFAULT_ASSUMPTIONS, variant: "rug" }).pnl.sybil;
      whaleTotal += runGame({ scenario: "whale", seed, params, assumptions: DEFAULT_ASSUMPTIONS, variant: "rug", whalePolicy: "myope" }).pnl.whale;
    }
    expect(sybilTotal).toBeLessThanOrEqual(whaleTotal);
  });
});

function bought(c: Core, p: Params, deposit: bigint): Core {
  const o = buy(c, p, deposit, false, 0n);
  if (!o.ok) throw new Error(o.error);
  return o.core;
}
