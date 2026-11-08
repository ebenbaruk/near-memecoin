// Determinism check against a stored hash, plus the shared-vector replay.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runGame } from "./engine.ts";
import { cellParams, DEFAULT_CELL } from "./params.ts";
import { jsonBigInt, REPO_ROOT, SIM_ROOT } from "./report.ts";
import { DEFAULT_ASSUMPTIONS, type RunSummary } from "./types.ts";
import { replayFile } from "./vectors.ts";

export const GOLDEN = join(SIM_ROOT, "golden.json");
export const VECTORS = join(REPO_ROOT, "fixtures", "vectors.json");

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value, jsonBigInt) ?? "null";
}

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

export function goldenHash(): { hash: string; node: string } {
  const params = cellParams(DEFAULT_CELL);
  const runs: RunSummary[] = (["organic", "whale", "tiny"] as const).map((scenario) =>
    runGame({ scenario, seed: 7, params, assumptions: DEFAULT_ASSUMPTIONS, variant: "rug", whalePolicy: "myope" }),
  );
  return { hash: sha256(canonical(runs)), node: process.version };
}

/** 0 when the golden hash and the vectors both match, 2 otherwise. */
export function checkGolden(): number {
  const now = goldenHash();
  let code = 0;
  if (!existsSync(GOLDEN)) {
    console.error("sim/golden.json is missing; run `npm run sim -- write-golden`");
    return 2;
  }
  const stored = JSON.parse(readFileSync(GOLDEN, "utf8")) as { hash: string; node: string };
  if (stored.node !== now.node) {
    console.error(`golden: Node ${now.node} differs from pinned ${stored.node}; floats may differ, check skipped (see .nvmrc)`);
  } else if (stored.hash !== now.hash) {
    console.error(`golden: MISMATCH\n  stored ${stored.hash}\n  now    ${now.hash}`);
    code = 2;
  } else {
    console.log(`golden: OK ${now.hash.slice(0, 16)} (Node ${now.node})`);
  }
  if (existsSync(VECTORS)) {
    const res = replayFile(VECTORS);
    if (res.errors.length) {
      console.error(`vectors: ${res.errors.length} divergences, first: ${res.errors[0]}`);
      code = 2;
    } else {
      console.log(`vectors: OK ${res.sequences} sequences, ${res.steps} steps`);
    }
  } else {
    console.error("vectors: fixtures/vectors.json is missing; run `npm run sim -- vectors --seed 1`");
    code = 2;
  }
  return code;
}
