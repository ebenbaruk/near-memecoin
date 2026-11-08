// Mutable world handed to agents. Every state change goes through execute(),
// which applies the pure rules and checks the invariants after each action.
import {
  ONE, buy, checkInvariants, gapBuy, gapHolder, newCore, rug, sell, spotPrice, burned, tRequired,
  type Core, type Params,
} from "./rules.ts";
import { fork, type Rng } from "./rng.ts";
import type { Assumptions, Kind, RugEvent, RunSpec, WhalePolicy } from "./types.ts";
import type { Scenario } from "./scenarios.ts";

export interface Actor {
  id: number;
  kind: Kind;
  bal: bigint;
  registered: boolean;
  inY: bigint;
  outY: bigint;
  gas: number;
  avgEntry: number;
  holderIndex: number; // position in w.retailHolders, -1 when out
  lastMinted: bigint;
  sell?: Rng;
  panic?: Rng;
}

export type Action =
  | { type: "buy"; actor: Actor; deposit: bigint }
  | { type: "sell"; actor: Actor; amount: bigint }
  | { type: "sell_all"; actor: Actor }
  | { type: "sell_last_minted"; actor: Actor }
  | { type: "rug"; actor: Actor }
  | { type: "buy_rug"; actor: Actor; deposit: bigint }
  | { type: "transfer"; from: Actor; to: Actor; amount: bigint };

/** The single gateway from float decisions to BigInt amounts: NEAR to yocto, microNEAR resolution. */
export function nearToYocto(near: number): bigint {
  if (!(near > 0)) return 0n;
  return BigInt(Math.round(near * 1e6)) * 10n ** 18n;
}
export const yoctoToNear = (y: bigint): number => Number(y / 10n ** 12n) / 1e12;

export interface AgentMemory {
  whaleCooldown: number;
  sybilCooldown: number;
  whalePolicy: WhalePolicy;
}

export class World {
  core: Core = newCore();
  tick = 0;
  day = 0;
  priceFloat = 0;
  m24 = 0;
  lastRugTick = -1;
  firstRugTick: number | null = null;
  shockTick: number | null = null;
  shockEarlyDrawn = -1;
  rugsAfterShock = 0;
  rugPending = false;
  rugEvents: RugEvent[] = [];
  burnedTracked = 0n;
  violations: string[] = [];
  buys = 0;
  sells = 0;

  actors: Actor[] = [];
  allRetail: Actor[] = [];
  retailHolders: Actor[] = [];
  snipers: Actor[] = [];
  whale: Actor | null = null;
  wash: Actor | null = null;
  sybils: Actor[] = [];
  rugCount: Record<Kind, number> = { retail: 0, sniper: 0, whale: 0, wash: 0, sybil: 0 };
  potTaken: Record<Kind, number> = { retail: 0, sniper: 0, whale: 0, wash: 0, sybil: 0 };
  memory: AgentMemory = { whaleCooldown: -1, sybilCooldown: -1, whalePolicy: "myope" };

  readonly rngs: Record<string, Rng> = {};

  constructor(
    readonly spec: RunSpec,
    readonly scenario: Scenario,
    readonly p: Params,
    readonly as: Assumptions,
    readonly rugEnabled: boolean,
  ) {
    this.memory.whalePolicy = spec.whalePolicy ?? "myope";
    if (spec.shockAt !== undefined) this.shockTick = spec.shockAt;
  }

  rng(name: string): Rng {
    let r = this.rngs[name];
    if (!r) {
      r = fork(this.spec.seed, name);
      this.rngs[name] = r;
    }
    return r;
  }

  newActor(kind: Kind): Actor {
    const a: Actor = { id: this.actors.length, kind, bal: 0n, registered: false, inY: 0n, outY: 0n, gas: 0, avgEntry: 0, holderIndex: -1, lastMinted: 0n };
    this.actors.push(a);
    return a;
  }

  newRetail(): Actor {
    const a = this.newActor("retail");
    this.allRetail.push(a);
    return a;
  }

  private syncHolder(a: Actor): void {
    if (a.kind !== "retail") return;
    if (a.bal > 0n && a.holderIndex < 0) {
      a.holderIndex = this.retailHolders.length;
      this.retailHolders.push(a);
      a.sell ??= fork(this.spec.seed, `retail.sell.${a.id}`);
      a.panic ??= fork(this.spec.seed, `retail.panic.${a.id}`);
    } else if (a.bal === 0n && a.holderIndex >= 0) {
      const last = this.retailHolders.pop() as Actor;
      if (last !== a) {
        this.retailHolders[a.holderIndex] = last;
        last.holderIndex = a.holderIndex;
      }
      a.holderIndex = -1;
    }
  }

  private check(context: string): void {
    const issue = checkInvariants(this.core, this.p);
    const v = issue ?? (burned(this.core) !== this.burnedTracked ? "I2 position" : null);
    if (v && this.violations.length < 20) this.violations.push(`${v} @${this.tick} ${context}`);
  }

  execute(action: Action): boolean {
    const a = action.type === "transfer" ? action.from : action.actor;
    a.gas += this.as.gas;
    switch (action.type) {
      case "buy": {
        const o = buy(this.core, this.p, action.deposit, a.registered, 0n);
        if (!o.ok) return false;
        this.afterBuy(a, action.deposit, o.minted, o.cost);
        this.core = o.core;
        this.syncHolder(a);
        this.check("buy");
        return true;
      }
      case "sell": {
        const o = sell(this.core, this.p, a.bal, action.amount, 0n);
        if (!o.ok) return false;
        this.core = o.core;
        a.bal -= action.amount;
        a.outY += o.payout;
        this.sells++;
        this.syncHolder(a);
        this.check("sell");
        return true;
      }
      case "sell_all":
        return a.bal > 0n ? this.execute({ type: "sell", actor: a, amount: a.bal }) : false;
      case "sell_last_minted":
        return a.lastMinted > 0n && a.lastMinted <= a.bal ? this.execute({ type: "sell", actor: a, amount: a.lastMinted }) : false;
      case "rug":
        return this.tryRug(a, null);
      case "buy_rug":
        return this.tryRug(a, action.deposit);
      case "transfer": {
        if (a.bal < action.amount) return false;
        a.bal -= action.amount;
        action.to.bal += action.amount;
        this.syncHolder(a);
        this.syncHolder(action.to);
        return true;
      }
    }
  }

  private afterBuy(a: Actor, deposit: bigint, minted: bigint, cost: bigint): void {
    const tokens = Number(minted) / 1e18;
    const held = Number(a.bal) / 1e18;
    const pricePaid = Number(cost) / Number(minted) / 1e6; // yocto per base unit -> NEAR per whole token
    a.avgEntry = held + tokens > 0 ? (a.avgEntry * held + pricePaid * tokens) / (held + tokens) : pricePaid;
    a.bal += minted;
    a.lastMinted = minted;
    a.registered = true;
    a.inY += deposit;
    this.buys++;
  }

  private tryRug(a: Actor, deposit: bigint | null): boolean {
    if (!this.rugEnabled) return false;
    if (this.scenario.shock === "early" && this.shockTick === null) {
      this.startShock(); // the shock must come before the first rug
      return false;
    }
    if (this.scenario.shock === "early" && this.shockTick === this.tick) return false;
    const snapshotCore = this.core;
    const snapshotBal = a.bal;
    const snapshotReg = a.registered;
    const snapshotIn = a.inY;
    const snapshotAvg = a.avgEntry;
    if (deposit !== null) {
      const b = buy(this.core, this.p, deposit, a.registered, 0n);
      if (!b.ok) return false;
      this.afterBuy(a, deposit, b.minted, b.cost);
      this.core = b.core;
    }
    const o = rug(this.core, this.p, a.bal, this.core.round, 0n, ONE * 10n ** 18n);
    if (!o.ok) {
      this.core = snapshotCore;
      a.bal = snapshotBal;
      a.registered = snapshotReg;
      a.inY = snapshotIn;
      a.avgEntry = snapshotAvg;
      if (deposit !== null) this.buys--;
      return false;
    }
    this.core = o.core;
    a.bal -= o.burned;
    a.outY += o.payout;
    this.burnedTracked += o.burned;
    this.syncHolder(a);
    this.check("rug");
    const potNear = yoctoToNear(o.payout);
    this.rugEvents.push({ tick: this.tick, kind: a.kind, pot: potNear, burned: Number(o.burned) / 1e18 });
    this.rugCount[a.kind]++;
    this.potTaken[a.kind] += potNear;
    if (this.firstRugTick === null) {
      this.firstRugTick = this.tick;
      if (this.scenario.shock === "after" && this.spec.shockAt === undefined) this.shockTick = this.tick + 6;
    }
    if (this.shockTick !== null && this.tick > this.shockTick) this.rugsAfterShock++;
    this.lastRugTick = this.tick;
    this.rugPending = true;
    return true;
  }

  startShock(): void {
    this.shockTick = this.tick;
  }

  // Convenience reads for agents.
  get T(): bigint {
    return tRequired(this.core, this.p);
  }
  get potEligible(): boolean {
    return this.core.pot >= this.p.pot_min;
  }
  gapHolderNow() {
    return gapHolder(this.core, this.p);
  }
  gapBuyNow(a: Actor) {
    return gapBuy(this.core, this.p, a.bal, a.registered);
  }
  refreshPrice(): void {
    this.priceFloat = Number(spotPrice(this.core, this.p)) / 1e24;
  }
}
