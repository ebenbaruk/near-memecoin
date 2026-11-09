import { useEffect, useState } from 'react';

/** `pot` is the game, served at #/play. `landing` is the explainer at #/; #/judges is the same page, scrolled to its judges section. */
export type Route = 'landing' | 'pot' | 'wall' | 'log' | 'rules' | 'sim' | 'verify';

const MAP: Record<string, Route> = {
  '#/': 'landing', '': 'landing', '#': 'landing', '#/judges': 'landing', '#/play': 'pot', '#/wall': 'wall', '#/log': 'log',
  '#/proof': 'rules', '#/proof/rules': 'rules', '#/proof/sim': 'sim', '#/proof/verify': 'verify',
};
export const HREF: Record<Route, string> = {
  landing: '#/', pot: '#/play', wall: '#/wall', log: '#/log', rules: '#/proof/rules', sim: '#/proof/sim', verify: '#/proof/verify',
};
export const JUDGES_HREF = '#/judges';

const read = (): Route => MAP[location.hash] ?? 'landing';

export function useHashRoute(): Route {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      // #/judges is scrolled by the landing page itself.
      if (location.hash !== JUDGES_HREF) window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
