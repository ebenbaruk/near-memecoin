// sfc32 with named, independent streams: fork(seed, "retail.arrival").
// The global random generator is forbidden in this package (a test scans the sources).

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal, Box-Muller, cached pair not used so that every call consumes exactly two draws. */
  normal(): number;
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** FNV-1a, 32 bits. */
function hash(s: string, basis: number): number {
  let h = basis >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function fork(seed: number, name: string): Rng {
  const key = `${seed}:${name}`;
  const raw = sfc32(hash(key, 2166136261), hash(key, 16777619), hash(key, 0x811c9dc5 ^ 0xdeadbeef), hash(key, 0x9e3779b9));
  for (let i = 0; i < 8; i++) raw();
  return {
    next: raw,
    normal() {
      const u = 1 - raw();
      const v = raw();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}

/** Poisson by CDF inversion on a single uniform: one uniform per tick keeps the draws aligned across variants. */
export function poissonFromUniform(u: number, lambda: number): number {
  if (lambda <= 0) return 0;
  let k = 0;
  let p = Math.exp(-lambda);
  let cdf = p;
  while (u >= cdf && k < 10_000) {
    k++;
    p *= lambda / k;
    cdf += p;
  }
  return k;
}
