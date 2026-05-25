import cron from 'node-cron';
import { db } from '../database';
import { getById } from '../services/ProfileService';

const TYPE_TO_COL: Record<string, string> = {
  background: 'background_id',
  frame:      'frame_id',
  title:      'title_id',
  accent:     'accent_id',
  sticker:    'sticker_id',
  name_style: 'name_style_id',
};

function runExpiry(): void {
  const expired = db.prepare(`
    SELECT user_id, guild_id, cosmetic_id FROM user_cosmetics
    WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')
  `).all() as Array<{ user_id: string; guild_id: string; cosmetic_id: string }>;

  if (expired.length === 0) return;

  for (const { user_id, guild_id, cosmetic_id } of expired) {
    const item = getById(cosmetic_id);
    if (!item) continue;
    const col = TYPE_TO_COL[item.type];
    if (!col) continue;
    // col is from hardcoded map above, safe to interpolate
    db.prepare(
      `UPDATE user_profile_settings SET ${col} = NULL WHERE user_id = ? AND guild_id = ? AND ${col} = ?`
    ).run(user_id, guild_id, cosmetic_id);
  }

  const { changes } = db.prepare(`
    DELETE FROM user_cosmetics WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')
  `).run() as { changes: number };

  if (changes > 0) console.log(`🧹 Removed ${changes} expired cosmetic(s)`);
}

export function startExpireCosmeticsTask(): void {
  runExpiry(); // run once on startup to clear any already-expired items
  cron.schedule('0 * * * *', runExpiry); // then every hour at :00
  console.log('✅ Expire cosmetics task started');
}
