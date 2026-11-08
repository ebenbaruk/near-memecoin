import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runGame, runPaired } from "../src/engine.ts";
import { GOLDEN, VECTORS, canonical, goldenHash } from "../src/golden.ts";
import { cellParams, DEFAULT_CELL } from "../src/params.ts";
import { SCENARIOS } from "../src/scenarios.ts";
import { DEFAULT_ASSUMPTIONS, WHALE_POLICIES } from "../src/types.ts";
import { generateVectors, paramsFromJson, replayFile, replaySequence } from "../src/vectors.ts";
import { validateParams } from "../src/rules.ts";

const params = cellParams(DEFAULT_CELL);

describe("engine", () => {
  it("holds every invariant in all scenarios and variants", () => {
    for (const s of SCENARIOS) {
      for (const seed of [1, 2]) {
        for (const r of runPaired({ scenario: s.id, seed, params, assumptions: DEFAULT_ASSUMPTIONS, whalePolicy: "myope" }, ["rug", "A", "B"])) {
          expect(r.violations, `${s.id} ${r.variant}`).toEqual([]);
        }
      }
    }
  });
  it("holds invariants for every whale policy", () => {
    for (const whalePolicy of WHALE_POLICIES) {
      const r = runGame({ scenario: "whale", seed: 3, params, assumptions: DEFAULT_ASSUMPTIONS, variant: "rug", whalePolicy });
      expect(r.violations).toEqual([]);
    }
  });
  it("is deterministic and matches the golden hash", () => {
    const spec = { scenario: "hype", seed: 11, params, assumptions: DEFAULT_ASSUMPTIONS, variant: "rug" as const };
    expect(canonical(runGame(spec))).toBe(canonical(runGame(spec)));
    const stored = JSON.parse(readFileSync(GOLDEN, "utf8")) as { hash: string; node: string };
    const now = goldenHash();
    if (stored.node === now.node) expect(now.hash).toBe(stored.hash);
  });
  it("control coins never rug and destroy their fees", () => {
    const [, a, b] = runPaired({ scenario: "organic", seed: 5, params, assumptions: DEFAULT_ASSUMPTIONS }, ["rug", "A", "B"]);
    expect(a.nRugs).toBe(0);
    expect(a.orphanPot).toBe(0);
    expect(b.nRugs).toBe(0);
  });
  it("runs the panic-early shock before the first rug", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = runGame({ scenario: "panic-early", seed, params, assumptions: DEFAULT_ASSUMPTIONS, variant: "rug" });
      expect(r.shockTick).not.toBeNull();
      if (r.firstRugDay !== null) expect(r.firstRugDay * 24).toBeGreaterThan(r.shockTick as number);
    }
  });
});

describe("vectors", () => {
  it("covers 500 fuzz sequences of 50 steps and every error code", () => {
    const v = generateVectors(1);
    const fuzz = v.sequences.filter((s) => s.id.startsWith("fuzz"));
    expect(fuzz.length).toBeGreaterThanOrEqual(500);
    expect(fuzz.every((s) => s.steps.length >= 50)).toBe(true);
    const seen = new Set(v.sequences.flatMap((s) => s.steps.map((x) => x.expect.error)));
    for (const code of ["E_ROUND_STALE", "E_POT_BELOW_MIN", "E_INSUFFICIENT_TOKENS", "E_PAYOUT_BELOW_MIN", "E_BURN_ABOVE_MAX", "E_SLIPPAGE", "E_BELOW_MIN_BUY", "E_SELL_TOO_SMALL", "E_ABOVE_X_MAX"]) {
      expect(seen.has(code as never), code).toBe(true);
    }
  });
  it("every sequence stays inside the bounds of the contract's constructor", () => {
    for (const s of generateVectors(1).sequences) expect(validateParams(paramsFromJson(s.params)), s.id).toBeNull();
  });
  it("named edge cases hold their documented outcome", () => {
    const v = generateVectors(1);
    const ops = (id: string): string[] =>
      (v.sequences.find((s) => s.id === `edge-${id}`) as (typeof v.sequences)[number]).steps.map((s) => s.expect.error ?? "ok");
    expect(ops("buy-1-yocto")).toEqual(["E_BELOW_MIN_BUY"]);
    expect(ops("pot-equals-min").at(-1)).toBe("ok");
    expect(ops("pot-one-below-min").at(-1)).toBe("E_POT_BELOW_MIN");
    expect(ops("balance-equals-T").at(-1)).toBe("ok");
    expect(ops("balance-T-minus-1").at(-1)).toBe("E_INSUFFICIENT_TOKENS");
    expect(ops("min-payout-limits")).toEqual(["ok", "ok", "E_PAYOUT_BELOW_MIN", "ok"]);
    expect(ops("burn-above-max")).toEqual(["ok", "ok", "E_BURN_ABOVE_MAX", "ok"]);
    expect(ops("buy-up-to-x-max").at(0)).toBe("ok");
    expect(ops("buy-above-x-max").at(0)).toBe("E_ABOVE_X_MAX");
    expect(ops("buy-rug-rollback-keeps-unregistered")).toEqual(["ok", "ok", "E_ROUND_STALE", "E_BELOW_MIN_BUY"]);
  });
  it("a failed step leaves state and balances unchanged", () => {
    const v = generateVectors(1);
    for (const s of v.sequences) {
      let prev: (typeof s.steps)[number] | null = null;
      for (const step of s.steps) {
        if (prev && !step.expect.ok) {
          expect(step.expect.state).toEqual(prev.expect.state);
          for (const [k, val] of Object.entries(prev.expect.balance)) expect(step.expect.balance[k]).toBe(val);
        }
        prev = step;
      }
    }
  });
  it("the committed file replays exactly", () => {
    const res = replayFile(VECTORS);
    expect(res.errors).toEqual([]);
    expect(replaySequence(generateVectors(1).sequences[0])).toEqual([]);
  });
});

describe("lint", () => {
  it("never uses Math.random and keeps floats out of rules.ts", () => {
    const root = join(import.meta.dirname, "..", "src");
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else files.push(p);
      }
    };
    walk(root);
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/Math\.random/);
    const rules = readFileSync(join(root, "rules.ts"), "utf8");
    expect(rules).not.toMatch(/Math\.|\bNumber\(|parseFloat|\d\.\d/);
  });
});
