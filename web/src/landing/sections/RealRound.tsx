import { useEffect, useMemo } from 'react';
import type { JournalEntry, RugRecord } from '../../chain/types';
import { B, dateLabel, duration, fmtNear, fmtNearFixed, fmtTokens, shortAccount } from '../../format/near';
import { useApp } from '../../hooks/context';
import { BotBadge, TEST_SUFFIX } from '../../components/common';
import { loadedJournal, thiefName, useLive } from '../data';
import { Src } from '../ui';

const LABEL: Record<JournalEntry['kind'], string> = { buy: 'Buy', sell: 'Sell', rug: 'Rug', payout_failed: 'Payout failed' };

/** The entries of the most recent finished round that the page has loaded, with a long round folded in the middle. */
function pickRound(journal: JournalEntry[], rugs: RugRecord[]) {
  const rug = rugs[rugs.length - 1];
  if (!rug) return null;
  const end = journal.findIndex((e) => e.kind === 'rug' && e.ts_ms === rug.ts_ms && e.account === rug.rugger);
  if (end < 0) return null;
  let start = end;
  while (start > 0 && journal[start - 1].kind !== 'rug') start--;
  const all = journal.slice(start, end + 1);
  const hidden = all.length > 6 ? all.length - 5 : 0;
  const rows = hidden ? [...all.slice(0, 2), ...all.slice(-3)] : all;
  return { rug, rows, hidden, total: all.length, startBlock: all[0].block, ms: rug.ts_ms - all[0].ts_ms };
}

const hiddenAfter = (hidden: number, i: number) => hidden > 0 && i === 1;

/** One stepped line through the whole receipt: the pot, entry after entry, then empty at the rug. */
function PotLine({ rows, rug, peak }: { rows: JournalEntry[]; rug: RugRecord; peak: bigint }) {
  const n = rows.length;
  const y = (v: bigint) => (peak > 0n ? 92 - Number((v * 840n) / peak) / 10 : 92);
  const pts: string[] = [];
  rows.forEach((e, i) => {
    if (e.kind === 'rug') {
      const before = B(rug.pot_before);
      pts.push(`${i},${y(before).toFixed(1)}`, `${i + 0.5},${y(before).toFixed(1)}`, `${i + 0.5},92`, `${i + 1},92`);
    } else {
      const v = y(B(e.pot_after));
      pts.push(`${i},${v.toFixed(1)}`, `${i + 1},${v.toFixed(1)}`);
    }
  });
  return (
    <svg className="r-line" viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,92 ${pts.join(' ')} ${n},92`} fill="var(--mustard)" />
      <polyline points={pts.join(' ')} fill="none" stroke="var(--brown)" strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function RealRound() {
  const { snap } = useLive();
  const { chain } = useApp();
  const round = useMemo(() => pickRound(loadedJournal(snap.journal), snap.rugs), [snap.journal, snap.rugs]);
  // The page loads the tail of the journal: a rug that happened long ago needs the older pages.
  useEffect(() => {
    if (snap.state && snap.rugs.length) void chain.ensureLastRound().catch(() => undefined);
  }, [chain, snap.state?.rugs_count, snap.rugs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const peak = round ? round.rows.reduce((m, e) => (B(e.pot_after) > m ? B(e.pot_after) : m), B(round.rug.pot_before)) : 0n;
  const ours = round?.rug.rugger.endsWith(TEST_SUFFIX) ?? false;
  const waiting = snap.status === 'loading' || snap.rugs.length > 0;
  return (
    <section id="real-round" className="sec sec-round" data-shot="round">
      <h2 className="l-h2">One real round, step by step.</h2>
      {round ? (
        <>
          <p className="round-who" data-testid="round-who">
            {ours
              ? <>Round {round.rug.round_id} was our own end-to-end test, on the real contract, {duration(round.ms)} long.</>
              : <>Round {round.rug.round_id} of the contract, {duration(round.ms)} long.</>}
          </p>
          <Src kind="past">{round.total} journal entries, ending {dateLabel(round.rug.ts_ms)}, read from <code>get_journal</code></Src>
          <div className="receipt">
            <div className="receipt-in">
              <ol className="round-roll" data-testid="real-round" style={{ '--n': round.rows.length } as React.CSSProperties}>
                {round.rows.map((e, i) => {
                  const before = e.kind === 'rug' ? round.rug.pot_before : null;
                  return (
                    <li key={`${e.block}-${i}`} className={`r-${e.kind}`}>
                      <span className="r-kind">{LABEL[e.kind]}</span>
                      <b className="r-near">{e.kind === 'buy' ? '' : '+'}{fmtNear(B(e.near))} NEAR</b>
                      <span className="r-who" title={e.account}>{shortAccount(thiefName(e.account), 18)} <BotBadge account={e.account} /></span>
                      <span className="r-coins">{e.kind === 'buy' ? 'minted' : 'burned'} {fmtTokens(B(e.tokens))} coins</span>
                      <span className="r-pot">Pot {before ? `${fmtNearFixed(B(before))} → ` : ''}{fmtNearFixed(B(e.pot_after))}</span>
                      {hiddenAfter(round.hidden, i) ? <span className="r-fold">{round.hidden} more trades, same rules</span> : null}
                    </li>
                  );
                })}
              </ol>
              <PotLine rows={round.rows} rug={round.rug} peak={peak} />
            </div>
          </div>
          <p className="round-note">The filled line is the pot, drawn to scale. It climbs with each trade and empties with the rug, in one line of the journal.</p>
        </>
      ) : (
        <p className="round-empty">{snap.status === 'missing' ? 'Chain unreachable.' : waiting ? 'Reading the journal…' : 'No round has finished yet. The first thief will appear here.'}</p>
      )}
    </section>
  );
}
