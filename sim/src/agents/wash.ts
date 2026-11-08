// Wash trader: holds 1.05 T, round-trips V NEAR a day, tries to rug (spec §3).
import { BPS, r, tRequired } from "../rules.ts";
import { nearToYocto, yoctoToNear, type Action, type Actor, type World } from "../world.ts";

export function washDecide(w: World, a: Actor): Action[] {
  const { as, core, p } = w;
  const T = tRequired(core, p);
  const stock = (T * 105n) / 100n;
  const actions: Action[] = [];

  if (w.rugEnabled && w.potEligible && a.bal >= T) {
    const gh = w.gapHolderNow();
    if (gh.positive && yoctoToNear(gh.abs) > as.gas) return [{ type: "rug", actor: a }];
  }
  if (a.bal < stock && core.S > 0n) {
    const want = stock - a.bal;
    const cost = r(p, core.x + want) - r(p, core.x);
    const deposit = cost + (cost * p.fee_bps) / BPS + p.journal_fee + (a.registered ? 0n : p.reg_min);
    const capY = nearToYocto(as.whaleCap);
    actions.push({ type: "buy", actor: a, deposit: deposit < capY ? deposit : capY });
  }
  const trip = nearToYocto(as.washV / 24);
  actions.push({ type: "buy", actor: a, deposit: trip }, { type: "sell_last_minted", actor: a });
  return actions;
}
