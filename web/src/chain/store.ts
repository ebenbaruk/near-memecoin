// One ChainStore per page load (switching instance reloads the page with ?i=).
// Polls get_state; everything else is only re-read when journal_len says something happened.
import { B } from '../format/near';
import { ChainDownError, QueryError, rpcIndex } from './rpc';
import * as v from './views';
import type { FrozenCopy, Gap, GapBuy, JournalEntry, Params, RugRecord, State, Zone } from './types';

const PAGE = 50;
const POLL_MS = 2000;
const MAX_BACKOFF_MS = 30000;

export type ChainStatus = 'loading' | 'live' | 'frozen' | 'missing';

export interface ChainSnapshot {
  contractId: string;
  status: ChainStatus;
  params: Params | null;
  state: State | null;
  gapBuy: GapBuy | null;
  gapHolder: Gap | null;
  rugs: RugRecord[];
  journal: (JournalEntry | undefined)[];
  journalLoaded: number;
  lastOkAt: number | null;
  lastBlock: number | null;
  rpcIndex: number;
  frozen: { date: number; block: number } | null;
}

type RugListener = (rug: RugRecord) => void;

export class ChainStore {
  private snap: ChainSnapshot;
  private listeners = new Set<() => void>();
  private rugListeners = new Set<RugListener>();
  private timer: number | undefined;
  private failures = 0;
  private stopped = false;
  private account: string | null = null;
  private journalJobs = new Map<string, Promise<void>>();

  constructor(readonly contractId: string, private readonly snapshotUrl: string) {
    this.snap = {
      contractId, status: 'loading', params: null, state: null, gapBuy: null, gapHolder: null,
      rugs: [], journal: [], journalLoaded: 0, lastOkAt: null, lastBlock: null, rpcIndex: 0, frozen: null,
    };
    this.restoreJournal();
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = () => this.snap;
  onRug(cb: RugListener) {
    this.rugListeners.add(cb);
    return () => {
      this.rugListeners.delete(cb);
    };
  }

  private set(patch: Partial<ChainSnapshot>) {
    this.snap = { ...this.snap, ...patch, rpcIndex: rpcIndex() };
    this.listeners.forEach((l) => l());
  }

  start() {
    this.stopped = false;
    void this.tick();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    if (document.hidden) window.clearTimeout(this.timer);
    else void this.tick();
  };

  /** Immediate refresh (after a transaction, or to freeze a quote). */
  refresh = () => this.tick();

  setAccount(account: string | null) {
    if (account === this.account) return;
    this.account = account;
    void this.refreshGaps();
  }

  private schedule(ms: number) {
    window.clearTimeout(this.timer);
    if (!this.stopped && !document.hidden) this.timer = window.setTimeout(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    window.clearTimeout(this.timer);
    try {
      const prev = this.snap.state;
      const { value: state, block } = await v.getState(this.contractId);
      this.failures = 0;
      const params = this.snap.params ?? (await v.getParams(this.contractId));
      const moved = !prev || prev.journal_len !== state.journal_len || prev.round_id !== state.round_id;
      if (moved) {
        await this.refreshGaps(state, params);
        const tail = Promise.all([this.loadRugs(state), this.loadTail(state)]);
        if (prev && state.round_id > prev.round_id) {
          await tail;
          const rug = this.snap.rugs[this.snap.rugs.length - 1];
          if (rug) this.rugListeners.forEach((l) => l(rug));
        } else {
          void tail.catch(() => undefined);
        }
      }
      this.set({ status: 'live', state, params, lastOkAt: Date.now(), lastBlock: block, frozen: null });
      this.schedule(POLL_MS);
    } catch (e) {
      this.failures++;
      await this.onFailure(e);
      this.schedule(Math.min(POLL_MS * 2 ** this.failures, MAX_BACKOFF_MS));
    }
  }

  private async refreshGaps(state?: State, params?: Params) {
    const st = state ?? this.snap.state;
    if (!st || !(params ?? this.snap.params)) return;
    try {
      const [gapBuy, gapHolder] = await Promise.all([
        v.getGapBuy(this.contractId, this.account),
        v.getGapHolder(this.contractId),
      ]);
      this.set({ gapBuy, gapHolder });
    } catch (e) {
      if (!(e instanceof ChainDownError)) throw e;
    }
  }

  private async loadRugs(state: State) {
    const rugs = [...this.snap.rugs];
    let from = rugs.length;
    while (from < state.rugs_count) {
      const page = await v.getRugs(this.contractId, from, 50);
      if (page.length === 0) break;
      rugs.push(...page);
      from += page.length;
    }
    this.set({ rugs });
  }

  private async loadTail(state: State) {
    const len = state.journal_len;
    await this.ensureRange(Math.max(0, len - PAGE), len, len);
  }

  private async onFailure(e: unknown) {
    if (e instanceof QueryError) {
      // The endpoint works but the instance does not exist or has no contract.
      this.set({ status: 'missing' });
      return;
    }
    if (!(e instanceof ChainDownError)) {
      // A malformed response counts as a failed endpoint for this tick.
      if (this.snap.status !== 'live') this.set({ status: 'missing' });
      return;
    }
    if (this.snap.state && this.failures < 2) return;
    if (this.snap.status === 'frozen') return;
    if (this.snap.state && this.snap.params) {
      this.set({ status: 'frozen', frozen: { date: this.snap.lastOkAt ?? Date.now(), block: this.snap.lastBlock ?? 0 } });
      return;
    }
    const copy = await this.loadSnapshotFile();
    if (copy) {
      this.journalFromCopy(copy);
      this.set({
        status: 'frozen', params: copy.params, state: copy.state, gapBuy: copy.gapBuy, gapHolder: copy.gapHolder,
        rugs: copy.rugs, frozen: { date: copy.takenAt, block: copy.block },
      });
    } else {
      this.set({ status: 'missing' });
    }
  }

  private async loadSnapshotFile(): Promise<FrozenCopy | null> {
    try {
      const res = await fetch(this.snapshotUrl);
      if (!res.ok) return null;
      return (await res.json()) as FrozenCopy;
    } catch {
      return null;
    }
  }

  private journalFromCopy(copy: FrozenCopy) {
    const journal = [...this.snap.journal];
    copy.journal.forEach((e, i) => (journal[i] = e));
    this.set({ journal, journalLoaded: journal.filter(Boolean).length });
  }

  // ---- Journal: a sparse array indexed by position. Entries never change, so they cache forever.
  private cacheKey() {
    return `acr:journal:${this.contractId}`;
  }

  private restoreJournal() {
    try {
      const raw = sessionStorage.getItem(this.cacheKey());
      if (!raw) return;
      const parsed = JSON.parse(raw) as (JournalEntry | null)[];
      this.snap = { ...this.snap, journal: parsed.map((e) => e ?? undefined), journalLoaded: parsed.filter(Boolean).length };
    } catch {
      /* no cache */
    }
  }

  private persistJournal() {
    try {
      sessionStorage.setItem(this.cacheKey(), JSON.stringify(this.snap.journal.map((e) => e ?? null)));
    } catch {
      /* storage full: the RPC stays the source */
    }
  }

  /** Loads [from, to) if any entry is missing, in pages of 50. */
  ensureRange(from: number, to: number, knownLen?: number): Promise<void> {
    const key = `${from}-${to}`;
    const running = this.journalJobs.get(key);
    if (running) return running;
    const job = this.loadRange(from, to, knownLen).finally(() => this.journalJobs.delete(key));
    this.journalJobs.set(key, job);
    return job;
  }

  private async loadRange(from: number, to: number, knownLen?: number) {
    const journal = this.snap.journal;
    let i = from;
    let changed = false;
    while (i < to) {
      while (i < to && journal[i]) i++;
      if (i >= to) break;
      const page = await v.getJournal(this.contractId, i, PAGE);
      if (page.length === 0) break;
      page.forEach((e, j) => (journal[i + j] = e));
      i += page.length;
      changed = true;
    }
    if (knownLen !== undefined) journal.length = Math.max(journal.length, knownLen);
    if (changed) {
      this.set({ journal: [...journal], journalLoaded: journal.filter(Boolean).length });
      this.persistJournal();
    }
  }

  async ensureAll(): Promise<number> {
    const len = this.snap.state?.journal_len ?? 0;
    await this.ensureRange(0, len, len);
    return len;
  }
}

export function zoneOf(state: State, params: Params, gap: GapBuy | null): Zone {
  if (B(state.pot) < B(params.pot_min)) return 'locked';
  if (!gap) return 'cold';
  if (gap.positive) return 'live';
  return B(gap.abs) * 4n > B(gap.cost) ? 'cold' : 'warm';
}

/** How far the corner is peeled: the Gap, drawn. Numbers come from the art manifest. */
export function liftOf(zone: Zone, gap: GapBuy | null, art?: { lift?: number; liftRange?: [number, number] }): number {
  if (!gap || zone === 'locked') return art?.lift ?? 0;
  if (zone === 'warm') {
    const [lo, hi] = art?.liftRange ?? [0.1, 0.55];
    const cost = B(gap.cost);
    if (cost === 0n) return lo;
    const closed = Number(10000n - (B(gap.abs) * 40000n) / cost) / 10000; // 0 at -25 %, 1 at 0.
    return lo + Math.max(0, Math.min(1, closed)) * (hi - lo);
  }
  return art?.lift ?? (zone === 'live' ? 0.92 : 0.04);
}

/** Pile art size, 1..4: the pot against the price of stealing it. */
export function pileSize(pot: bigint, gap: GapBuy | null): 1 | 2 | 3 | 4 {
  const cost = gap ? B(gap.cost) : 0n;
  if (cost === 0n || pot === 0n) return 1;
  if (pot * 2n < cost) return 1;
  if (pot < cost) return 2;
  if (pot < 2n * cost) return 3;
  return 4;
}
