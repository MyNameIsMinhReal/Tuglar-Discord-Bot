const store = new Map<string, number>();

/**
 * Kiểm tra cooldown. Trả về ms còn lại nếu đang bị cooldown, 0 nếu được phép dùng.
 * Gọi hàm này sẽ tự động set cooldown nếu được phép.
 */
export function checkCooldown(key: string, ms: number): number {
  const now  = Date.now();
  const last = store.get(key) ?? 0;
  const left = last + ms - now;
  if (left > 0) return left;
  store.set(key, now);
  return 0;
}

export function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}p ${sec}s` : `${sec}s`;
}
