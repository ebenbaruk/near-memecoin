import { useState } from 'react';
import type { RugRecord } from '../chain/types';
import { useApp } from '../hooks/context';
import { sharePoster } from './share';

export function ShareButton({ rug, testId }: { rug: RugRecord; testId: string }) {
  const { chain } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sell"
      data-testid={testId}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void sharePoster(rug, chain.contractId).finally(() => setBusy(false));
      }}
    >
      {busy ? 'Printing…' : 'Share'}
    </button>
  );
}
