// Attentive bots: atomic buy-and-rug as soon as it pays (spec §3).
import { yoctoToNear, type Action, type Actor, type World } from "../world.ts";

export function sniperDecide(w: World, s: Actor, index: number): Action[] {
  if (w.rng(`sniper.attention.${index}`).next() >= w.as.botAttention) return [];
  const threshold = w.as.gas + w.as.botMargin;
  const gh = w.gapHolderNow();
  if (s.bal >= gh.t_required && w.potEligible) {
    return gh.positive && yoctoToNear(gh.abs) > threshold ? [{ type: "rug", actor: s }] : [];
  }
  if (w.core.pot <= w.p.rug_fee) return []; // value = pot - rug_fee - cost cannot be positive
  const gb = w.gapBuyNow(s);
  if (!gb.feasible || !gb.positive || yoctoToNear(gb.abs) <= threshold) return [];
  return [{ type: "buy_rug", actor: s, deposit: gb.deposit_needed }];
}
