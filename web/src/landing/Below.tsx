import { useEffect, useRef } from 'react';
import './below.css';
import { Idea } from './sections/Idea';
import { Loop } from './sections/Loop';
import { RealRound } from './sections/RealRound';
import { FollowNear } from './sections/FollowNear';
import { Moment } from './sections/Moment';
import { States } from './sections/States';
import { Curve } from './sections/Curve';
import { Trick } from './sections/Trick';
import { Atomic } from './sections/Atomic';
import { Trust } from './sections/Trust';
import { LiveFeed } from './sections/LiveFeed';
import { Simulation } from './sections/Simulation';
import { Judges } from './sections/Judges';
import { Limits, Footer } from './sections/Limits';
import { Band, Edge, SkipBand } from './edges';

/** One-shot entrances: the headline slides, the character pops. Nothing is hidden until the observer is really running. */
function useReveal(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || !('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver((list) => {
      for (const e of list) {
        if (e.isIntersecting) {
          e.target.setAttribute('data-in', '');
          seen.add(e.target);
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: '0px 0px -12% 0px' });
    const vh = window.innerHeight;
    el.querySelectorAll('.sec').forEach((s) => {
      // What is already on screen, or above it, stays as it is.
      if (s.getBoundingClientRect().top < vh * 0.9) s.setAttribute('data-in', '');
      else { s.setAttribute('data-wait', ''); io.observe(s); }
    });
    return () => io.disconnect();
  }, [root]);
}

export default function Below() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  return (
    <div ref={root}>
      <Idea />
      <Edge kind="fringe" />
      <Loop />
      <Edge kind="zig" />
      <RealRound />
      <Edge kind="fringe" />
      <FollowNear />
      <Moment />
      <Edge kind="zig" />
      <States />
      <SkipBand />
      <Curve />
      <Edge kind="fringe" />
      <Trick />
      <Edge kind="zig" />
      <Atomic />
      <Band items={['Who can cheat?', 'Nobody holds a key', 'No setter exists', 'Not even the author', 'Check it yourself']} tone="mustard" tilt={-1.4} />
      <Trust />
      <Edge kind="fringe" />
      <LiveFeed />
      <Edge kind="zig" />
      <Simulation />
      <Band items={['For judges', 'Five requirements', 'Five checks', 'No wallet', 'No secret', 'If one fails, the claim is false']} tone="ink" tilt={1.2} />
      <Judges />
      <Edge kind="fringe" />
      <Limits />
      <Footer />
    </div>
  );
}
