import { useCallback, useEffect, useRef, useState } from 'react';
import type { RugRecord, Zone } from '../chain/types';
import { zoneOf } from '../chain/store';
import { useAccount, useApp, useChain } from '../hooks/context';
import { useHashRoute } from '../hooks/useHashRoute';
import { StateView } from './common';
import type { SheetKind } from './ActionDock';
import { BottomNav } from './BottomNav';
import { InstanceBanner } from './InstanceBanner';
import { Journal } from './Journal';
import { PotScreen } from './PotScreen';
import { ProofRoute } from './Proof';
import { RaceLost } from './RaceLost';
import { RugClimax, FINAL_PHASE } from './RugClimax';
import { RugSheet, type LostInfo } from './RugSheet';
import { RugWall } from './RugWall';
import { TradeSheet } from './TradeSheet';
import { dateLabel } from '../format/near';

interface Climax { rug: RugRecord; you: boolean; hash?: string }

export function App() {
  const route = useHashRoute();
  const { chain, instanceKey, instances } = useApp();
  const snap = useChain();
  const acct = useAccount();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [climax, setClimax] = useState<Climax | null>(null);
  const [phase, setPhase] = useState(-1);
  const [unrolling, setUnrolling] = useState(false);
  const [lost, setLost] = useState<(LostInfo & { winner: RugRecord | null }) | null>(null);
  const sheetRef = useRef(sheet);
  const acctRef = useRef(acct.id);
  const ownHash = useRef<string | undefined>(undefined);
  const shownRound = useRef(0);
  sheetRef.current = sheet;
  acctRef.current = acct.id;

  useEffect(() => {
    return chain.onRug((rug) => {
      if (shownRound.current >= rug.round_id) return;
      shownRound.current = rug.round_id;
      const you = rug.rugger === acctRef.current;
      if (sheetRef.current === 'rug' && !you && !ownHash.current) {
        setSheet(null);
        setLost({ round: rug.round_id, sent: false, winner: rug });
        return;
      }
      setSheet(null);
      window.scrollTo(0, 0);
      setClimax({ rug, you, hash: you ? ownHash.current : undefined });
    });
  }, [chain]);

  const replayed = useRef(false);
  useEffect(() => {
    if (replayed.current || !new URLSearchParams(location.search).has('replay')) return;
    if (snap.status !== 'live' || !snap.state) return;
    if (snap.state.rugs_count > 0 && snap.rugs.length === 0) return;
    replayed.current = true;
    const rug = snap.rugs[snap.rugs.length - 1] ?? {
      round_id: snap.state.round_id, rugger: 'nobody-yet.testnet', burned: snap.state.t_required, payout: snap.state.pot,
      pot_before: snap.state.pot, supply_before: snap.state.supply, x_after: snap.state.x, ts_ms: Date.now(), block: 0,
    };
    window.scrollTo(0, 0);
    setClimax({ rug, you: false });
  }, [snap.status, snap.state, snap.rugs]);

  const onLost = useCallback(
    (i: LostInfo) => {
      void chain.refresh().then(() => {
        const rugs = chain.getSnapshot().rugs;
        const winner = rugs.find((r) => r.round_id === i.round) ?? rugs[rugs.length - 1] ?? null;
        shownRound.current = Math.max(shownRound.current, i.round);
        setSheet(null);
        setLost({ ...i, winner });
      });
    },
    [chain],
  );

  const onWon = useCallback(
    (hash: string) => {
      ownHash.current = hash;
      setClimax((c) => (c ? { ...c, hash } : c));
      void chain.refresh();
    },
    [chain],
  );

  const closeClimax = useCallback(() => {
    setClimax(null);
    setPhase(-1);
    ownHash.current = undefined;
    setUnrolling(true);
    window.setTimeout(() => setUnrolling(false), 1150);
  }, []);

  const zone: Zone = snap.state && snap.params ? zoneOf(snap.state, snap.params, snap.gapBuy) : 'cold';
  const missing = snap.status === 'missing';
  const other = Object.keys(instances.instances).find((k) => k !== instanceKey);
  const otherHref = other ? `?i=${other}` : '?';

  const climaxActive = climax !== null;
  return (
    <>
      <div
        className="app"
        data-zone={zone}
        data-route={route}
        data-climax={climaxActive ? phase : undefined}
        inert={sheet !== null || lost !== null || (climaxActive && phase >= FINAL_PHASE)}
      >
        <InstanceBanner />
        {snap.status === 'frozen' && snap.frozen ? (
          <div className="frozen-banner" data-testid="frozen-copy-banner" role="status">
            Chain unreachable. Showing frozen copy from {dateLabel(snap.frozen.date)}, block {snap.frozen.block}.
          </div>
        ) : null}
        {missing ? (
          <StateView art="mascot/ghost.webp" message="This instance isn't responding.">
            <a className="btn btn-sell" href={otherHref}>Open the other instance</a>
          </StateView>
        ) : route === 'pot' ? (
          <PotScreen sheetOpen={sheet !== null} onOpen={setSheet} />
        ) : route === 'wall' ? (
          <RugWall />
        ) : route === 'log' ? (
          <Journal />
        ) : (
          <ProofRoute route={route} />
        )}
        <BottomNav route={route} />
      </div>
      {sheet === 'buy' || sheet === 'sell' ? <TradeSheet mode={sheet} onClose={() => setSheet(null)} /> : null}
      {sheet === 'rug' ? <RugSheet onClose={() => setSheet(null)} onLost={onLost} onWon={onWon} /> : null}
      {lost ? <RaceLost round={lost.round} winner={lost.winner} sent={lost.sent} onNext={() => setLost(null)} /> : null}
      <div className="grain" aria-hidden="true" />
      {unrolling ? <div className="unroll-cover" aria-hidden="true" /> : null}
      {climax ? <RugClimax rug={climax.rug} you={climax.you} hash={climax.hash} onPhase={setPhase} onClose={closeClimax} /> : null}
    </>
  );
}
