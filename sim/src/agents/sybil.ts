// Sybil pool: split purchases across n accounts, consolidate by transfer, rug (spec §3).
import { tRequired } from "../rules.ts";
import { yoctoToNear, type Action, type Actor, type World } from "../world.ts";
import { accumulationDeposit } from "./whale.ts";

export function sybilDecide(w: World): Action[] {
  const { as, core, p } = w;
  if (w.tick < w.memory.sybilCooldown) return [];
  const accounts = w.sybils;
  const hub = accounts[0];
  const total = accounts.reduce((s, a) => s + a.bal, 0n);

  if (w.rugEnabled && w.potEligible) {
    const T = tRequired(core, p);
    if (total >= T) {
      const gh = w.gapHolderNow();
      const holders = accounts.filter((a) => a !== hub && a.bal > 0n);
      const costGas = as.gas * (holders.length + 1);
      if (gh.positive && yoctoToNear(gh.abs) > costGas) {
        const moves: Action[] = holders.map((a) => ({ type: "transfer", from: a, to: hub, amount: a.bal }));
        w.memory.sybilCooldown = w.tick + as.whaleReturnDays * 24;
        return [...moves, { type: "rug", actor: hub }, { type: "sell_all", actor: hub }];
      }
      return [];
    }
  }

  const buyer = accounts[Math.floor(w.rng("sybil.pick").next() * accounts.length)];
  const deposit = accumulationDeposit(w, total, buyer.registered, as.whaleCap);
  return deposit > 0n ? [{ type: "buy", actor: buyer, deposit }] : [];
}
