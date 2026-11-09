import { useApp } from '../hooks/context';

const FAST_ID = 'rugfast.acr-ops.testnet';
const SIM_ID = 'anyonecanrug.testnet';

/** Says, in plain words, which of the two contracts the numbers on this page come from. */
export function TwoContracts() {
  const { instanceKey } = useApp();
  const showing = instanceKey === 'fast' ? 'the fast one' : 'the main one';
  const go = (key: string) => {
    const url = new URL(location.href);
    url.searchParams.set('i', key);
    url.searchParams.delete('replay');
    location.href = url.toString();
  };
  return (
    <aside className="two" data-testid="two-contracts" aria-label="Two contracts">
      <p>
        <b>Two contracts, same code.</b> <code>{SIM_ID}</code> ($RUGPRICE), the main one, uses the parameters picked by the simulation. <code>{FAST_ID}</code> ($RUGFAST) has a flatter curve so rugs are cheap in the demo. <b>This page shows {showing}.</b>
      </p>
      <div className="two-btns">
        <button type="button" className={instanceKey === 'live' ? 'on' : ''} aria-pressed={instanceKey === 'live'} data-testid="show-simulated" onClick={() => go('live')}>Show the main contract</button>
        <button type="button" className={instanceKey === 'fast' ? 'on' : ''} aria-pressed={instanceKey === 'fast'} data-testid="show-fast" onClick={() => go('fast')}>Show the fast contract</button>
      </div>
    </aside>
  );
}
