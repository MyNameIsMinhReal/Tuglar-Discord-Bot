import path from 'node:path';
import fs from 'node:fs';
import { db } from './index';

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deadlines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      guild_id    TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      title       TEXT NOT NULL,
      subject     TEXT,
      due_date    TEXT NOT NULL,
      reminded_1d INTEGER DEFAULT 0,
      reminded_3h INTEGER DEFAULT 0,
      reminded_30m INTEGER DEFAULT 0,
      is_done     INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id  TEXT NOT NULL,
      user_id   TEXT NOT NULL,
      subject   TEXT NOT NULL,
      title     TEXT NOT NULL,
      url       TEXT NOT NULL,
      doc_type  TEXT DEFAULT 'link',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS economy (
      user_id      TEXT NOT NULL,
      guild_id     TEXT NOT NULL,
      balance      INTEGER DEFAULT 0,
      total_earned INTEGER DEFAULT 0,
      last_daily   TEXT,
      PRIMARY KEY (user_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS shop_purchases (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      TEXT NOT NULL,
      guild_id     TEXT NOT NULL,
      item_id      TEXT NOT NULL,
      item_name    TEXT NOT NULL,
      price        INTEGER NOT NULL,
      purchased_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gacha_inventory (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      guild_id    TEXT NOT NULL,
      item_id     TEXT NOT NULL,
      item_name   TEXT NOT NULL,
      item_rarity TEXT NOT NULL,
      item_emoji  TEXT NOT NULL,
      obtained_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS journal (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      content    TEXT NOT NULL,
      mood       TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS challenge_log (
      user_id        TEXT NOT NULL,
      guild_id       TEXT NOT NULL,
      challenge_date TEXT NOT NULL,
      challenge_text TEXT NOT NULL,
      completed      INTEGER DEFAULT 0,
      streak         INTEGER DEFAULT 0,
      used_grace     INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, guild_id, challenge_date)
    );

    CREATE TABLE IF NOT EXISTS challenge_pending (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        TEXT NOT NULL,
      guild_id       TEXT NOT NULL,
      challenge_date TEXT NOT NULL,
      challenge_text TEXT NOT NULL,
      image_url      TEXT NOT NULL,
      difficulty     TEXT NOT NULL,
      message_id     TEXT,
      status         TEXT DEFAULT 'pending',
      reviewed_by    TEXT,
      created_at     TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, guild_id, challenge_date)
    );

    CREATE TABLE IF NOT EXISTS warn_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      guild_id   TEXT NOT NULL,
      reason     TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS disabled_commands (
      command_name TEXT NOT NULL,
      guild_id     TEXT NOT NULL,
      disabled_by  TEXT NOT NULL,
      disabled_at  TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (command_name, guild_id)
    );

    CREATE TABLE IF NOT EXISTS coin_transactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      guild_id   TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      type       TEXT NOT NULL,
      meta       TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gacha_pity (
      user_id          TEXT NOT NULL,
      guild_id         TEXT NOT NULL,
      rolls_since_ssr  INTEGER DEFAULT 0,
      rolls_since_sr   INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      season_num INTEGER NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at   TEXT,
      reset_by   TEXT
    );

    CREATE TABLE IF NOT EXISTS user_cosmetics (
      user_id      TEXT NOT NULL,
      guild_id     TEXT NOT NULL,
      cosmetic_id  TEXT NOT NULL,
      unlocked_at  TEXT DEFAULT (datetime('now')),
      expires_at   TEXT,
      PRIMARY KEY (user_id, guild_id, cosmetic_id)
    );

    CREATE TABLE IF NOT EXISTS user_profile_settings (
      user_id       TEXT NOT NULL,
      guild_id      TEXT NOT NULL,
      background_id TEXT,
      frame_id      TEXT,
      title_id      TEXT,
      accent_id     TEXT,
      sticker_id    TEXT,
      name_style_id TEXT,
      badge_slot_1  TEXT,
      badge_slot_2  TEXT,
      badge_slot_3  TEXT,
      updated_at    TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      user_id    TEXT NOT NULL,
      guild_id   TEXT NOT NULL,
      badge_id   TEXT NOT NULL,
      earned_at  TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, guild_id, badge_id)
    );

    CREATE TABLE IF NOT EXISTS profile_cosmetics (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      type            TEXT NOT NULL,
      rarity          TEXT NOT NULL,
      price           INTEGER NOT NULL,
      description     TEXT NOT NULL,
      is_limited      INTEGER DEFAULT 0,
      available_until TEXT,
      added_at        TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migrations for existing tables
  try { db.exec('ALTER TABLE challenge_log ADD COLUMN used_grace INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE economy ADD COLUMN prestige_points INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE economy ADD COLUMN daily_streak INTEGER DEFAULT 0'); } catch {}

  // Seed profile_cosmetics từ JSON nếu bảng đang trống
  const cosmeticCount = (db.prepare('SELECT COUNT(*) as c FROM profile_cosmetics').get() as { c: number }).c;
  if (cosmeticCount === 0) {
    const RARITY_MAP: Record<string, string> = { N: 'Common', R: 'Rare', SR: 'Epic', SSR: 'Legendary' };
    try {
      const jsonPath = path.join(process.cwd(), 'data', 'profile_cosmetics.json');
      const items: any[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      const insert = db.prepare(`
        INSERT OR IGNORE INTO profile_cosmetics (id, name, type, rarity, price, description, is_limited)
        VALUES (@id, @name, @type, @rarity, @price, @description, @is_limited)
      `);
      db.exec('BEGIN');
      try {
        for (const r of items) {
          insert.run({
            id:          r.id,
            name:        r.name,
            type:        r.type,
            rarity:      RARITY_MAP[r.rarity] ?? r.rarity,
            price:       r.price,
            description: r.description,
            is_limited:  r.isLimited ? 1 : 0,
          });
        }
        db.exec('COMMIT');
      } catch {
        db.exec('ROLLBACK');
      }
      console.log(`✅ Seeded ${items.length} cosmetics from JSON`);
    } catch { /* JSON không tồn tại hoặc lỗi parse — bỏ qua */ }
  }

  console.log('✅ Database schema initialized');
}
