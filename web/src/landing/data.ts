import { useMemo } from 'react';
import { rugPriceOf } from '../chain/store';
import type { JournalEntry, RugRecord, Zone } from '../chain/types';
import { B, shownTake } from '../format/near';
import { useChain } from '../hooks/context';

/** The same rule as zoneOf() in chain/store.ts, for what-if values. `ownFee` is what the rug's own buy adds to the pot before the minimum is tested. */
export function zoneFor(pot: bigint, cost: bigint, rugPrice: bigint, potMin: bigint, ownFee = 0n): Zone {
  if (pot + ownFee < potMin) return 'locked';
  if (pot >= rugPrice) return 'live';
  return (rugPrice - pot) * 4n > cost ? 'cold' : 'warm';
}

export type HeapTier = 0 | 1 | 2 | 3 | 4;

/** heap-1 to heap-4 follow pileSize() of the game; heap-0 is a pot at zero or under a tenth of the rug price. */
export function heapTier(pot: bigint, cost: bigint, rugPrice: bigint): HeapTier {
  if (pot === 0n || pot * 10n < rugPrice) return 0;
  if (pot * 2n < cost) return 1;
  if (pot < cost) return 2;
  if (pot < 2n * cost) return 3;
  return 4;
}

export const HEAP_NAME = ['heap-0-crumbs', 'heap-1-coins', 'heap-2-stack', 'heap-3-sacks', 'heap-4-mountain'] as const;

export function useLive() {
  const snap = useChain();
  return useMemo(() => {
    const { state, params, gapBuy, rugs, status, frozen } = snap;
    const rugPrice = rugPriceOf(gapBuy, params);
    const ready = state !== null && params !== null && gapBuy !== null && rugPrice !== null;
    const pot = state ? B(state.pot) : 0n;
    const cost = gapBuy ? B(gapBuy.cost) : 0n;
    const lastRug: RugRecord | null = rugs.length ? rugs[rugs.length - 1] : null;
    return {
      snap, ready, status, frozen, state, params, gapBuy, rugs, lastRug, pot, cost,
      rugPrice: rugPrice ?? 0n,
      take: ready ? shownTake(pot, rugPrice) : 0n,
      potMin: params ? B(params.pot_min) : 0n,
      feeBps: params ? BigInt(params.fee_bps) : 200n,
      round: state?.round_id ?? 0,
      ownFee: gapBuy && B(gapBuy.deposit_needed) > cost ? B(gapBuy.deposit_needed) - cost : 0n,
      zone: ready ? (gapBuy.feasible ? zoneFor(pot, cost, rugPrice, 0n) : ('locked' as Zone)) : ('locked' as Zone),
    };
  }, [snap]);
}

export type LiveData = ReturnType<typeof useLive>;

/** What a section prints while it has no state to draw. */
export const waitText = (status: string) => (status === 'missing' ? 'Chain unreachable.' : 'Reading the chain…');

export function loadedJournal(j: (JournalEntry | undefined)[]): JournalEntry[] {
  return j.filter((e): e is JournalEntry => Boolean(e));
}

export { thiefName } from '../format/near';

function reduced() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const STABLE_MS = 1500; // the page counts as settled after this long without a size change
const GIVE_UP_MS = 6000;
let stopAnchor: (() => void) | null = null;

/**
 * Scrolls to a section of the page. The sections and images above it may still be loading, which moves it:
 * the page keeps the section anchored until the height has settled, or until the reader scrolls.
 */
export function jumpTo(id: string, smooth = false) {
  stopAnchor?.();
  let tries = 0;
  let done = false;
  const cleanup: (() => void)[] = [];
  const stop = () => {
    done = true;
    cleanup.forEach((f) => f());
    if (stopAnchor === stop) stopAnchor = null;
  };
  stopAnchor = stop;
  const start = () => {
    if (done) return;
    const el = document.getElementById(id);
    if (!el) {
      if (tries++ < 200) window.setTimeout(start, 50);
      return;
    }
    // A target folded away is opened first: a link never lands on nothing.
    for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
    el.scrollIntoView({ behavior: smooth && !reduced() ? 'smooth' : 'auto', block: 'start' });
    if (smooth) return stop(); // a click on a settled page: the browser's scroll is enough
    const main = document.querySelector('main.l');
    if (!main) return stop();
    let timer = window.setTimeout(stop, STABLE_MS);
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(stop, STABLE_MS);
      el.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    ro.observe(main);
    const limit = window.setTimeout(stop, GIVE_UP_MS);
    cleanup.push(() => { ro.disconnect(); window.clearTimeout(timer); window.clearTimeout(limit); });
    for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) {
      window.addEventListener(ev, stop, { once: true, passive: true });
      cleanup.push(() => window.removeEventListener(ev, stop));
    }
  };
  start();
}
