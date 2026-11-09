import { useEffect, useMemo, useRef, useState } from 'react';
import { audit, botShare, isBot, type AuditResult } from '../chain/journal';
import type { JournalEntry } from '../chain/types';
import * as v from '../chain/views';
import { B, ago, fmtNear, fmtTokens, shortAccount } from '../format/near';
import { useAccount, useApp, useChain, useNow } from '../hooks/context';
import { BotBadge, ExplorerLink, StateView } from './common';
import { Art } from './common';

const ROW_H = 68;
const OVERSCAN = 6;
type Filter = 'all' | 'mints' | 'burns' | 'rugs' | 'mine' | 'nobots';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'mints', label: 'Mints' }, { key: 'burns', label: 'Burns' },
  { key: 'rugs', label: 'Rugs' }, { key: 'mine', label: 'Mine' }, { key: 'nobots', label: 'No bots' },
];
const LABEL: Record<JournalEntry['kind'], string> = { buy: 'MINT', sell: 'BURN', rug: 'RUG', payout_failed: 'FAILED' };

function JournalRow({ entry, index, now }: { entry: JournalEntry | undefined; index: number; now: number }) {
  if (!entry) return <div className="j-row loading" data-testid="journal-row" data-index={index} style={{ height: ROW_H }}>#{index} …</div>;
  return (
    <div className="j-row" data-testid="journal-row" data-index={index} data-kind={entry.kind} style={{ height: ROW_H }}>
      <span className={`j-kind kind-${entry.kind}`}>{LABEL[entry.kind]}</span>
      <div className="j-main">
        <p><span className="mono">#{index}</span> <span title={entry.account}>{shortAccount(entry.account, 20)}</span> <BotBadge account={entry.account} /></p>
        <p className="mono small">{fmtTokens(B(entry.tokens))} tokens · {fmtNear(B(entry.near))} NEAR</p>
        <p className="mono small">Supply {fmtTokens(B(entry.supply_after))} · {ago(entry.ts_ms, now)}</p>
      </div>
      <ExplorerLink entry={entry} block={entry.block} />
    </div>
  );
}

export function Journal() {
  const { chain, instances } = useApp();
  const snap = useChain();
  const acct = useAccount();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [scroll, setScroll] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const len = snap.state?.journal_len ?? 0;
  const suffix = instances.botSuffix;

  useEffect(() => {
    if (filter !== 'all') void chain.ensureAll();
  }, [filter, chain, len]);

  const indexes = useMemo(() => {
    const out: number[] = [];
    for (let i = len - 1; i >= 0; i--) {
      const e = snap.journal[i];
      if (filter === 'all') {
        out.push(i);
        continue;
      }
      if (!e) continue;
      const keep =
        filter === 'mints' ? e.kind === 'buy'
          : filter === 'burns' ? e.kind === 'sell' || e.kind === 'rug'
            : filter === 'rugs' ? e.kind === 'rug'
              : filter === 'mine' ? e.account === acct.id
                : !isBot(e.account, suffix);
      if (keep) out.push(i);
    }
    return out;
  }, [filter, len, snap.journal, acct.id, suffix]);

  const viewH = Math.max(560, scroller.current?.clientHeight ?? 0);
  const first = Math.max(0, Math.floor(scroll / ROW_H) - OVERSCAN);
  const last = Math.min(indexes.length, Math.ceil((scroll + viewH) / ROW_H) + OVERSCAN);
  const visible = indexes.slice(first, last);

  useEffect(() => {
    if (filter !== 'all' || visible.length === 0) return;
    const missing = visible.filter((i) => !snap.journal[i]);
    if (missing.length) void chain.ensureRange(Math.min(...missing), Math.max(...missing) + 1);
  }, [filter, visible, snap.journal, chain]);

  const entries = snap.journal.filter((e): e is JournalEntry => Boolean(e));
  const allLoaded = entries.length >= len && len > 0;
  const share = botShare(entries, suffix);

  const runAudit = async () => {
    setAuditing(true);
    setResult(null);
    try {
      await chain.ensureAll();
      const { value: s } = await v.getState(chain.contractId);
      await chain.ensureRange(0, s.journal_len, s.journal_len);
      const list = chain.getSnapshot().journal.slice(0, s.journal_len).filter((e): e is JournalEntry => Boolean(e));
      setResult(audit(list, B(s.supply)));
    } finally {
      setAuditing(false);
    }
  };

  return (
    <main className="page journal" data-testid="journal">
      <h1 className="page-title">The Receipt</h1>
      <Art name="screens/log.webp" className="page-art" eager />
      <p className="page-lead">Every mint and every burn since genesis, read from the contract.</p>
      <div className="audit-bar">
        <button type="button" className="btn btn-sell" data-testid="journal-audit" disabled={auditing || len === 0} onClick={() => void runAudit()}>
          {auditing ? 'Adding it up…' : 'Audit'}
        </button>
        {result ? (
          <p className={result.ok ? 'audit-ok' : 'audit-bad'} data-testid="journal-audit-result">
            {result.ok ? `Journal matches supply: ${result.events} events` : `MISMATCH: journal says ${result.computed}, ft_total_supply says ${result.supply}`}
          </p>
        ) : <p className="audit-hint">Recomputes mints minus burns and compares with the contract's supply.</p>}
      </div>
      <p className="j-counters mono small">
        <span data-testid="journal-count">{indexes.length} event{indexes.length === 1 ? '' : 's'}</span>
        {' · '}
        <span data-testid="journal-bot-share">{len === 0 ? 'bots share of volume 0%' : allLoaded ? `bots share of volume ${share.pct.toFixed(1)}%` : 'bots share: loading…'}</span>
      </p>
      <div className="j-filters" role="group" aria-label="Filter the journal">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={`chip${filter === f.key ? ' active' : ''}`} aria-pressed={filter === f.key} data-testid={`journal-filter-${f.key}`} onClick={() => { setFilter(f.key); setScroll(0); if (scroller.current) scroller.current.scrollTop = 0; }}>
            {f.label}
          </button>
        ))}
      </div>
      <p className="fine-print">A NEP-141 transfer is neither a mint nor a burn, so it doesn't appear here.</p>
      {len === 0 ? (
        <div data-testid="journal-empty"><StateView art="states/empty-log.webp" message="No mints or burns yet. Be the first line on the receipt." /></div>
      ) : indexes.length === 0 ? (
        <div data-testid="journal-empty"><StateView art="mascot/curious.webp" message={filter === 'mine' && !acct.id ? 'No account yet, so nothing of yours here.' : 'Nothing matches that filter.'} /></div>
      ) : (
        <div className="j-scroll" ref={scroller} onScroll={(e) => setScroll(e.currentTarget.scrollTop)} tabIndex={0} aria-label="Journal entries">
          <div className="j-inner" style={{ height: indexes.length * ROW_H }}>
            <div className="j-window" style={{ transform: `translateY(${first * ROW_H}px)` }}>
              {visible.map((i) => <JournalRow key={i} index={i} entry={snap.journal[i]} now={now} />)}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
