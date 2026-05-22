import { db } from '../database';
import { EconomyRow } from '../types';

// node:sqlite trả về rows dạng object giống better-sqlite3
export function getOrCreate(userId: string, guildId: string): EconomyRow {
  let row = db.prepare(
    'SELECT * FROM economy WHERE user_id = ? AND guild_id = ?'
  ).get(userId, guildId) as unknown as EconomyRow | undefined;

  if (!row) {
    db.prepare(
      'INSERT OR IGNORE INTO economy (user_id, guild_id, balance, total_earned) VALUES (?, ?, 0, 0)'
    ).run(userId, guildId);
    row = db.prepare(
      'SELECT * FROM economy WHERE user_id = ? AND guild_id = ?'
    ).get(userId, guildId) as unknown as EconomyRow;
  }
  return row;
}

export function addCoins(userId: string, guildId: string, amount: number): number {
  db.prepare(`
    INSERT INTO economy (user_id, guild_id, balance, total_earned)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      balance = balance + ?,
      total_earned = total_earned + ?
  `).run(userId, guildId, amount, amount, amount, amount);
  return getOrCreate(userId, guildId).balance;
}

export function deductCoins(userId: string, guildId: string, amount: number): boolean {
  const user = getOrCreate(userId, guildId);
  if (user.balance < amount) return false;
  db.prepare('UPDATE economy SET balance = balance - ? WHERE user_id = ? AND guild_id = ?')
    .run(amount, userId, guildId);
  return true;
}

export function canClaimDaily(userId: string, guildId: string): { canClaim: boolean; hoursLeft: number } {
  const user = getOrCreate(userId, guildId);
  if (!user.last_daily) return { canClaim: true, hoursLeft: 0 };
  const diffHours = (Date.now() - new Date(user.last_daily).getTime()) / 3_600_000;
  const hoursLeft = Math.max(0, 24 - diffHours);
  return { canClaim: hoursLeft === 0, hoursLeft };
}

export function claimDaily(userId: string, guildId: string): number {
  const reward = Math.floor(Math.random() * 51) + 50;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO economy (user_id, guild_id, balance, total_earned, last_daily)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      balance = balance + ?,
      total_earned = total_earned + ?,
      last_daily = ?
  `).run(userId, guildId, reward, reward, now, reward, reward, now);
  return reward;
}

export function getLeaderboard(guildId: string, limit = 10): EconomyRow[] {
  return db.prepare(
    'SELECT * FROM economy WHERE guild_id = ? ORDER BY balance DESC LIMIT ?'
  ).all(guildId, limit) as unknown as EconomyRow[];
}
