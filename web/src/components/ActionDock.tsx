export type SheetKind = 'buy' | 'sell' | 'rug';

const ITEMS: { kind: SheetKind; label: string; className: string }[] = [
  { kind: 'buy', label: 'Buy', className: 'btn btn-buy' },
  { kind: 'sell', label: 'Sell', className: 'btn btn-sell' },
  { kind: 'rug', label: 'Rug it', className: 'btn btn-rug' },
];

/** The three actions. On phones they open a sheet; `active` marks the open panel of the desktop console. */
export function ActionDock({ disabled, onOpen, active, live, badge }: { disabled: boolean; onOpen: (k: SheetKind) => void; active?: SheetKind; live?: boolean; badge?: string }) {
  return (
    <div className="dock" role={active ? 'tablist' : undefined} aria-label={active ? 'Actions' : undefined}>
      {ITEMS.map((it) => (
        <button
          key={it.kind}
          type="button"
          className={`${it.className}${active === it.kind ? ' active' : ''}${live && it.kind === 'rug' ? ' pulse' : ''}`}
          data-testid={`dock-${it.kind}`}
          role={active ? 'tab' : undefined}
          aria-selected={active ? active === it.kind : undefined}
          disabled={disabled}
          onClick={() => onOpen(it.kind)}
        >
          <span className="dock-label">
            {it.label}
            {badge && it.kind === 'rug' ? <span className="dock-badge" data-testid="dock-rug-badge">{badge}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}
