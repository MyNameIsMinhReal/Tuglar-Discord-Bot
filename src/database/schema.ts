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
  `);

  // Migrations for existing tables
  try { db.exec('ALTER TABLE challenge_log ADD COLUMN used_grace INTEGER DEFAULT 0'); } catch {}

  console.log('✅ Database schema initialized');
}
