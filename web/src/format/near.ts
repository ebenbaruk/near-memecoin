// Amount formatting. Amounts stay BigInt from the RPC to the last character on screen.
export const YOCTO = 10n ** 24n;
export const TOKEN = 10n ** 18n;

export const B = (v: string | bigint | number): bigint => BigInt(v);

const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function fixed(v: bigint, unit: bigint, digits: number): { neg: boolean; int: string; frac: string; zero: boolean } {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const scale = 10n ** BigInt(digits);
  const scaled = (a * scale + unit / 2n) / unit;
  const int = (scaled / scale).toString();
  const frac = digits > 0 ? (scaled % scale).toString().padStart(digits, '0') : '';
  return { neg, int, frac, zero: scaled === 0n };
}

function render(v: bigint, unit: bigint, digits: number, trim: boolean, signed: boolean): string {
  const { neg, int, frac, zero } = fixed(v, unit, digits);
  if (zero && v !== 0n) {
    const tiny = digits > 0 ? `0.${'0'.repeat(digits - 1)}1` : '1';
    return `${neg ? '-' : signed ? '+' : ''}<${tiny}`;
  }
  const f = trim ? frac.replace(/0+$/, '') : frac;
  const sign = neg ? '-' : signed && !zero ? '+' : '';
  return `${sign}${group(int)}${f ? `.${f}` : ''}`;
}

function fixedDigits(yocto: bigint): number {
  const abs = yocto < 0n ? -yocto : yocto;
  return abs >= 1000n * YOCTO ? 0 : abs >= 100n * YOCTO ? 1 : abs >= 10n * YOCTO ? 2 : 3;
}

/** Headline NEAR: fixed number of decimals so the title does not jump as the pot moves. */
export function fmtNearFixed(yocto: bigint): string {
  return render(yocto, YOCTO, fixedDigits(yocto), false, false);
}

/** The value fmtNearFixed prints, as a number: what the reader sees and can add up. */
export function shownValue(yocto: bigint): bigint {
  const digits = fixedDigits(yocto);
  const step = YOCTO / 10n ** BigInt(digits);
  return ((yocto + step / 2n) / step) * step;
}

/** The take on screen is the pot on screen minus the rug price on screen, so the three always add up. */
export function shownTake(pot: bigint, rugPrice: bigint): bigint {
  return shownValue(pot) - shownValue(rugPrice);
}

/** A signed amount with three decimals, for the take. */
export function fmtNearSignedFixed(yocto: bigint): string {
  return render(yocto, YOCTO, 3, false, true);
}

export function fmtNear(yocto: bigint, digits = 3): string {
  return render(yocto, YOCTO, digits, true, false);
}

export function fmtNearSigned(yocto: bigint, digits = 3): string {
  return render(yocto, YOCTO, digits, true, true);
}

export function fmtTokens(base: bigint): string {
  const abs = base < 0n ? -base : base;
  const digits = abs >= 1000n * TOKEN ? 0 : abs >= TOKEN ? 2 : 4;
  return render(base, TOKEN, digits, true, false);
}

/** Decimal text to base units. Null when it is not a clean non-negative decimal. */
export function parseUnits(text: string, decimals: number): bigint | null {
  const t = text.trim();
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const [i = '0', f = ''] = t.split('.');
  if (f.length > decimals) return null;
  return BigInt(i || '0') * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
}

export const toNearInput = (yocto: bigint): string => fmtInput(yocto, YOCTO, 6);
export const toTokenInput = (base: bigint): string => fmtInput(base, TOKEN, 6);

function fmtInput(v: bigint, unit: bigint, digits: number): string {
  const scale = 10n ** BigInt(digits);
  const scaled = (v * scale) / unit;
  const frac = (scaled % scale).toString().padStart(digits, '0').replace(/0+$/, '');
  return `${scaled / scale}${frac ? `.${frac}` : ''}`;
}

export const ceilPct = (v: bigint, percentBump: bigint): bigint => {
  const num = v * (100n + percentBump);
  return num % 100n === 0n ? num / 100n : num / 100n + 1n;
};

/** The name without the network, as a poster would print it. */
export const thiefName = (account: string) => account.replace(/\.(acr-ops\.|acr-bots\.)?testnet$/, '');

/** Never chops a suffix in half: the network goes first, then the end of the name. The full id belongs in a title attribute. */
export function shortAccount(id: string, max = 24): string {
  const name = id.replace(/\.testnet$/, '');
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`;
}

export function ago(tsMs: number, now: number): string {
  const s = Math.max(0, Math.round((now - tsMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

export function dateLabel(tsMs: number): string {
  return new Date(tsMs).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}
