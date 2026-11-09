import { lazy, Suspense, useEffect } from 'react';
import { useApp } from '../hooks/context';
import { JUDGES_HREF } from '../hooks/useHashRoute';
import { useBotsAwake } from '../components/InstanceBanner';
import { jumpTo } from './data';
import { Hero } from './Hero';
import { JudgeStrip } from './JudgeStrip';
import { TwoContracts } from './TwoContracts';
import './landing.css';

const Below = lazy(() => import('./Below'));

/** A slim bar below desktop width, which also says which contract is showing: the desktop top navigation carries the same two things. */
function JudgeBar() {
  const { instanceKey } = useApp();
  const awake = useBotsAwake();
  return (
    <div className="l-judgebar" data-testid="judge-bar">
      <span>{instanceKey === 'fast' ? 'Fast contract' : 'Main contract'}<i> · {awake ? 'bots trading' : 'bots asleep'}</i></span>
      <a href={JUDGES_HREF} data-testid="judge-bar-link">For judges <b>5 checks ↓</b></a>
    </div>
  );
}

export default function Landing() {
  useEffect(() => {
    if (location.hash === JUDGES_HREF) jumpTo('judges');
    const onHash = () => {
      if (location.hash === JUDGES_HREF) jumpTo('judges');
    };
    // A click on a link to the hash we are already on fires no hashchange.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.(`a[href="${JUDGES_HREF}"]`);
      if (a && location.hash === JUDGES_HREF) {
        e.preventDefault();
        jumpTo('judges');
      }
    };
    window.addEventListener('hashchange', onHash);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('click', onClick);
    };
  }, []);
  return (
    <main className="l" data-testid="landing">
      <JudgeBar />
      <Hero />
      <JudgeStrip />
      <TwoContracts />
      <Suspense fallback={<div className="l-wait" aria-busy="true">Unrolling the rest of the rug…</div>}>
        <Below />
      </Suspense>
    </main>
  );
}
