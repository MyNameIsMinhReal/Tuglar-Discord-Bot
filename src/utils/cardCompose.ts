import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { RARITY_OVERLAY_FILES } from '../config/rarityOverlays';

const CARD_DIR    = path.join(process.cwd(), 'data', 'cards');
const OVERLAY_DIR = path.join(process.cwd(), 'data', 'overlays');
const CARD_EXTS   = ['.png', '.jpg', '.gif', '.webp'];

function findCardPath(itemId: string): string | null {
  for (const ext of CARD_EXTS) {
    const p = path.join(CARD_DIR, itemId + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Composite card image + rarity overlay thành 1 buffer PNG.
 * Nếu không tìm thấy card hoặc overlay thì trả về ảnh gốc (hoặc null).
 */
export async function composeCardWithOverlay(
  itemId: string,
  rarity: string,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const cardPath = findCardPath(itemId);
  if (!cardPath) return null;

  const overlayFile = RARITY_OVERLAY_FILES[rarity];
  const overlayPath = overlayFile ? path.join(OVERLAY_DIR, overlayFile) : null;

  const isGif = cardPath.endsWith('.gif');

  if (!overlayPath || !fs.existsSync(overlayPath)) {
    return {
      buffer: fs.readFileSync(cardPath),
      filename: `${itemId}${isGif ? '.gif' : '.png'}`,
    };
  }

  if (isGif) {
    // tile: true lặp overlay lên tất cả các frame của animation
    const buffer = await sharp(cardPath, { animated: true })
      .composite([{ input: overlayPath, blend: 'over', tile: true }])
      .gif()
      .toBuffer();
    return { buffer, filename: `${itemId}.gif` };
  }

  const buffer = await sharp(cardPath)
    .composite([{ input: overlayPath, blend: 'over' }])
    .png()
    .toBuffer();

  return { buffer, filename: `${itemId}.png` };
}
