import { useEffect, useState } from 'react';

export type Route = 'pot' | 'wall' | 'log' | 'rules' | 'sim' | 'verify';

const MAP: Record<string, Route> = {
  '#/': 'pot', '': 'pot', '#': 'pot', '#/wall': 'wall', '#/log': 'log',
  '#/proof': 'rules', '#/proof/rules': 'rules', '#/proof/sim': 'sim', '#/proof/verify': 'verify',
};
export const HREF: Record<Route, string> = {
  pot: '#/', wall: '#/wall', log: '#/log', rules: '#/proof/rules', sim: '#/proof/sim', verify: '#/proof/verify',
};

const read = (): Route => MAP[location.hash] ?? 'pot';

export function useHashRoute(): Route {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
