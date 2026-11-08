import type { RugRecord } from '../chain/types';
import { B, fmtNear, shortAccount } from '../format/near';
import { artUrl } from '../theme/art';
import { mugshotBackdrop, mugshotSrc } from './Mugshot';

// Where the WANTED template leaves room, as fractions of 1080x1350 (art manifest: wanted).
const PHOTO = { left: 0.227, top: 0.243, width: 0.546, height: 0.374 };
const NAME_Y = 0.682;
const CRIME_Y = 0.761;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function posterPng(rug: RugRecord, contractId: string): Promise<Blob> {
  await document.fonts.load('120px "Bagel Fat One"');
  await document.fonts.load('48px "DM Mono"');
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const brown = '#3A1D0E';
  const rust = '#F0562B';

  const template = await loadImage(artUrl('wanted/poster-blank.webp') ?? '');
  if (template) g.drawImage(template, 0, 0, W, H);
  else {
    g.fillStyle = '#F6EFDC';
    g.fillRect(0, 0, W, H);
  }

  // Photo window of the template, in fractions of its size.
  const px = PHOTO.left * W;
  const py = PHOTO.top * H;
  const pw = PHOTO.width * W;
  const ph = PHOTO.height * H;
  g.fillStyle = mugshotBackdrop(rug.rugger);
  g.fillRect(px, py, pw, ph);
  const mug = await loadImage(await mugshotSrc(rug.rugger));
  if (mug) {
    const side = Math.min(pw, ph);
    g.drawImage(mug, px + (pw - side) / 2, py + ph - side, side, side);
  }

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = brown;
  g.font = '500 54px "DM Mono"';
  g.fillText(shortAccount(rug.rugger, 28), W / 2, NAME_Y * H);
  g.font = '62px "Bagel Fat One"';
  g.fillText(`STOLE ${fmtNear(B(rug.payout))} NEAR`, W / 2, CRIME_Y * H);

  g.save();
  g.translate(px + pw - 200, py + 90);
  g.rotate(-0.25);
  g.strokeStyle = rust;
  g.lineWidth = 9;
  g.strokeRect(-150, -46, 300, 92);
  g.fillStyle = rust;
  g.font = '500 54px "DM Mono"';
  g.fillText(`ROUND ${rug.round_id}`, 0, 2);
  g.restore();

  const bot = rug.rugger.endsWith('.acr-bots.testnet') ? await loadImage(artUrl('stamps/bot.webp') ?? '') : null;
  if (bot) {
    g.save();
    g.translate(px + 150, py + 140);
    g.rotate(0.18);
    g.drawImage(bot, -130, -80, 260, 160);
    g.restore();
  }

  g.fillStyle = brown;
  g.font = '500 28px "DM Mono"';
  g.fillText(`Anyone Can Rug · NEAR testnet · ${shortAccount(contractId, 26)}`, W / 2, 0.94 * H);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
}

export async function sharePoster(rug: RugRecord, contractId: string): Promise<void> {
  const blob = await posterPng(rug, contractId);
  const name = `rugged-round-${rug.round_id}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], text: `${rug.rugger} rugged round ${rug.round_id}.` });
      return;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
