// Reads web/public/art/manifest.json, the contract between the art and the code.
export interface AssetInfo { path: string; width: number; height: number; bytes: number; role: string }
export interface ZoneArt { rug: string; lift?: number; liftRange?: [number, number]; mascot: string; hand: boolean }
export interface ArtManifest {
  basePath: string;
  scene: {
    css: string;
    pileTiers: Record<string, { widthPercent: number }>;
    tagValueBox: { left: number; top: number; width: number; height: number };
    zones: Record<string, ZoneArt>;
  };
  mascot: {
    expressions: Record<string, string>;
    layers: {
      base: string;
      parts: Record<string, { src: string; left: number; top: number; widthPercent: number }>;
      mouths: string[];
    };
  };
  wanted: {
    posterBlank: string;
    portraitBoxPercent: { left: number; top: number; width: number; height: number };
    textBandsPercent: { name: string; left: number; top: number; width: number; height: number }[];
  };
  thieves: { mugshots: string[]; recolors: { tables: Record<string, string>[] } };
  assets: AssetInfo[];
  [extra: string]: unknown;
}

let manifest: ArtManifest | null = null;

export async function loadArt(): Promise<void> {
  try {
    const res = await fetch('./art/manifest.json');
    if (!res.ok) return;
    manifest = (await res.json()) as ArtManifest;
    if (manifest.scene?.css) {
      const style = document.createElement('style');
      style.textContent = manifest.scene.css;
      document.head.appendChild(style);
    }
  } catch {
    manifest = null;
  }
}

export const art = () => manifest;

export const artPalette: Record<string, [number, number, number]> = {
  ink: [0x14, 0x16, 0x0d], brown: [0x3a, 0x1d, 0x0e], cream: [0xf6, 0xef, 0xdc], mustard: [0xf2, 0xc2, 0x30], rust: [0xf0, 0x56, 0x2b],
  pink: [0xf5, 0x9a, 0xc4], teal: [0x0f, 0x7b, 0x6c], sage: [0xdd, 0xe3, 0xb5], cobalt: [0x24, 0x57, 0xa6],
};

const files = new Set<string>(__ART_FILES__);

/** URL of an art file, or null if the build didn't ship it. */
export function artUrl(path: string): string | null {
  return files.has(path) ? `./art/${path}` : null;
}

/** First file whose path contains one of the needles. */
export function findArt(...needles: string[]): string | null {
  for (const n of needles) {
    for (const f of files) if (f.includes(n)) return `./art/${f}`;
  }
  return null;
}
