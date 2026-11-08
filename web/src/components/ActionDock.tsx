export type SheetKind = 'buy' | 'sell' | 'rug';

export function ActionDock({ disabled, onOpen }: { disabled: boolean; onOpen: (k: SheetKind) => void }) {
  return (
    <div className="dock">
      <button type="button" className="btn btn-buy" data-testid="dock-buy" disabled={disabled} onClick={() => onOpen('buy')}>Buy</button>
      <button type="button" className="btn btn-sell" data-testid="dock-sell" disabled={disabled} onClick={() => onOpen('sell')}>Sell</button>
      <button type="button" className="btn btn-rug" data-testid="dock-rug" disabled={disabled} onClick={() => onOpen('rug')}>Rug it</button>
    </div>
  );
}
