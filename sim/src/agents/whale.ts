// Patient whale with several exit policies (spec §3). The campaign keeps the best one per cell.
import { BPS, netSell, r, sell, tRequired } from "../rules.ts";
import { nearToYocto, yoctoToNear, type Action, type Actor, type World } from "../world.ts";

/** Buys towards w% of supply, at most `cap` NEAR per hour. Shared with the sybil pool. */
export function accumulationDeposit(w: World, bal: bigint, registered: boolean, cap: number): bigint {
  const { core, p, as } = w;
  if (core.S === 0n) return 0n;
  const share = BigInt(Math.round(as.whaleW * 1e4));
  if (share >= BPS) return 0n;
  const want = core.S * share > bal * BPS ? (core.S * share - bal * BPS) / (BPS - share) : 0n;
  if (want === 0n) return 0n;
  const cost = r(p, core.x + want) - r(p, core.x);
  const deposit = cost + (cost * p.fee_bps) / BPS + p.journal_fee + (registered ? 0n : p.reg_min);
  const capY = nearToYocto(cap);
  const d = deposit < capY ? deposit : capY;
  return d >= p.min_buy + p.journal_fee + (registered ? 0n : p.reg_min) ? d : 0n;
}

/** Whether burning T now beats selling T, under this policy. */
function wantsToRug(w: World, value: number, cost: number): boolean {
  if (value <= w.as.gas) return false;
  switch (w.memory.whalePolicy) {
    case "myope":
    case "inventaire":
    case "dump":
      return true;
    case "seuil1.5":
      return value >= 1.5 * cost;
    case "seuil3":
      return value >= 3 * cost;
  }
}

/** Sale that lowers T to its HWM floor while keeping enough tokens to burn; null when it does not help. */
function dumpPlan(w: World, whale: Actor): { sellAmount: bigint; value: number } | null {
  const { core, p } = w;
  const floorSupply = (core.hwm * p.hwm_floor_bps) / BPS;
  if (core.S <= floorSupply) return null;
  const tFloor = (p.tau_bps * floorSupply + BPS - 1n) / BPS;
  if (whale.bal <= tFloor) return null;
  const toFloor = core.S - floorSupply;
  const spare = whale.bal - tFloor;
  const amount = toFloor < spare ? toFloor : spare;
  const quote = sell(core, p, whale.bal, amount, 0n);
  if (!quote.ok) return null;
  const after = quote.core;
  const T = tRequired(after, p);
  if (whale.bal - amount < T || after.pot < p.pot_min) return null;
  const value = after.pot - p.rug_fee - netSell(after, p, T);
  return { sellAmount: amount, value: yoctoToNear(value < 0n ? 0n : value) };
}

export function whaleDecide(w: World, whale: Actor): Action[] {
  if (w.tick < w.memory.whaleCooldown) return [];
  const { as, core, p } = w;
  const actions: Action[] = [];

  if (w.rugEnabled && w.potEligible) {
    const T = tRequired(core, p);
    if (whale.bal >= T) {
      const cost = netSell(core, p, T);
      const valueY = core.pot - p.rug_fee - cost;
      const value = valueY > 0n ? yoctoToNear(valueY) : 0;
      const policy = w.memory.whalePolicy;
      const plan = policy === "dump" ? dumpPlan(w, whale) : null;
      const exit = policy !== "inventaire";
      if (plan && plan.value > as.gas && plan.value >= value) {
        actions.push({ type: "sell", actor: whale, amount: plan.sellAmount }, { type: "rug", actor: whale });
      } else if (wantsToRug(w, value, yoctoToNear(cost))) {
        actions.push({ type: "rug", actor: whale });
      }
      if (actions.length > 0) {
        if (exit) w.memory.whaleCooldown = w.tick + as.whaleReturnDays * 24;
        return exit ? [...actions, { type: "sell_all", actor: whale }] : actions;
      }
    }
  }

  const deposit = accumulationDeposit(w, whale.bal, whale.registered, as.whaleCap);
  if (deposit > 0n) actions.push({ type: "buy", actor: whale, deposit });
  return actions;
}
