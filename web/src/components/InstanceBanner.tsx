import { useMemo } from 'react';
import { useApp, useChain, useNow } from '../hooks/context';
import { isBot } from '../chain/journal';

const BOT_FRESH_MS = 30 * 60 * 1000;

export function useBotsAwake(): boolean {
  const { instances } = useApp();
  const { journal } = useChain();
  const now = useNow(15000);
  return useMemo(() => {
    for (let i = journal.length - 1; i >= 0; i--) {
      const e = journal[i];
      if (e && isBot(e.account, instances.botSuffix)) return now - e.ts_ms < BOT_FRESH_MS;
    }
    return false;
  }, [journal, instances.botSuffix, now]);
}

export function InstanceBanner() {
  const { info, instanceKey, instances } = useApp();
  const awake = useBotsAwake();
  const other = Object.keys(instances.instances).find((k) => k !== instanceKey) ?? instanceKey;
  const go = () => {
    const url = new URL(location.href);
    url.searchParams.set('i', other);
    url.searchParams.delete('replay');
    location.href = url.toString();
  };
  return (
    <div className="banner" data-testid="instance-banner">
      <p className="banner-text">
        <span data-testid="instance-name">{info.label}</span>
        {' · '}{info.tagline}{' · '}
        <span data-testid="bots-status">{awake ? 'bots trading' : 'bots asleep'}</span>
      </p>
      <button type="button" className="banner-switch" data-testid="instance-switch" onClick={go} aria-label={`Switch to the ${other} instance`}>
        <span>{other === 'live' ? 'Live' : 'Fast'}</span>
      </button>
    </div>
  );
}
