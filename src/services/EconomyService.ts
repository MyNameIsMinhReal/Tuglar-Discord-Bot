import { db } from '../database';
import { EconomyRow } from '../types';
import { cfg } from '../config';

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

export function claimDaily(userId: string, guildId: string): { reward: number; streak: number } {
  const user   = getOrCreate(userId, guildId);
  const range  = cfg.dailyMax - cfg.dailyMin;
  const reward = Math.floor(Math.random() * (range + 1)) + cfg.dailyMin;
  const now    = new Date();

  // Streak: tăng nếu last_daily trong 24-48h, reset nếu quá 48h
  let streak = (user as any).daily_streak ?? 0;
  if (user.last_daily) {
    const diffHours = (now.getTime() - new Date(user.last_daily).getTime()) / 3_600_000;
    streak = diffHours <= 48 ? streak + 1 : 1;
  } else {
    streak = 1;
  }

  db.prepare(`
    INSERT INTO economy (user_id, guild_id, balance, total_earned, last_daily, daily_streak)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      balance      = balance + ?,
      total_earned = total_earned + ?,
      last_daily   = ?,
      daily_streak = ?
  `).run(userId, guildId, reward, reward, now.toISOString(), streak, reward, reward, now.toISOString(), streak);

  logTransaction(userId, guildId, reward, 'daily');
  return { reward, streak };
}

export function getLeaderboard(guildId: string, limit = 10): EconomyRow[] {
  return db.prepare(
    'SELECT * FROM economy WHERE guild_id = ? ORDER BY balance DESC LIMIT ?'
  ).all(guildId, limit) as unknown as EconomyRow[];
}

export function getEarnedLeaderboard(guildId: string, limit = 10): EconomyRow[] {
  return db.prepare(
    'SELECT * FROM economy WHERE guild_id = ? ORDER BY total_earned DESC LIMIT ?'
  ).all(guildId, limit) as unknown as EconomyRow[];
}

export function logTransaction(userId: string, guildId: string, amount: number, type: string, meta?: string): void {
  db.prepare(
    'INSERT INTO coin_transactions (user_id, guild_id, amount, type, meta) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, guildId, amount, type, meta ?? null);
}

// Tổng coins đã chuyển đi hôm nay (UTC date) cho giới hạn chống alt-farm
export function getTodayTransferTotal(userId: string, guildId: string): number {
  const today = new Date().toISOString().split('T')[0];
  const row = db.prepare(`
    SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM coin_transactions
    WHERE user_id = ? AND guild_id = ? AND type = 'pay' AND date(created_at) = ?
  `).get(userId, guildId, today) as { total: number };
  return row?.total ?? 0;
}
