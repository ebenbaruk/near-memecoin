// Exact JSON shapes of the contract's views (20-contract.md §3). Amounts are decimal strings;
// `B()` from format/near.ts turns them into BigInt at the point of use.
export interface Params {
  name: string; symbol: string; p0: string; a: string;
  fee_bps: number; tau_bps: number; hwm_floor_bps: number;
  pot_min: string; min_buy: string; journal_fee: string; rug_fee: string;
}
export interface State {
  supply: string; x: string; burned: string; reserve: string; pot: string; hwm: string;
  t_required: string; round_id: number; rugs_count: number; journal_len: number;
  spot_price: string; floor_price: string; floor_reserve: string;
  balance: string; storage_cost: string; surplus: { positive: boolean; abs: string };
}
export interface Gap {
  feasible: boolean; positive: boolean; abs: string;
  tokens_needed: string; t_required: string; pot: string;
}
export interface GapBuy extends Gap { deposit_needed: string; min_out: string; cost: string }
export type Kind = 'buy' | 'sell' | 'rug' | 'payout_failed';
export interface JournalEntry {
  kind: Kind; account: string; tokens: string; near: string; fee: string;
  supply_after: string; x_after: string; pot_after: string; ts_ms: number; block: number;
}
export interface RugRecord {
  round_id: number; rugger: string; burned: string; payout: string; pot_before: string;
  supply_before: string; x_after: string; ts_ms: number; block: number;
}
export interface InstanceInfo {
  contractId: string; label: string; tagline: string; bots: string;
}
export interface InstancesFile {
  default: string; botSuffix: string; instances: Record<string, InstanceInfo>;
}
export type Zone = 'locked' | 'cold' | 'warm' | 'live';
export interface FrozenCopy {
  takenAt: number; block: number; params: Params; state: State;
  gapBuy: GapBuy | null; gapHolder: Gap | null; rugs: RugRecord[]; journal: JournalEntry[];
}
