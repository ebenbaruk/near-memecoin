import type { CSSProperties } from 'react';

/** Every file of public/art/landing used by the page. [width, height, small file suffix, small width]. An e2e test keeps this list and the folder identical. */
export const LANDING_ART = {
  'banner-pink': [2100, 556, '1000', 1000],
  'bot-hoard': [1500, 994, '800', 800],
  'corner-cold': [2000, 1125, '1000', 1000],
  'corner-live': [2000, 1125, '1000', 1000],
  'corner-locked': [2000, 1125, '1000', 1000],
  'corner-warm': [2000, 1125, '1000', 1000],
  crew: [1700, 796, '850', 850],
  'empty-round': [1500, 768, '800', 800],
  getaway: [2100, 522, '1000', 1000],
  'hand-fist': [1600, 774, '800', 800],
  'heap-0-crumbs': [800, 461],
  'heap-1-coins': [1000, 426],
  'heap-2-stack': [1100, 464],
  'heap-3-sacks': [1200, 589],
  'heap-4-mountain': [1400, 679],
  'heap-5-hoard': [2100, 296, '1000', 1000],
  judge: [1173, 1200, '700', 684],
  'judge-proof': [1500, 1013, '800', 800],
  lookout: [1600, 749, '800', 800],
  'scale-beam': [1414, 270],
  'scale-pan': [619, 703],
  'scale-stand': [515, 720],
  'sim-loom': [2100, 709, '1000', 1000],
  swept: [2100, 558, '1000', 1000],
  'thief-reach': [1500, 832, '800', 800],
  'thief-run': [1017, 1500, '800', 542],
} as const satisfies Record<string, readonly [number, number, string?, number?]>;

export type ArtName = keyof typeof LANDING_ART;

const url = (n: string) => `./art/landing/${n}.webp`;

export function Pic({ n, alt = '', className, sizes, eager, style }: {
  n: ArtName; alt?: string; className?: string; sizes?: string; eager?: boolean; style?: CSSProperties;
}) {
  const [w, h, suffix, sw] = LANDING_ART[n] as readonly [number, number, string?, number?];
  return (
    <img
      src={url(suffix ? `${n}-${suffix}` : n)}
      srcSet={suffix ? `${url(`${n}-${suffix}`)} ${sw}w, ${url(n)} ${w}w` : undefined}
      sizes={suffix ? sizes ?? '100vw' : undefined}
      width={w}
      height={h}
      alt={alt}
      className={className}
      style={style}
      draggable={false}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}
