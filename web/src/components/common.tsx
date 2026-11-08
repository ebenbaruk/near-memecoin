import { type ReactNode, useEffect, useRef, useState } from 'react';
import { explorerBlock, explorerTx, resolveTxHash } from '../chain/journal';
import type { JournalEntry } from '../chain/types';
import { fmtNear } from '../format/near';
import { useApp } from '../hooks/context';
import { HREF, type Route } from '../hooks/useHashRoute';
import { artUrl, findArt } from '../theme/art';

/** `name` is a manifest asset path or a search term; nothing renders until the art exists. */
export function Art({ name, alt = '', className, eager }: { name: string; alt?: string; className?: string; eager?: boolean }) {
  const src = artUrl(name) ?? findArt(name);
  if (!src) return null;
  return <img src={src} alt={alt} className={className} draggable={false} loading={eager ? 'eager' : 'lazy'} decoding="async" />;
}

export function BotBadge({ account }: { account: string }) {
  const { instances } = useApp();
  return account.endsWith(instances.botSuffix) ? <span className="badge bot" title="Account ends with the public bot suffix">BOT</span> : null;
}

const BOT_TEXT = "Demo bots are asleep. The coin doesn't need them. You can still rug it.";

export function BotsAsleep() {
  return <StateView art="states/bots-asleep.webp" compact message={BOT_TEXT} />;
}

export function StateView({
  message, art = 'mascot/curious.webp', detail, compact, children,
}: { message: string; art?: string; detail?: string; compact?: boolean; children?: ReactNode }) {
  return (
    <div className={`state-view${compact ? ' compact' : ''}`} data-testid="state-view">
      <Art name={art} className="state-art" eager />
      <p className="state-msg">{message}</p>
      {detail ? <p className="state-detail">{detail}</p> : null}
      {children}
    </div>
  );
}

export function Link({ to, children, className, testId }: { to: Route; children: ReactNode; className?: string; testId?: string }) {
  return <a className={className} href={HREF[to]} data-testid={testId}>{children}</a>;
}

/** Hash resolved on demand through FastNEAR; falls back to the block number if that service is down. */
export function ExplorerLink({ entry, block }: { entry?: JournalEntry; block: number }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [hash, setHash] = useState<string | null>(null);
  if (state === 'done') {
    return hash
      ? <a className="ex-link" href={explorerTx(hash)} target="_blank" rel="noreferrer">View tx ↗</a>
      : <a className="ex-link" href={explorerBlock(block)} target="_blank" rel="noreferrer">Block {block} ↗</a>;
  }
  return (
    <button
      type="button"
      className="ex-link"
      disabled={state === 'loading'}
      onClick={() => {
        setState('loading');
        const job = entry ? resolveTxHash(entry) : Promise.resolve(null);
        void job.then((h) => {
          setHash(h);
          setState('done');
        });
      }}
    >
      {state === 'loading' ? '…' : 'Find tx'}
    </button>
  );
}

/** Focus trap + Escape, shared by every sheet. */
export function useModal(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),summary,[tabindex="0"]')).filter(
        (n) => n.offsetParent !== null,
      );
    (focusables()[0] ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (!el.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);
  return ref;
}

export function Sheet({
  testId, title, onClose, full, children,
}: { testId: string; title: string; onClose: () => void; full?: boolean; children: ReactNode }) {
  const ref = useModal(onClose);
  return (
    <div className={`sheet-root${full ? ' full' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} data-testid={testId} ref={ref} tabIndex={-1}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function nearText(yocto: bigint): string {
  return fmtNear(yocto);
}
