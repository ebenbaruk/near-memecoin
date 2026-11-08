import type { CSSProperties } from 'react';
import type { RugRecord } from '../chain/types';
import { B, fmtNear, shortAccount } from '../format/near';
import { useApp } from '../hooks/context';
import { Art } from './common';
import { Mugshot } from './Mugshot';

/** The name bar holds about 20 characters on a small poster: `.testnet` goes, nothing else does. */
export function posterName(account: string, big?: boolean): string {
  return big ? shortAccount(account, 44) : shortAccount(account.replace(/\.testnet$/, ''), 34);
}

const fit = (text: string) => ({ '--chars': text.length }) as CSSProperties;

export function WantedPoster({ rug, big, testId }: { rug: RugRecord; big?: boolean; testId?: string }) {
  const { instances } = useApp();
  const bot = rug.rugger.endsWith(instances.botSuffix);
  const name = posterName(rug.rugger, big);
  const crime = `STOLE ${fmtNear(B(rug.payout))} NEAR`;
  return (
    <div className={`poster${big ? ' big' : ''}`} data-testid={testId ?? 'wanted-poster'}>
      <Art name="wanted/poster-blank.webp" className="poster-bg" alt="" eager={big} />
      <Mugshot account={rug.rugger} />
      <span className="stamp-round">
        {bot ? <Art name="stamps/bot.webp" className="poster-botstamp" alt="BOT" eager={big} /> : null}
        <span>ROUND {rug.round_id}</span>
      </span>
      <p className="poster-name" title={rug.rugger} style={fit(name)}>{name}</p>
      <p className="poster-crime" style={fit(crime)}>{crime}</p>
    </div>
  );
}
