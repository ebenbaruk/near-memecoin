import type { CSSProperties } from 'react';
import type { Zone } from '../chain/types';
import { artUrl, useArt } from '../theme/art';

export type Expression = 'sleep' | 'one-eye' | 'curious' | 'sweat' | 'panic' | 'scream' | 'ripped' | 'ghost' | 'happy';

const FROM_ZONE: Record<Zone, Expression> = { locked: 'sleep', cold: 'one-eye', warm: 'sweat', live: 'panic' };

/** Layered face (41 §5): body, eyes, pupils, blink lid, mouth, sweat. Parts come from the manifest. */
function Layered({ ex, gaze, className }: { ex: Expression; gaze: number; className?: string }) {
  const layers = useArt()?.mascot.layers;
  if (!layers) return null;
  const part = (name: string): CSSProperties => {
    const p = layers.parts[name];
    return p ? { left: `${p.left}%`, top: `${p.top}%`, width: `${p.widthPercent}%` } : {};
  };
  const img = (src: string | undefined, cls: string, style: CSSProperties) =>
    src ? <img src={artUrl(src) ?? undefined} className={cls} style={style} alt="" draggable={false} /> : null;
  const mouthSrc = ex === 'sweat' ? 'mascot/layers/mouth-wobble.webp' : ex === 'one-eye' ? 'mascot/layers/mouth-flat.webp' : ex === 'panic' || ex === 'scream' ? 'mascot/layers/mouth-scream.webp' : 'mascot/layers/mouth-smile.webp';
  return (
    <div className={`mascot-layers ${className ?? ''}`} data-expression={ex} style={{ '--gaze': `${gaze}px` } as CSSProperties} role="img" aria-label={`The Tapis looks ${ex}`}>
      {img(layers.base, 'ml-part ml-base', {})}
      {img(layers.parts.eyes?.src, 'ml-part ml-center ml-eyes', part('eyes'))}
      {img(layers.parts.pupilLeft?.src, 'ml-part ml-center ml-pupil', part('pupilLeft'))}
      {img(layers.parts.pupilRight?.src, 'ml-part ml-center ml-pupil', part('pupilRight'))}
      {ex === 'one-eye' ? img(layers.parts.lid?.src, 'ml-part ml-center ml-lid-static', { ...part('lid'), left: '59%', width: '22%' }) : null}
      {img(layers.parts.lid?.src, 'ml-part ml-center ml-lid-blink', part('lid'))}
      {img(mouthSrc, 'ml-part ml-center ml-mouth', part('mouth'))}
      {ex === 'sweat' || ex === 'panic' ? img(layers.parts.sweat?.src, 'ml-part ml-center ml-sweat', part('sweat')) : null}
    </div>
  );
}

export function Mascot({ zone, expression, gaze = 0, className }: { zone?: Zone; expression?: Expression; gaze?: number; className?: string }) {
  const ex = expression ?? (zone ? FROM_ZONE[zone] : 'curious');
  const manifest = useArt();
  // Asleep and panicking are their own drawings; in between, the face is layers that blink and look.
  if ((ex === 'one-eye' || ex === 'sweat') && manifest?.mascot?.layers) return <Layered ex={ex} gaze={gaze} className={className} />;
  const src = artUrl(`mascot/${ex}.webp`);
  if (!src) return null;
  return <img src={src} alt={`The Tapis looks ${ex}`} className={`mascot ${className ?? ''}`} data-expression={ex} draggable={false} />;
}
