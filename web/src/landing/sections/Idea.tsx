import { useTryIt } from '../../hooks/context';
import { Pic } from '../art';
import { useLive } from '../data';
import { useIsPhone } from '../ui';

const GLOSSARY: [string, string][] = [
  ['Memecoin', 'A coin that exists for the joke. Normally nothing backs it.'],
  ['Testnet', "NEAR's practice network. Real transactions, money with no value."],
  ['NEP-141', "NEAR's standard coin format, like ERC-20 on Ethereum."],
  ['Contract', 'A program stored on the chain. It runs by itself, and it does exactly what its code says.'],
  ['On-chain', 'Recorded on the blockchain for everyone to read.'],
  ['Bonding curve', "A price rule written in code: the more coins have been bought and not sold back, the higher the price. A rug's burn doesn't count."],
  ['Reserve', 'The NEAR the contract holds to buy coins back. A rug never touches it.'],
  ['Mint', 'Create new coins. Buying on the curve does it.'],
  ['Burn', 'Destroy coins for good. The supply goes down.'],
  ['The pot', 'The 2% tips, piled up, inside the contract.'],
  ['The rug price', 'What taking the pot costs right now: the coins you must burn, the small charges, and the fixed fee.'],
  ['The take', 'The pot minus the rug price. Negative: the heist loses NEAR. Positive: whoever moves first keeps the difference. The contract calls this the gap.'],
  ['Journal', "The contract's own list of every mint, burn and rug. Anyone can read it."],
  ['Atomic', 'Several steps in one transaction. All of them happen, or none of them do.'],
  ['Gas', 'The small network charge for a transaction.'],
  ['Registration', 'A small one-time NEAR charge for a first buy, so the contract can store your balance.'],
  ['Whale', 'Someone holding a lot of the coins.'],
  ['Market maker', 'A company paid to keep a coin tradable. Here the curve does that job.'],
  ['Fake accounts (Sybil)', 'One person pretending to be many. Here splitting buys no discount, and we say why.'],
  ['Supply', 'All the coins that exist right now.'],
  ['Remembered high', 'A supply mark the contract keeps. A buy can raise it, a rug lets it fade by at most 10%. The coins to burn are never computed on less than 90% of it.'],
  ['Position', 'How far along the curve the price stands: coins minted and not sold back. Burned coins still count.'],
  ['Wash trader', 'Someone buying and selling to themselves, to pump the numbers or the pot.'],
];

const QA: [string, React.ReactNode][] = [
  ['What can I do?', <>Buy, sell, or pull the rug, in a few taps. <b>No wallet needed:</b> the page makes you a throwaway testnet account.</>],
  ['What do I win?', <><b>The pot</b>, if you get there first, and your name on the Wall. Testnet NEAR has no value: you win the honour of it.</>],
  ['Is it real?', <><b>Yes.</b> A real contract on NEAR testnet, every move a real transaction, and <b>zero access keys</b> on the account. Nobody can change it, the author included.</>],
  ['Will I win?', <><b>Probably not.</b> Bots and whales are faster. Our own simulation says so, and this page shows you how they do it.</>],
];

export function Idea() {
  const tryIt = useTryIt();
  const phone = useIsPhone();
  const { params } = useLive();
  const coin = params ? `$${params.symbol}` : 'This coin';
  const shown = phone ? QA.slice(0, 2) : QA;
  return (
    <section id="idea" className="sec sec-idea" data-shot="idea">
      <Pic n="thief-run" className="idea-thief pop" sizes="(min-width: 1100px) 30vw, 60vw" alt="A burglar sprints straight at you, with a sack of NEAR and a rolled-up rug under his arm." />
      <p className="eyebrow">In plain words</p>
      <h2 className="giant"><span>It's a coin </span><span>with a heist </span><span>built in.</span></h2>
      <div className="idea-say">
        <p className="lead">A <b>rug pull</b> is when the people behind a coin vanish with everyone's money. Here it isn't a betrayal. It's a rule: anyone can do it, the cost is public, and this page prints it.</p>
        <p><b>{coin}</b> is a memecoin on NEAR testnet. A program, the <b>contract</b>, sells it and buys it back at a price set by one public formula. No team. No market maker. No off switch. Every buy and every sell leaves a <b>2% tip in a shared pot</b>.</p>
        <p>Whoever first destroys <b>5% of all the coins</b> takes the whole pot, and their name stays in the contract. The pot goes back to zero and a new round opens. Same rules, forever, because nobody is left who could change them.</p>
      </div>

      <div className="idea-plan">
        <div>
          <dl className="idea-qa">
            {shown.map(([q, a]) => <div key={q}><dt>{q}</dt><dd>{a}</dd></div>)}
          </dl>
          {phone ? (
            <details className="idea-more">
              <summary>Is it real? Will I win?</summary>
              <dl className="idea-qa">{QA.slice(2).map(([q, a]) => <div key={q}><dt>{q}</dt><dd>{a}</dd></div>)}</dl>
            </details>
          ) : null}
        </div>
        <Pic n="crew" className="idea-crew" sizes="(min-width: 1100px) 48vw, 100vw" alt="The crew leans over a blueprint of the vault while the rug mascot points at the X." />
      </div>
      <button type="button" className="l-bigbtn" onClick={tryIt} data-testid="idea-try">Try it, no wallet</button>

      <details className="gloss" data-testid="glossary">
        <summary>Translation desk: every odd word on this page</summary>
        <dl>{GLOSSARY.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>
      </details>
    </section>
  );
}
