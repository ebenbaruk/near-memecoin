import { describe, expect, it } from "vitest";
import {
  BPS, ONE, X_MAX, buy, ceilDiv, feeOn, gapBuy, gapExit, gapHolder, inv, isqrt, newCore, netSell, r, rug, sell, tRequired, type Core, type Params,
} from "../src/rules.ts";
import { JOURNAL_FEE, MIN_BUY, REG_MIN, RUG_FEE } from "../src/params.ts";

const P: Params = {
  p0: 10n ** 19n, a: 10n ** 13n, fee_bps: 200n, tau_bps: 500n, hwm_floor_bps: 9000n,
  pot_min: 10n ** 24n, min_buy: MIN_BUY, journal_fee: JOURNAL_FEE, rug_fee: RUG_FEE, reg_min: REG_MIN,
};
const N = (n: number): bigint => BigInt(Math.round(n * 1e6)) * 10n ** 18n;

function bought(core: Core, deposit: bigint, registered = true): Extract<ReturnType<typeof buy>, { ok: true }> {
  const o = buy(core, P, deposit, registered, 0n);
  if (!o.ok) throw new Error(o.error);
  return o;
}

describe("math", () => {
  it("isqrt floors and is exact on squares", () => {
    for (const k of [0n, 1n, 2n, 3n, 10n ** 19n, 10n ** 38n, 2n ** 127n - 1n]) {
      expect(isqrt(k * k)).toBe(k);
      if (k > 1n) expect(isqrt(k * k - 1n)).toBe(k - 1n);
    }
  });
  it("r is monotone and rounds up", () => {
    let prev = -1n;
    for (let i = 0n; i < 5000n; i += 37n) {
      const v = r(P, i * ONE);
      expect(v > prev).toBe(true);
      prev = v;
    }
    expect(r(P, 0n)).toBe(0n);
    expect(r({ ...P, p0: 1n, a: 1n }, 1n)).toBe(1n);
  });
  it("r(inv(R)) <= R and dust is small", () => {
    for (let i = 0n; i < 2000n; i++) {
      const R = (i * i * 7919n + i) * 10n ** 18n;
      const x = inv(P, R);
      expect(r(P, x) <= R).toBe(true);
      expect(R - r(P, x + 1n) < 10n ** 19n).toBe(true);
    }
  });
  it("fee and T round up", () => {
    expect(ceilDiv(10000n, 10000n)).toBe(1n);
    expect(ceilDiv(10001n, 10000n)).toBe(2n);
    expect(feeOn(P, 10n ** 24n)).toBe((10n ** 24n * 200n) / BPS);
    expect(feeOn(P, 1n)).toBe(1n);
    const c: Core = { ...newCore(), S: 1000n, hwm: 10000n };
    expect(tRequired(c, P)).toBe(ceilDiv(500n * 9000n, 10000n));
  });
});

describe("buy", () => {
  it("charges registration once and journal fee, mints and fills the reserve", () => {
    const first = bought(newCore(), N(10), false);
    expect(first.reg).toBe(REG_MIN);
    const d = N(10) - REG_MIN - JOURNAL_FEE;
    const fee = feeOn(P, d);
    expect(first.fee).toBe(fee);
    expect(first.core.R).toBe(first.cost);
    expect(first.core.pot).toBe(fee + first.dust);
    expect(first.core.S).toBe(first.minted);
    expect(first.core.hwm).toBe(first.minted);
    const second = bought(first.core, N(10));
    expect(second.reg).toBe(0n);
    expect(second.core.R).toBe(r(P, second.core.x));
  });
  it("orders its errors: below min, above X_MAX, slippage", () => {
    expect(buy(newCore(), P, REG_MIN - 1n, false, 0n)).toEqual({ ok: false, error: "E_BELOW_MIN_BUY" });
    expect(buy(newCore(), P, REG_MIN + JOURNAL_FEE - 1n, false, 0n)).toEqual({ ok: false, error: "E_BELOW_MIN_BUY" });
    expect(buy(newCore(), P, JOURNAL_FEE + MIN_BUY - 1n, true, 0n)).toEqual({ ok: false, error: "E_BELOW_MIN_BUY" });
    expect(buy(newCore(), P, JOURNAL_FEE + MIN_BUY, true, 0n).ok).toBe(true);
    expect(buy(newCore(), P, 2n * r(P, X_MAX), true, 10n ** 38n)).toEqual({ ok: false, error: "E_ABOVE_X_MAX" });
    expect(buy(newCore(), P, N(5), true, 10n ** 38n)).toEqual({ ok: false, error: "E_SLIPPAGE" });
  });
});

describe("sell", () => {
  const start = bought(newCore(), N(50)).core;
  it("pays gross minus fee minus journal, keeps HWM, feeds the pot", () => {
    const amount = start.S / 3n;
    const o = sell(start, P, start.S, amount, 0n);
    if (!o.ok) throw new Error(o.error);
    const gross = r(P, start.x) - r(P, start.x - amount);
    expect(o.gross).toBe(gross);
    expect(o.payout).toBe(gross - feeOn(P, gross) - JOURNAL_FEE);
    expect(o.core.pot).toBe(start.pot + feeOn(P, gross));
    expect(o.core.hwm).toBe(start.hwm);
  });
  it("orders its errors", () => {
    expect(sell(start, P, start.S, 0n, 0n)).toEqual({ ok: false, error: "E_SELL_TOO_SMALL" });
    expect(sell(start, P, 5n, 6n, 0n)).toEqual({ ok: false, error: "E_INSUFFICIENT_TOKENS" });
    expect(sell(start, P, start.S, 1n, 0n)).toEqual({ ok: false, error: "E_SELL_TOO_SMALL" });
    expect(sell(start, P, start.S, start.S / 2n, 10n ** 38n)).toEqual({ ok: false, error: "E_SLIPPAGE" });
  });
  it("selling all supply returns x to B", () => {
    const o = sell(start, P, start.S, start.S, 0n);
    if (!o.ok) throw new Error(o.error);
    expect(o.core.x).toBe(0n);
    expect(o.core.S).toBe(0n);
    expect(o.core.R).toBe(0n);
  });
});

describe("rug", () => {
  const cheap: Params = { ...P, pot_min: RUG_FEE + JOURNAL_FEE };
  const fundedCore = (): Core => {
    const o = buy(newCore(), cheap, N(100), true, 0n);
    if (!o.ok) throw new Error(o.error);
    return o.core;
  };
  const huge = 10n ** 38n;
  it("orders its errors: stale, pot, max burn, tokens, payout", () => {
    const c = fundedCore();
    const T = tRequired(c, cheap);
    expect(rug(c, cheap, c.S, 2n, 0n, huge)).toEqual({ ok: false, error: "E_ROUND_STALE" });
    expect(rug({ ...c, pot: cheap.pot_min - 1n }, cheap, c.S, 1n, 0n, huge)).toEqual({ ok: false, error: "E_POT_BELOW_MIN" });
    expect(rug(c, cheap, c.S, 1n, 0n, T - 1n)).toEqual({ ok: false, error: "E_BURN_ABOVE_MAX" });
    expect(rug(c, cheap, T - 1n, 1n, 0n, huge)).toEqual({ ok: false, error: "E_INSUFFICIENT_TOKENS" });
    expect(rug(c, cheap, c.S, 1n, c.pot - cheap.rug_fee + 1n, huge)).toEqual({ ok: false, error: "E_PAYOUT_BELOW_MIN" });
  });
  it("burns exactly T, keeps x and R, pays pot minus fee, floors HWM", () => {
    const c = fundedCore();
    const T = tRequired(c, cheap);
    const o = rug(c, cheap, c.S, 1n, 0n, huge);
    if (!o.ok) throw new Error(o.error);
    expect(o.burned).toBe(T);
    expect(o.payout).toBe(c.pot - cheap.rug_fee);
    expect(o.core.x).toBe(c.x);
    expect(o.core.R).toBe(c.R);
    expect(o.core.pot).toBe(0n);
    expect(o.core.round).toBe(2n);
    expect(o.core.hwm).toBe(c.S - T > (c.hwm * 9000n) / 10000n ? c.S - T : (c.hwm * 9000n) / 10000n);
    expect(o.core.x - o.core.S).toBe(T);
  });
});

describe("gaps", () => {
  it("gap_holder is infeasible when T exceeds S", () => {
    const o = buy(newCore(), { ...P, tau_bps: 5000n }, N(50), true, 0n);
    if (!o.ok) throw new Error(o.error);
    const sold = sell(o.core, { ...P, tau_bps: 5000n }, o.core.S, (o.core.S * 95n) / 100n, 0n);
    if (!sold.ok) throw new Error(sold.error);
    const g = gapHolder(sold.core, { ...P, tau_bps: 5000n });
    expect(g.feasible).toBe(false);
    expect(g.t_required > sold.core.S).toBe(true);
  });
  it("gap_buy's deposit makes the rug succeed, and T is post-buy", () => {
    let c = newCore();
    for (let i = 0; i < 3; i++) c = bought(c, N(300)).core;
    const g = gapBuy(c, P, 0n, false);
    expect(g.feasible).toBe(true);
    const b = buy(c, P, g.deposit_needed, false, g.min_out);
    if (!b.ok) throw new Error(b.error);
    expect(b.minted).toBe(g.min_out);
    expect(tRequired(b.core, P)).toBe(g.t_required);
    expect(b.minted >= g.t_required).toBe(true);
    const rugged = rug(b.core, P, b.minted, b.core.round, 0n, g.t_required);
    if (!rugged.ok) throw new Error(rugged.error);
    expect(g.tokens_needed).toBe(g.t_required);
    const near = rugged.payout - g.cost;
    const expected = c.pot - P.rug_fee - g.cost;
    expect(g.positive ? g.abs : -g.abs).toBe(expected);
    expect(near >= expected).toBe(true);
  });
  it("gap_exit matches a real sale followed by a rug", () => {
    let c = bought(newCore(), N(400)).core;
    const whale = c.S;
    c = bought(c, N(10)).core;
    const g = gapExit(c, P, whale);
    expect(g.feasible).toBe(true);
    const direct = netSell(c, P, whale);
    expect(g.value + direct > c.pot - P.rug_fee).toBe(true);
  });
});
