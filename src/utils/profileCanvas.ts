import { createCanvas, loadImage, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { formatCoins } from './helpers';

// gif-encoder-2 is a CommonJS module
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GIFEncoder = require('gif-encoder-2') as new (
  width: number, height: number, algorithm?: string, useOptimizer?: boolean, totalFrames?: number
) => {
  setRepeat(n: number): void;
  setDelay(ms: number): void;
  setQuality(q: number): void;
  start(): void;
  addFrame(ctx: unknown): void;
  finish(): void;
  out: { getData(): Uint8Array };
};

export interface ProfileCardData {
  username: string;
  avatarUrl: string;
  title: string | null;
  backgroundId: string | null;
  frameId: string | null;
  accentId: string | null;
  coins: number;
  streak: number;
  totalRolls: number;
  bestCard: string | null;
  badges: Array<{ name: string; emoji: string }>;
}

export interface ProfileCardResult {
  buffer: Buffer;
  filename: string;
}

const ASSETS    = join(process.cwd(), 'assets');
const FONTS_DIR = join(ASSETS, 'fonts');

try {
  GlobalFonts.registerFromPath(join(FONTS_DIR, 'Inter-Regular.ttf'), 'Inter');
  GlobalFonts.registerFromPath(join(FONTS_DIR, 'Inter-Bold.ttf'), 'Inter');
} catch { /* font files not present */ }

function getActiveFont(): string {
  try {
    const activePath = join(FONTS_DIR, 'active.json');
    if (existsSync(activePath)) {
      const { family } = JSON.parse(readFileSync(activePath, 'utf-8'));
      if (family && GlobalFonts.families.some(f => f.family === family)) return family;
    }
  } catch { /* ignore */ }
  return GlobalFonts.families.some(f => f.family === 'Inter') ? 'Inter' : 'sans-serif';
}

const BG_THEMES: Record<string, [string, string]> = {
  bg_study_room:   ['#2c1810', '#5c3a1e'],
  bg_forest:       ['#0a2010', '#1a4d2a'],
  bg_cyber:        ['#020a14', '#0a2440'],
  bg_galaxy:       ['#0a0318', '#180838'],
  bg_shadow_realm: ['#050505', '#0d0d0d'],
};

const FRAME_COLORS: Record<string, string> = {
  frame_silver:  '#C0C0C0',
  frame_dark:    '#1a1a1a',
  frame_neon:    '#00FF7F',
  frame_gold:    '#F1C40F',
  frame_monarch: '#FFD700',
};

const ACCENT_HEX: Record<string, string> = {
  accent_blue:   '#3498DB',
  accent_red:    '#E74C3C',
  accent_purple: '#9B59B6',
  accent_neon:   '#00FF7F',
  accent_gold:   '#F1C40F',
};

const W = 800, H = 300;

// ── Shared UI drawing ──────────────────────────────────────────────

async function drawUI(
  ctx: SKRSContext2D,
  data: ProfileCardData,
  accent: string,
  preloadedAvatar?: Awaited<ReturnType<typeof loadImage>> | null,
): Promise<void> {
  const FONT = getActiveFont();
  const cx = 130, cy = 150, r = 78, tx = 250;
  const frameColor = FRAME_COLORS[data.frameId ?? ''] ?? accent;

  // Dark gradient panel behind text area so text stays readable over any background
  const textBg = ctx.createLinearGradient(200, 0, W, 0);
  textBg.addColorStop(0,    'rgba(0,0,0,0)');
  textBg.addColorStop(0.12, 'rgba(0,0,0,0.50)');
  textBg.addColorStop(1,    'rgba(0,0,0,0.60)');
  ctx.fillStyle = textBg;
  ctx.fillRect(200, 0, W - 200, H);

  // Frame glow
  if (data.frameId === 'frame_neon')     { ctx.shadowColor = '#00FF7F'; ctx.shadowBlur = 20; }
  else if (data.frameId === 'frame_monarch') { ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 14; }

  ctx.strokeStyle = frameColor;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Avatar
  const avatarImg = preloadedAvatar ?? await loadImage(data.avatarUrl).catch(() => null);
  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = '#5865F2';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Text shadow for all text elements below
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  // Username + title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 28px ${FONT}`;
  ctx.fillText(data.username, tx, 52);

  if (data.title) {
    ctx.fillStyle = accent;
    ctx.font = `16px ${FONT}`;
    ctx.fillText(data.title, tx, 76);
  }

  // Divider
  ctx.strokeStyle = accent + '55';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx, 92);
  ctx.lineTo(W - 25, 92);
  ctx.stroke();

  // Stats grid
  const stats: [string, string][] = [
    ['COINS',  formatCoins(data.coins)],
    ['STREAK', `${data.streak} days`],
    ['ROLLS',  `${data.totalRolls}`],
    ['BADGES', `${data.badges.length} unlocked`],
  ];
  if (data.bestCard) stats[2] = ['BEST CARD', data.bestCard];

  stats.forEach(([label, value], idx) => {
    const x = tx + (idx % 2) * 255;
    const y = 120 + Math.floor(idx / 2) * 44;

    ctx.fillStyle = '#AAAAAA';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(label, x, y);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillText(value, x, y + 20);
  });

  // Achievements
  if (data.badges.length > 0) {
    ctx.fillStyle = accent + 'AA';
    ctx.font = `11px ${FONT}`;
    ctx.fillText('ACHIEVEMENTS', tx, 238);

    ctx.fillStyle = '#CCCCCC';
    ctx.font = `13px ${FONT}`;
    const shown = data.badges.slice(0, 5).map(b => b.name);
    const suffix = data.badges.length > 5 ? ` +${data.badges.length - 5}` : '';
    ctx.fillText(shown.join('  ·  ') + suffix, tx, 256);
  }

  // Reset text shadow before drawing shapes
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Bottom accent bar
  const barGrad = ctx.createLinearGradient(0, 0, W, 0);
  barGrad.addColorStop(0, accent);
  barGrad.addColorStop(0.6, accent + '66');
  barGrad.addColorStop(1, accent + '00');
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, H - 4, W, 4);
}

// ── Animated GIF rendering ─────────────────────────────────────────

async function renderAnimatedCard(data: ProfileCardData): Promise<Buffer> {
  const gifPath = join(ASSETS, `backgrounds/${data.backgroundId}.gif`);
  const gifBuf  = readFileSync(gifPath);

  const meta       = await sharp(gifBuf, { animated: true }).metadata();
  const frameCount = Math.min(meta.pages ?? 1, 20); // cap to keep file size sane
  const delays     = meta.delay ?? [];
  const accent     = ACCENT_HEX[data.accentId ?? ''] ?? '#5865F2';

  // Pre-load avatar once — reuse across all frames
  const avatarImg = await loadImage(data.avatarUrl).catch(() => null);

  const encoder = new GIFEncoder(W, H, 'neuquant', true, frameCount);
  encoder.setRepeat(0); // loop forever
  encoder.start();

  for (let i = 0; i < frameCount; i++) {
    encoder.setDelay(delays[i] ?? 80);

    // Extract this frame as PNG, resize to card dimensions
    const framePng = await sharp(gifBuf, { page: i })
      .resize(W, H, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();

    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    // Draw frame as background
    const bgImg = await loadImage(framePng);
    ctx.drawImage(bgImg, 0, 0, W, H);

    // Dark overlay for text readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, W, H);

    await drawUI(ctx, data, accent, avatarImg);

    encoder.addFrame(ctx);
  }

  encoder.finish();
  return Buffer.from(encoder.out.getData());
}

// ── Static background loader ───────────────────────────────────────

async function loadBgImage(backgroundId: string | null) {
  if (!backgroundId) return null;
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    try {
      return await loadImage(join(ASSETS, `backgrounds/${backgroundId}.${ext}`));
    } catch { continue; }
  }
  return null;
}

export function registerFont(fontPath: string, fontFamily: string): void {
  GlobalFonts.registerFromPath(fontPath, fontFamily);
}

// ── Main export ────────────────────────────────────────────────────

export async function renderProfileCard(data: ProfileCardData): Promise<ProfileCardResult> {
  // Animated path: GIF background detected
  if (data.backgroundId) {
    const gifPath = join(ASSETS, `backgrounds/${data.backgroundId}.gif`);
    if (existsSync(gifPath)) {
      const buffer = await renderAnimatedCard(data);
      return { buffer, filename: 'profile.gif' };
    }
  }

  // Static path: existing logic
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const bgImage = await loadBgImage(data.backgroundId);
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, W, H);
  } else {
    const [c1, c2] = BG_THEMES[data.backgroundId ?? ''] ?? ['#1a1a2e', '#16213e'];
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // Subtle scanline texture
    ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  }

  const accent = ACCENT_HEX[data.accentId ?? ''] ?? '#5865F2';
  await drawUI(ctx, data, accent);

  return { buffer: canvas.toBuffer('image/png'), filename: 'profile.png' };
}
