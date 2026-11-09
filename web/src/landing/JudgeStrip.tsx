import { JUDGES_HREF } from '../hooks/useHashRoute';
import { Jump } from './ui';

const REQUIREMENTS: [string, string][] = [
  ['NEP-141, mechanic in the contract', 'NEP-141'],
  ['Parameters fixed, no admin key', 'No admin'],
  ['Splitting into fake accounts gets no discount; limits written', 'Fake accts'],
  ['A page with every mint and burn', 'Log'],
  ['60-day simulation first', '60 days'],
];

export function JudgeStrip() {
  return (
    <nav className="l-strip" aria-label="The five requirements" data-testid="judges-strip">
      <b>Judging this?</b>
      <ol>{REQUIREMENTS.map(([long, short], i) => <li key={short}><Jump to={`req-${i + 1}`} label={`Requirement ${i + 1}: ${long}`}><i>{i + 1}</i><span className="sl-long">{long}</span><span className="sl-short">{short}</span></Jump></li>)}</ol>
      <a className="l-strip-all" href={JUDGES_HREF}>Evidence and commands ↓</a>
    </nav>
  );
}
