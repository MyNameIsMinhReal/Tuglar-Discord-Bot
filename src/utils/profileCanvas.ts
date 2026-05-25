import { createCanvas, loadImage } from '@napi-rs/canvas';
import { formatCoins } from './helpers';

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

export async function renderProfileCard(data: ProfileCardData): Promise<Buffer> {
  const W = 800, H = 300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── Background ──────────────────────────────────────────────────
  const [bgC1, bgC2] = BG_THEMES[data.backgroundId ?? ''] ?? ['#1a1a2e', '#16213e'];
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, bgC1);
  bgGrad.addColorStop(1, bgC2);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle scanline texture
  ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

  const accent = ACCENT_HEX[data.accentId ?? ''] ?? '#5865F2';

  // ── Avatar + Frame ──────────────────────────────────────────────
  const cx = 130, cy = 150, r = 78;
  const frameColor = FRAME_COLORS[data.frameId ?? ''] ?? accent;

  // Glow for neon / monarch frames
  if (data.frameId === 'frame_neon') {
    ctx.shadowColor = '#00FF7F';
    ctx.shadowBlur = 20;
  } else if (data.frameId === 'frame_monarch') {
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 14;
  }

  ctx.strokeStyle = frameColor;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Avatar (circular clip)
  try {
    const img = await loadImage(data.avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  } catch {
    // Fallback solid circle
    ctx.fillStyle = '#5865F2';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Right Side ──────────────────────────────────────────────────
  const tx = 250;

  // Username
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(data.username, tx, 52);

  // Title
  if (data.title) {
    ctx.fillStyle = accent;
    ctx.font = '16px sans-serif';
    ctx.fillText(data.title, tx, 76);
  }

  // Divider
  ctx.strokeStyle = accent + '55';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx, 92);
  ctx.lineTo(W - 25, 92);
  ctx.stroke();

  // Stats grid (2 columns × 2 rows)
  const stats: [string, string][] = [
    ['COINS',  formatCoins(data.coins)],
    ['STREAK', `${data.streak} days`],
    ['ROLLS',  `${data.totalRolls}`],
    ['BADGES', `${data.badges.length} unlocked`],
  ];
  if (data.bestCard) stats[2] = ['BEST CARD', data.bestCard];

  stats.forEach(([label, value], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = tx + col * 255;
    const y = 120 + row * 44;

    ctx.fillStyle = '#777777';
    ctx.font = '12px sans-serif';
    ctx.fillText(label, x, y);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(value, x, y + 20);
  });

  // Achievement names (up to 5, ellipsis if more)
  if (data.badges.length > 0) {
    ctx.fillStyle = accent + 'AA';
    ctx.font = '11px sans-serif';
    ctx.fillText('ACHIEVEMENTS', tx, 238);

    ctx.fillStyle = '#CCCCCC';
    ctx.font = '13px sans-serif';
    const shown = data.badges.slice(0, 5).map(b => b.name);
    const suffix = data.badges.length > 5 ? ` +${data.badges.length - 5}` : '';
    ctx.fillText(shown.join('  ·  ') + suffix, tx, 256);
  }

  // Bottom accent bar
  const barGrad = ctx.createLinearGradient(0, 0, W, 0);
  barGrad.addColorStop(0, accent);
  barGrad.addColorStop(0.6, accent + '66');
  barGrad.addColorStop(1, accent + '00');
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, H - 4, W, 4);

  return canvas.toBuffer('image/png');
}
