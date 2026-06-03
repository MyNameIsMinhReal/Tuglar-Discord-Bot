// ── Date / Time Helpers ────────────────────────────────────────────

/**
 * Parse "DD/MM/YYYY HH:mm" → Date object
 */
export function parseDate(input: string): Date | null {
  const match = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, d, m, y, h, min] = match.map(Number);
  const date = new Date(y, m - 1, d, h, min);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Format Date → "DD/MM/YYYY HH:mm"
 */
export function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Format "YYYY-MM-DD" → "DD/MM/YYYY"
 */
export function formatDateShort(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Relative time string, ví dụ: "2 giờ nữa", "hôm qua"
 */
export function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = date.getTime() - now;
  const abs = Math.abs(diff);
  const past = diff < 0;

  if (abs < 60_000) return past ? 'vừa xong' : 'vài giây nữa';
  if (abs < 3_600_000) {
    const m = Math.floor(abs / 60_000);
    return past ? `${m} phút trước` : `${m} phút nữa`;
  }
  if (abs < 86_400_000) {
    const h = Math.floor(abs / 3_600_000);
    return past ? `${h} tiếng trước` : `${h} tiếng nữa`;
  }
  const d = Math.floor(abs / 86_400_000);
  return past ? `${d} ngày trước` : `${d} ngày nữa`;
}

// ── Number Helpers ─────────────────────────────────────────────────

/** Định dạng số với dấu phân cách hàng nghìn */
export function formatCoins(n: number): string {
  return n.toLocaleString('vi-VN');
}

/** Random integer in [min, max] inclusive */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── String Helpers ─────────────────────────────────────────────────

/** Cắt chuỗi dài, thêm "..." */
export function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;
}

/** Escape markdown */
export function escapeMd(str: string): string {
  return str.replace(/[_*`~|>]/g, '\\$&');
}

// ── Rarity Colors ─────────────────────────────────────────────────
export const RARITY_COLORS: Record<string, number> = {
  Legendary: 0xFFD700,
  Epic:      0x9B59B6,
  Rare:      0xCD7F32,
  Common:    0x9E9E9E,
};

export const RARITY_STARS: Record<string, string> = {
  Legendary: '✨✨✨',
  Epic:      '⭐⭐',
  Rare:      '⭐',
  Common:    '·',
};
