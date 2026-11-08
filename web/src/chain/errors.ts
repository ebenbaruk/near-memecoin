// Contract errors (20-contract.md §3.1). A panic message starts with its code.
const CODES = [
  'E_ROUND_STALE', 'E_POT_BELOW_MIN', 'E_BURN_ABOVE_MAX', 'E_INSUFFICIENT_TOKENS', 'E_PAYOUT_BELOW_MIN',
  'E_SLIPPAGE', 'E_BELOW_MIN_BUY', 'E_SELL_TOO_SMALL', 'E_ABOVE_X_MAX', 'E_UNREGISTER_DISABLED',
] as const;
export type ErrorCode = (typeof CODES)[number];

export function errorCode(failure: unknown): ErrorCode | null {
  const text = typeof failure === 'string' ? failure : JSON.stringify(failure ?? '');
  return CODES.find((c) => text.includes(c)) ?? null;
}

export const isRaceLost = (c: ErrorCode | null) => c === 'E_ROUND_STALE' || c === 'E_PAYOUT_BELOW_MIN';

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  E_SLIPPAGE: 'The price moved more than your tolerance. Nothing happened.',
  E_BELOW_MIN_BUY: 'That is below the minimum buy.',
  E_SELL_TOO_SMALL: 'That sale is too small to cover its own fees.',
  E_INSUFFICIENT_TOKENS: "You don't have enough tokens for that.",
  E_POT_BELOW_MIN: 'The pot is below its minimum right now.',
};

export function errorText(code: ErrorCode | null, failure: unknown): string {
  if (code && MESSAGES[code]) return MESSAGES[code]!;
  const raw = typeof failure === 'string' ? failure : JSON.stringify(failure ?? '');
  return raw.length > 180 ? `${raw.slice(0, 180)}…` : raw || 'The transaction failed.';
}

export function isUserRejection(e: unknown): boolean {
  const text = String((e as Error)?.message ?? e ?? '').toLowerCase();
  return /reject|cancel|denied|declined|closed|user abort/.test(text);
}
