import type { RugRecord } from '../chain/types';
import { B, fmtNear, shortAccount } from '../format/near';
import { artUrl } from '../theme/art';
import { mugshotBackdrop, mugshotSrc } from './Mugshot';

// Where the WANTED template leaves room, as fractions of 1080x1350 (art manifest: wanted).
const PHOTO = { left: 0.227, top: 0.243, width: 0.546, height: 0.374 };
const NAME_Y = 0.682;
const CRIME_Y = 0.761;
// Same layout as the on-page poster: the portrait stands on a placard, nothing covers the face or the frame.
const PORTRAIT = 0.78;
const BAR_W = 0.62;

/** Picks the largest font up to `start` that keeps the text inside the bar. */
function fitFont(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, start: number) {
  let px = start;
  g.font = font(px);
  while (px > 18 && g.measureText(text).width > BAR_W * 1080) {
    px -= 2;
    g.font = font(px);
  }
}

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
  const portraitH = ph * PORTRAIT;
  if (mug) {
    const w = (portraitH * mug.naturalWidth) / mug.naturalHeight;
    g.drawImage(mug, px + (pw - w) / 2, py, w, portraitH);
  }

  const placardY = py + portraitH;
  const placardH = ph - portraitH;
  g.fillStyle = '#F6EFDC';
  g.fillRect(px, placardY, pw, placardH);
  g.strokeStyle = rust;
  g.lineWidth = 9;
  g.strokeRect(px + 4.5, placardY + 4.5, pw - 9, placardH - 9);

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = brown;
  const name = shortAccount(rug.rugger, 44);
  fitFont(g, name, (s) => `500 ${s}px "DM Mono"`, 50);
  g.fillText(name, W / 2, NAME_Y * H);
  const crime = `STOLE ${fmtNear(B(rug.payout))} NEAR`;
  fitFont(g, crime, (s) => `${s}px "Bagel Fat One"`, 56);
  g.fillText(crime, W / 2, CRIME_Y * H);

  const bot = rug.rugger.endsWith('.acr-bots.testnet') ? await loadImage(artUrl('stamps/bot.webp') ?? '') : null;
  const cy = placardY + placardH / 2;
  const cx = px + pw / 2;
  g.font = '500 50px "DM Mono"';
  if (bot) {
    const h = placardH - 26;
    const w = (h * bot.naturalWidth) / bot.naturalHeight;
    const label = `ROUND ${rug.round_id}`;
    const textW = g.measureText(label).width;
    const gap = 24;
    const left = cx - (w + gap + textW) / 2;
    g.drawImage(bot, left, cy - h / 2, w, h);
    g.fillText(label, left + w + gap + textW / 2, cy + 2);
  } else {
    g.fillText(`ROUND ${rug.round_id}`, cx, cy + 2);
  }

  // Over the fringe the credit is unreadable, so it gets its own strip.
  g.fillStyle = '#14160D';
  g.fillRect(0, H - 56, W, 56);
  g.fillStyle = '#F6EFDC';
  g.font = '500 28px "DM Mono"';
  g.fillText(`Anyone Can Rug · NEAR testnet · ${shortAccount(contractId, 26)}`, W / 2, H - 27);

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
