import type { RugRecord } from '../chain/types';
import { B, fmtNear, shortAccount } from '../format/near';
import { useApp } from '../hooks/context';
import { Art } from './common';
import { Mugshot } from './Mugshot';

export function WantedPoster({ rug, big, testId }: { rug: RugRecord; big?: boolean; testId?: string }) {
  const { instances } = useApp();
  const bot = rug.rugger.endsWith(instances.botSuffix);
  return (
    <div className={`poster${big ? ' big' : ''}`} data-testid={testId ?? 'wanted-poster'}>
      <Art name="wanted/poster-blank.webp" className="poster-bg" alt="" />
      <Mugshot account={rug.rugger} />
      {bot ? <Art name="stamps/bot.webp" className="poster-botstamp" alt="BOT" /> : null}
      <span className="stamp-round">ROUND {rug.round_id}</span>
      {big ? <Art name="stamps/rugged.webp" className="poster-ruggedstamp" alt="" eager /> : null}
      <p className="poster-name" title={rug.rugger}>{shortAccount(rug.rugger, big ? 26 : 18)}</p>
      <p className="poster-crime">STOLE {fmtNear(B(rug.payout))} NEAR</p>
    </div>
  );
}
