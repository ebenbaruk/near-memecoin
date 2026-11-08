// Hourly clock over 60 days. Events are shuffled inside each tick; every action goes through World.execute,
// which verifies the invariants. Same (spec, Node version) gives byte-identical output.
import { BPS, burned, feeOn, floorPrice, gapBuy, gapExit, gapHolder, r, spotPrice, type Params } from "./rules.ts";
import { poissonFromUniform } from "./rng.ts";
import { scenarioById } from "./scenarios.ts";
import { KINDS, type Assumptions, type Kind, type RunSpec, type RunSummary } from "./types.ts";
import { World, yoctoToNear, type Action, type Actor } from "./world.ts";
import { arrivalRate, panicSell, retailBuy, retailOpportunist, retailSell, sellHazard } from "./agents/retail.ts";
import { sniperDecide } from "./agents/sniper.ts";
import { whaleDecide } from "./agents/whale.ts";
import { washDecide } from "./agents/wash.ts";
import { sybilDecide } from "./agents/sybil.ts";

export const TICKS = 1440;

function effectiveParams(spec: RunSpec): Params {
  const p = { ...spec.params, hwm_floor_bps: BigInt(Math.round(spec.assumptions.rhoBps)) };
  if (spec.variant === "A") return { ...p, void_fees: true };
  if (spec.variant === "B") return { ...p, fee_bps: 0n, void_fees: true };
  return p;
}

function shuffle<T>(events: T[], rngNext: () => number): void {
  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(rngNext() * (i + 1));
    const t = events[i];
    events[i] = events[j];
    events[j] = t;
  }
}

export function runGame(spec: RunSpec): RunSummary {
  const scenario = scenarioById(spec.scenario);
  const as: Assumptions = spec.assumptions;
  const p = effectiveParams(spec);
  const rugEnabled = spec.variant === "rug";
  const w = new World(spec, scenario, p, as, rugEnabled);

  if (rugEnabled && scenario.snipers) for (let i = 0; i < as.botN; i++) w.snipers.push(w.newActor("sniper"));
  if (scenario.whale) w.whale = w.newActor("whale");
  if (scenario.wash) w.wash = w.newActor("wash");
  if (scenario.sybil) for (let i = 0; i < as.sybilN; i++) w.sybils.push(w.newActor("sybil"));

  const orderRng = w.rng("engine.order");
  const arrivalRng = w.rng("retail.arrival");
  const shockDraw = w.rng("shock.time");
  if (scenario.shock === "early" && spec.shockAt === undefined) {
    w.shockEarlyDrawn = 48 + Math.floor(shockDraw.next() * (240 - 48));
  }

  const logPrices: number[] = [];
  const daily = {
    S: [] as number[],
    B: [] as number[],
    pot: [] as number[],
    gapH: 0,
    gapB: 0,
    gapE: 0,
    days: 0,
  };
  const panicActive = (t: number): boolean =>
    w.shockTick !== null && t >= w.shockTick && t < w.shockTick + as.panicD * 24;

  const record = (): void => {
    const c = w.core;
    daily.S.push(Number(c.S) / 1e18);
    daily.B.push(Number(burned(c)) / 1e18);
    daily.pot.push(yoctoToNear(c.pot));
  };
  record();

  const fresh = { registered: false, bal: 0n };
  for (let t = 0; t < TICKS; t++) {
    w.tick = t;
    w.day = Math.floor(t / 24);
    if (scenario.shock === "early" && w.shockTick === null && w.shockEarlyDrawn >= 0 && t >= w.shockEarlyDrawn) w.startShock();
    w.refreshPrice();
    const lp = Math.log(Math.max(w.priceFloat, 1e-30));
    w.m24 = t >= 24 ? lp - logPrices[t - 24] : 0;

    const events: (() => void)[] = [];
    const exec = (actions: Action[]): void => {
      for (const action of actions) w.execute(action);
    };
    const shock = panicActive(t);
    const buyFactor = shock ? as.panicB : 1;
    const sellFactor = shock ? as.panicM : 1;

    const n = poissonFromUniform(arrivalRng.next(), arrivalRate(w, w.day, buyFactor));
    for (let i = 0; i < n; i++) events.push(() => exec(retailBuy(w)));

    const panicNow = w.rugPending;
    w.rugPending = false;
    for (const h of [...w.retailHolders]) {
      if ((h.sell as NonNullable<Actor["sell"]>).next() < sellHazard(w, h, sellFactor)) events.push(() => exec(retailSell(w, h)));
      if (panicNow && (h.panic as NonNullable<Actor["panic"]>).next() < as.pi) events.push(() => exec(panicSell(w, h)));
    }

    if (rugEnabled) events.push(() => exec(retailOpportunist(w)));
    w.snipers.forEach((s, i) => events.push(() => exec(sniperDecide(w, s, i))));
    if (w.whale) {
      const whale = w.whale;
      events.push(() => exec(whaleDecide(w, whale)));
    }
    if (w.wash) {
      const wash = w.wash;
      events.push(() => exec(washDecide(w, wash)));
    }
    if (w.sybils.length > 0) events.push(() => exec(sybilDecide(w)));

    shuffle(events, orderRng.next);
    for (const e of events) e();

    w.refreshPrice();
    logPrices[t] = Math.log(Math.max(w.priceFloat, 1e-30));

    if (t % 24 === 23) {
      record();
      const c = w.core;
      const top = w.retailHolders.reduce((m, h) => (h.bal > m ? h.bal : m), w.whale?.bal ?? 0n);
      daily.days++;
      const gh = gapHolder(c, p);
      if (gh.feasible && gh.positive) daily.gapH++;
      const gb = gapBuy(c, p, fresh.bal, fresh.registered);
      if (gb.feasible && gb.positive) daily.gapB++;
      const ge = gapExit(c, p, top);
      if (ge.feasible && ge.positive) daily.gapE++;
    }
  }
  return summarize(w, spec, p, daily);
}

function summarize(
  w: World,
  spec: RunSpec,
  p: Params,
  daily: { S: number[]; B: number[]; pot: number[]; gapH: number; gapB: number; gapE: number; days: number },
): RunSummary {
  const c = w.core;
  const zero = (): Record<Kind, number> => ({ retail: 0, sniper: 0, whale: 0, wash: 0, sybil: 0 });
  const pnl = zero();
  const invested = zero();

  const exitValue = (bal: bigint, holders: bigint): bigint => {
    if (bal === 0n) return 0n;
    const gross = r(p, c.x) - r(p, c.x - bal);
    const net = gross - feeOn(p, gross) - holders * p.journal_fee;
    return net > 0n ? net : 0n;
  };

  // Retail is valued as one collective exit, shared pro rata to balance.
  const holders = w.retailHolders;
  const qRetail = holders.reduce((s, h) => s + h.bal, 0n);
  const retailExit = exitValue(qRetail, BigInt(holders.length));
  let winners = 0;
  const traders = w.allRetail.filter((a) => a.inY > 0n).length;
  let retailIn = 0n;
  let retailOut = 0n;
  let retailGas = 0;
  for (const a of w.allRetail) {
    if (a.inY === 0n) continue; // arrived with a deposit below the minimum: never traded
    const share = qRetail > 0n ? (retailExit * a.bal) / qRetail : 0n;
    const out = a.outY + share;
    retailIn += a.inY;
    retailOut += out;
    retailGas += a.gas;
    if (yoctoToNear(out) > yoctoToNear(a.inY) + a.gas) winners++;
  }
  invested.retail = yoctoToNear(retailIn);
  pnl.retail = yoctoToNear(retailOut) - invested.retail - retailGas;
  const retailReturnPct = invested.retail > 0 ? (100 * pnl.retail) / invested.retail : 0;

  for (const a of w.actors) {
    if (a.kind === "retail") continue;
    const value = yoctoToNear(a.outY + exitValue(a.bal, 1n));
    invested[a.kind] += yoctoToNear(a.inY);
    pnl[a.kind] += value - yoctoToNear(a.inY) - a.gas;
  }

  const firstRugDay = w.firstRugTick === null ? null : w.firstRugTick / 24;
  return {
    scenario: spec.scenario,
    variant: spec.variant,
    seed: spec.seed,
    whalePolicy: spec.whalePolicy ?? null,
    rugs: w.rugEvents,
    nRugs: w.rugEvents.length,
    firstRugDay,
    shockTick: w.shockTick,
    rugsAfterShock: w.rugsAfterShock,
    supplyDaily: daily.S,
    burnedDaily: daily.B,
    potDaily: daily.pot,
    orphanPot: yoctoToNear(c.pot),
    reserve: yoctoToNear(c.R),
    floorPrice: Number(floorPrice(c, p)) / 1e24,
    spotPrice: Number(spotPrice(c, p)) / 1e24,
    gapDays: {
      holder: daily.gapH / Math.max(1, daily.days),
      buy: daily.gapB / Math.max(1, daily.days),
      exit: daily.gapE / Math.max(1, daily.days),
    },
    retailReturnPct,
    retailWinners: traders > 0 ? winners / traders : 0,
    retailInvested: invested.retail,
    pnl,
    invested,
    rugCount: { ...w.rugCount },
    potTaken: { ...w.potTaken },
    violations: w.violations,
    buys: w.buys,
    sells: w.sells,
  };
}

/** Runs rug first, then the requested controls with the same shock tick. */
export function runPaired(spec: Omit<RunSpec, "variant" | "shockAt">, variants: ("rug" | "A" | "B")[]): RunSummary[] {
  const out: RunSummary[] = [];
  let shockAt: number | null | undefined;
  for (const variant of variants) {
    const s: RunSpec = { ...spec, variant };
    if (variant !== "rug" && shockAt !== undefined) s.shockAt = shockAt;
    const res = runGame(s);
    if (variant === "rug" && scenarioById(spec.scenario).shock) shockAt = res.shockTick;
    out.push(res);
  }
  return out;
}

export { KINDS };
