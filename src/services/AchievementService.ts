import path from 'node:path';
import fs from 'node:fs';
import { db } from '../database';

interface AchievementDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  trigger: 'challenge_streak' | 'challenge_total' | 'gacha_rolls' | 'gacha_ssr';
  threshold: number;
}

let achievements: AchievementDef[] = [];
try {
  achievements = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'data', 'achievements.json'), 'utf-8')
  );
} catch {
  achievements = [];
}

export function getAchievementDef(id: string): AchievementDef | undefined {
  return achievements.find(a => a.id === id);
}

export function getAllDefs(): AchievementDef[] { return achievements; }

function hasAchievement(userId: string, guildId: string, badgeId: string): boolean {
  return !!db.prepare(
    'SELECT 1 FROM user_achievements WHERE user_id = ? AND guild_id = ? AND badge_id = ?'
  ).get(userId, guildId, badgeId);
}

function grant(userId: string, guildId: string, badgeId: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO user_achievements (user_id, guild_id, badge_id) VALUES (?, ?, ?)'
  ).run(userId, guildId, badgeId);
}

/**
 * Check achievements for a given trigger + current value.
 * Returns newly granted badge definitions (for DM notification).
 */
export function checkAndGrant(
  userId: string,
  guildId: string,
  trigger: AchievementDef['trigger'],
  value: number,
): AchievementDef[] {
  const candidates = achievements.filter(a => a.trigger === trigger && value >= a.threshold);
  const newlyGranted: AchievementDef[] = [];

  for (const ach of candidates) {
    if (!hasAchievement(userId, guildId, ach.id)) {
      grant(userId, guildId, ach.id);
      newlyGranted.push(ach);
    }
  }

  return newlyGranted;
}

export function getUserAchievements(userId: string, guildId: string): AchievementDef[] {
  const rows = db.prepare(
    'SELECT badge_id FROM user_achievements WHERE user_id = ? AND guild_id = ? ORDER BY earned_at ASC'
  ).all(userId, guildId) as { badge_id: string }[];

  return rows
    .map(r => achievements.find(a => a.id === r.badge_id))
    .filter((a): a is AchievementDef => !!a);
}
