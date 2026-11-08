import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { AccountStore } from '../chain/account';
import type { ChainStore } from '../chain/store';
import type { InstanceInfo, InstancesFile } from '../chain/types';

export interface AppCtx {
  instanceKey: string;
  info: InstanceInfo;
  instances: InstancesFile;
  chain: ChainStore;
  account: AccountStore;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('App context missing');
  return c;
}

export function useChain() {
  const { chain } = useApp();
  return useSyncExternalStore(chain.subscribe, chain.getSnapshot);
}

export function useAccount() {
  const { account } = useApp();
  return useSyncExternalStore(account.subscribe, account.getSnapshot);
}

/** A clock for "age" labels. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}
