import type { JournalEntry } from '../chain/types';
import { B, fmtNear, shortAccount, thiefName } from '../format/near';
import { useChain } from '../hooks/context';

const LABEL: Record<JournalEntry['kind'], string> = { buy: 'MINT', sell: 'BURN', rug: 'RUG', payout_failed: 'FAILED' };

export function Marquee() {
  const { journal } = useChain();
  const events: string[] = [];
  for (let i = journal.length - 1; i >= 0 && events.length < 4; i--) {
    const e = journal[i];
    if (e) events.push(`#${i} ${LABEL[e.kind]} ${shortAccount(thiefName(e.account), 16)} ${fmtNear(B(e.near))} NEAR`);
  }
  const text = ['ANYONE CAN STEAL THE POT', ...events].join('  ✦  ') + '  ✦  ';
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        <span>{text}</span><span>{text}</span>
      </div>
    </div>
  );
}
