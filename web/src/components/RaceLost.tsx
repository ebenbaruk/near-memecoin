import type { RugRecord } from '../chain/types';
import { Art } from './common';

export function RaceLost({ round, winner, sent, onNext }: { round: number; winner: RugRecord | null; sent: boolean; onNext: () => void }) {
  return (
    <div className="race-lost" data-testid="race-lost" role="alertdialog" aria-modal="true">
      <Art name="states/race-lost.webp" className="race-art" eager />
      <Art name="stickers/burst.webp" className="race-burst" alt="" />
      <h2>Too slow.</h2>
      <p className="race-who" data-testid="race-lost-winner">{winner ? `${winner.rugger} rugged round ${round} first.` : `Someone rugged round ${round} first.`}</p>
      <p>{sent ? 'Your deposit is back. You only paid gas.' : 'Nothing was signed. You paid nothing.'}</p>
      <button type="button" className="btn btn-rug" data-testid="race-lost-new-round" onClick={onNext}>See the new round</button>
    </div>
  );
}
