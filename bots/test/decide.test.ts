import { describe, expect, it } from 'vitest';
import { STOP_BELOW, decide, rugAction, type Market, type Tuning } from '../src/decide.ts';
import { sfc32 } from '../src/rng.ts';

const NEAR = 10n ** 24n;
const tuning: Tuning = { minTrade: NEAR / 20n, maxTrade: NEAR / 2n, rugMargin: NEAR / 500n, supplyTarget: 10n ** 24n };
const rugFee = 6n * 10n ** 21n;

function market(over: Partial<Market> = {}): Market {
  return {
    round: 4, pot: NEAR, tRequired: 1000n, supply: 20_000n, balance: 0n, near: 10n * NEAR,
    gapBuy: { feasible: true, positive: false, abs: NEAR, depositNeeded: NEAR, tRequired: 1050n },
    gapHolder: { feasible: true, positive: false, abs: NEAR },
    ...over,
  };
}

describe('rug decisions', () => {
  it('never rugs when the printed price is above the pot', () => {
    expect(rugAction(market(), tuning, rugFee)).toBeNull();
    expect(rugAction(market({ balance: 5000n }), tuning, rugFee)).toBeNull();
  });

  it('rugs with held tokens first, pinned to the seen round', () => {
    const m = market({ balance: 5000n, gapHolder: { feasible: true, positive: true, abs: NEAR } });
    const a = rugAction(m, tuning, rugFee);
    expect(a).toMatchObject({ kind: 'rug', round: 4, minPayout: NEAR - rugFee });
  });

  it('buys and rugs atomically when the buy route is positive', () => {
    const m = market({ gapBuy: { feasible: true, positive: true, abs: NEAR / 10n, depositNeeded: NEAR, tRequired: 1050n } });
    const a = rugAction(m, tuning, rugFee);
    expect(a?.kind).toBe('buy_rug');
    if (a?.kind === 'buy_rug') {
      expect(a.deposit).toBeGreaterThan(NEAR);
      expect(a.maxBurn).toBeGreaterThan(1050n);
    }
  });

  it('ignores a positive gap below the margin', () => {
    const m = market({ gapBuy: { feasible: true, positive: true, abs: 1n, depositNeeded: NEAR, tRequired: 1050n } });
    expect(rugAction(m, tuning, rugFee)).toBeNull();
  });

  it('does not spend its last NEAR on a rug', () => {
    const m = market({ near: NEAR + NEAR / 10n, gapBuy: { feasible: true, positive: true, abs: NEAR, depositNeeded: NEAR, tRequired: 1050n } });
    expect(rugAction(m, tuning, rugFee)).toBeNull();
  });

  it('skips an infeasible gap', () => {
    const m = market({ gapBuy: { feasible: false, positive: true, abs: NEAR, depositNeeded: NEAR, tRequired: 1050n } });
    expect(rugAction(m, tuning, rugFee)).toBeNull();
  });
});

describe('trading profiles', () => {
  it('stops below the reserve', () => {
    for (const p of ['buyer', 'seller', 'washer', 'accumulator', 'rugger'] as const) {
      expect(decide(p, market({ near: STOP_BELOW - 1n }), tuning, rugFee, sfc32(1)).kind).toBe('idle');
    }
  });

  it('only the rugger profile rugs', () => {
    const hot = market({ balance: 5000n, gapHolder: { feasible: true, positive: true, abs: NEAR }, gapBuy: { feasible: true, positive: true, abs: NEAR, depositNeeded: NEAR, tRequired: 1050n } });
    const rand = sfc32(7);
    for (let i = 0; i < 200; i++) {
      for (const p of ['buyer', 'seller', 'washer', 'accumulator'] as const) {
        expect(decide(p, hot, tuning, rugFee, rand).kind).not.toMatch(/rug/);
      }
    }
    expect(decide('rugger', hot, tuning, rugFee, rand).kind).toBe('rug');
  });

  it('trades stay inside the bounds and never sell more than held', () => {
    const rand = sfc32(11);
    for (let i = 0; i < 500; i++) {
      for (const p of ['buyer', 'seller', 'washer', 'accumulator'] as const) {
        const m = market({ balance: i % 2 ? 777_777n : 0n, supply: i % 3 ? 5n : 2n * 10n ** 24n });
        const a = decide(p, m, tuning, rugFee, rand);
        if (a.kind === 'buy') {
          expect(a.deposit).toBeGreaterThanOrEqual(tuning.minTrade);
          expect(a.deposit).toBeLessThanOrEqual(tuning.maxTrade);
        }
        if (a.kind === 'sell') expect(a.amount).toBeLessThanOrEqual(m.balance);
      }
    }
  });

  it('the generator is deterministic', () => {
    const [a, b] = [sfc32(5), sfc32(5)];
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
