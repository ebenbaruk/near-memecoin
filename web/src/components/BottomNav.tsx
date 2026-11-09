import type { Route } from '../hooks/useHashRoute';
import { Link } from './common';

export const NAV_ITEMS: { key: 'home' | 'pot' | 'wall' | 'log' | 'proof'; label: string; to: Route; routes: Route[] }[] = [
  { key: 'home', label: 'Home', to: 'landing', routes: ['landing'] },
  { key: 'pot', label: 'Play', to: 'pot', routes: ['pot'] },
  { key: 'wall', label: 'Wall', to: 'wall', routes: ['wall'] },
  { key: 'log', label: 'Log', to: 'log', routes: ['log'] },
  { key: 'proof', label: 'Proof', to: 'rules', routes: ['rules', 'sim', 'verify'] },
];

export function BottomNav({ route }: { route: Route }) {
  return (
    <nav className="bottomnav" aria-label="Main">
      {NAV_ITEMS.map((it) => (
        <Link key={it.key} to={it.to} testId={`nav-${it.key}`} className={`nav-item${it.routes.includes(route) ? ' active' : ''}`}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
