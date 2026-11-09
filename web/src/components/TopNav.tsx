import { fmtNear, shortAccount } from '../format/near';
import { useAccount } from '../hooks/context';
import { HREF, JUDGES_HREF, type Route } from '../hooks/useHashRoute';
import { artUrl } from '../theme/art';
import { NAV_ITEMS } from './BottomNav';
import { Link } from './common';
import { InstanceBanner } from './InstanceBanner';

export function TopNav({ route }: { route: Route }) {
  const acct = useAccount();
  const wordmark = artUrl('brand/wordmark-small.webp');
  return (
    <header className="topnav">
      <a className="topnav-brand" href={HREF.landing} aria-label="Anyone Can Rug, home">
        {wordmark ? <img src={wordmark} alt="Anyone Can Rug" /> : 'Anyone Can Rug'}
      </a>
      <nav className="topnav-links" aria-label="Main">
        {NAV_ITEMS.map((it) => (
          <Link key={it.key} to={it.to} testId={`nav-${it.key}`} className={`topnav-link${it.routes.includes(route) ? ' active' : ''}`}>
            {it.label}
          </Link>
        ))}
      </nav>
      <InstanceBanner />
      {acct.id ? (
        <p className="topnav-account" data-testid="topnav-account" title={acct.id}>
          <span>{shortAccount(acct.id, 18)}</span>
          <b>{acct.near === null ? '…' : `${fmtNear(acct.near, 2)} NEAR`}</b>
        </p>
      ) : null}
      <a className="topnav-judges" href={JUDGES_HREF} data-testid="nav-judges">For judges</a>
    </header>
  );
}
