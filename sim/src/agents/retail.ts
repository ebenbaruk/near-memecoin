// Retail order flow, sell pressure, and opportunistic holders (spec §3).
import { netSell, tRequired } from "../rules.ts";
import { nearToYocto, yoctoToNear, type Action, type Actor, type World } from "../world.ts";

export function arrivalRate(w: World, day: number, shockFactor: number): number {
  const { as, scenario } = w;
  const flow = as.flow * scenario.flowExtra;
  const m = Math.max(-1, Math.min(1, w.m24));
  const news = w.lastRugTick < 0 ? 0 : Math.max(0, 1 - (w.tick - w.lastRugTick) / 12);
  return (scenario.arrivals(day) * flow * Math.exp(as.betaM * m) * (1 + as.alphaR * news) * shockFactor) / 24;
}

/** Hazard of an hourly sale for a holder. Loss and gain are measured against its average entry. */
export function sellHazard(w: World, h: Actor, sellFactor: number): number {
  const as = w.as;
  const s0 = (w.scenario.s0 ?? as.s0) / 24;
  const ratio = h.avgEntry > 0 ? w.priceFloat / h.avgEntry : 1;
  const boost = ratio > 2 ? 1 + as.kappa : 1;
  if (ratio >= 1) return Math.min(1, s0 * boost * sellFactor);
  return Math.min(1, s0 * Math.exp(as.betaD * (1 - ratio)) * boost * sellFactor);
}

export function retailBuy(w: World): Action[] {
  const as = w.as;
  const size = Math.min(as.maxSize, as.medSize * Math.exp(as.sigmaSize * w.rng("retail.size").normal()));
  const useHolder = w.retailHolders.length > 0 && w.rng("retail.rebuy").next() < as.rebuy;
  const actor = useHolder
    ? w.retailHolders[Math.floor(w.rng("retail.rebuyPick").next() * w.retailHolders.length)]
    : w.newRetail();
  return [{ type: "buy", actor, deposit: nearToYocto(size) }];
}

export function retailSell(w: World, h: Actor): Action[] {
  if (h.bal === 0n) return [];
  const frac = 0.5 + 0.5 * w.rng("retail.sellFrac").next();
  const amount = frac >= 0.995 ? h.bal : (h.bal * BigInt(Math.floor(frac * 1_000_000))) / 1_000_000n;
  return [{ type: "sell", actor: h, amount }];
}

export function panicSell(_w: World, h: Actor): Action[] {
  return h.bal > 0n ? [{ type: "sell", actor: h, amount: h.bal / 2n }] : [];
}

/** A retail holder with at least T tokens rugs when the pot beats the net sale of T by more than gas. */
export function retailOpportunist(w: World): Action[] {
  if (!w.potEligible) return [];
  const T = tRequired(w.core, w.p);
  const qualified: Actor[] = [];
  for (const h of w.retailHolders) if (h.bal >= T) qualified.push(h);
  if (qualified.length === 0) return [];
  const value = w.core.pot - w.p.rug_fee - netSell(w.core, w.p, T);
  if (value <= 0n || yoctoToNear(value) <= w.as.gas) return [];
  const pick = qualified[Math.floor(w.rng("retail.opportunist").next() * qualified.length)];
  return [{ type: "rug", actor: pick }];
}
