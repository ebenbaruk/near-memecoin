import { useEffect, useState } from 'react';
import { art, artPalette, artUrl } from '../theme/art';

/** FNV-1a. The same account always gets the same face. */
export function hashAccount(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mugshotPath(account: string): string {
  const list = art()?.thieves?.mugshots;
  const i = hashAccount(account) % 12;
  return list?.[i] ?? `thieves/mug-${String(i + 1).padStart(2, '0')}.webp`;
}

const BACKDROPS = ['#F59AC4', '#F2C230', '#0F7B6C', '#2457A6', '#F0562B'];
export const mugshotBackdrop = (account: string): string => BACKDROPS[(hashAccount(account) >>> 12) % BACKDROPS.length];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

const cache = new Map<string, Promise<string>>();

/** The thief for this account, in the palette permutation its hash picks (manifest: thieves.recolors). */
export function mugshotSrc(account: string): Promise<string> {
  const base = artUrl(mugshotPath(account));
  const tables = art()?.thieves?.recolors?.tables ?? [];
  const h = hashAccount(account);
  const table = tables.length ? tables[(h >>> 20) % tables.length] : {};
  if (!base) return Promise.resolve('');
  if (Object.keys(table).length === 0) return Promise.resolve(base);
  const key = `${base}|${JSON.stringify(table)}`;
  let job = cache.get(key);
  if (!job) {
    job = recolor(base, table).catch(() => base);
    cache.set(key, job);
  }
  return job;
}

async function recolor(src: string, table: Record<string, string>): Promise<string> {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return src;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const names = Object.keys(artPalette);
  const swap = names.map((n) => artPalette[table[n] ?? n]);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 16) continue;
    let best = 0;
    let bestD = Infinity;
    for (let n = 0; n < names.length; n++) {
      const p = artPalette[names[n]];
      const d = (px[i] - p[0]) ** 2 + (px[i + 1] - p[1]) ** 2 + (px[i + 2] - p[2]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (table[names[best]]) {
      px[i] = swap[best][0];
      px[i + 1] = swap[best][1];
      px[i + 2] = swap[best][2];
    }
  }
  g.putImageData(data, 0, 0);
  return c.toDataURL('image/webp', 0.9);
}

export function Mugshot({ account }: { account: string }) {
  const [src, setSrc] = useState<string>(() => artUrl(mugshotPath(account)) ?? '');
  useEffect(() => {
    let live = true;
    void mugshotSrc(account).then((s) => {
      if (live && s) setSrc(s);
    });
    return () => {
      live = false;
    };
  }, [account]);
  return (
    <div className="mugshot" style={{ background: mugshotBackdrop(account) }}>
      {src ? <img src={src} alt="A masked thief, the same face for this account every time" draggable={false} /> : null}
    </div>
  );
}
