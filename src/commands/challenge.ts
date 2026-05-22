import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { db } from '../database';
import { Challenge, ChallengeLogRow } from '../types';
import * as Eco from '../services/EconomyService';
import { formatCoins } from '../utils/helpers';
import path from 'path';
import fs from 'fs';

let challenges: Challenge[] = [];
try {
  challenges = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'challenges.json'), 'utf-8'));
} catch {
  challenges = [{ text: 'Học 10 từ vựng tiếng Anh', category: 'Tiếng Anh', emoji: '📖', difficulty: 'easy' }];
}

export const data = new SlashCommandBuilder()
  .setName('challenge')
  .setDescription('Thử thách hàng ngày')
  .addSubcommand(sub => sub.setName('today').setDescription('Thử thách hôm nay là gì'))
  .addSubcommand(sub => sub.setName('done').setDescription('Báo hoàn thành thử thách'))
  .addSubcommand(sub => sub.setName('streak').setDescription('Xem streak và thống kê của bạn'))
  .addSubcommand(sub => sub.setName('leaderboard').setDescription('Ai streak cao nhất server'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'today':       return handleToday(interaction);
    case 'done':        return handleDone(interaction);
    case 'streak':      return handleStreak(interaction);
    case 'leaderboard': return handleLeaderboard(interaction);
  }
}

// ── Constants ──────────────────────────────────────────────────────
const DIFF_LABEL: Record<string, string> = {
  easy:   '🟢 Easy',
  medium: '🟡 Medium',
  hard:   '🔴 Hard',
};

const BASE_REWARD: Record<string, number> = {
  easy:   20,
  medium: 35,
  hard:   60,
};

// Cumulative milestone bonuses — only highest matching tier applies
const MILESTONES = [
  { streak: 30, bonus: 100, label: '👑 1 tháng' },
  { streak: 14, bonus: 50,  label: '💎 2 tuần' },
  { streak: 7,  bonus: 25,  label: '🔥 1 tuần' },
  { streak: 3,  bonus: 10,  label: '✨ 3 ngày' },
];

function calcReward(difficulty: string, streak: number): { total: number; bonus: number } {
  const base = BASE_REWARD[difficulty] ?? 20;
  const milestone = MILESTONES.find(m => streak >= m.streak);
  const bonus = milestone?.bonus ?? 0;
  return { total: base + bonus, bonus };
}

function seededIndex(seed: string, length: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h % length;
}

function getTodayChallenge(userId: string): Challenge {
  const today = getTodayStr();
  return challenges[seededIndex(userId + today, challenges.length)];
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// Returns true if a grace was used in the last 7 days for this user
function hasUsedGrace(userId: string, guildId: string): boolean {
  return !!(db.prepare(`
    SELECT 1 FROM challenge_log
    WHERE user_id = ? AND guild_id = ?
    AND challenge_date > date('now', '-7 days')
    AND used_grace = 1
  `).get(userId, guildId));
}

// ── Handlers ───────────────────────────────────────────────────────
async function handleToday(i: ChatInputCommandInteraction): Promise<void> {
  const guildId = i.guildId;
  const challenge = getTodayChallenge(i.user.id);
  const today = getTodayStr();

  const log = db.prepare(
    'SELECT * FROM challenge_log WHERE user_id = ? AND guild_id = ? AND challenge_date = ?'
  ).get(i.user.id, guildId, today) as unknown as ChallengeLogRow | undefined;

  const latestLog = db.prepare(`
    SELECT streak FROM challenge_log
    WHERE user_id = ? AND guild_id = ? AND completed = 1
    ORDER BY challenge_date DESC LIMIT 1
  `).get(i.user.id, guildId) as unknown as { streak: number } | undefined;

  const streak = latestLog?.streak ?? 0;
  const { total, bonus } = calcReward(challenge.difficulty, streak + 1);
  const status = log?.completed ? '✅ Đã hoàn thành' : '⏳ Chưa làm';
  const graceStatus = hasUsedGrace(i.user.id, guildId)
    ? '🔴 Đã dùng tuần này'
    : '🟢 Còn 1 lần';

  const nextMilestone = MILESTONES.slice().reverse().find(m => streak + 1 < m.streak);

  let msg =
    `**${challenge.emoji} ${challenge.text}**\n` +
    `${DIFF_LABEL[challenge.difficulty]} · Phần thưởng: **${formatCoins(total)} coins**` +
    (bonus > 0 ? ` (base + **+${bonus}** streak bonus)` : '') + '\n\n' +
    `Trạng thái: ${status} | Streak hiện tại: **${streak} ngày** | Grace: ${graceStatus}`;

  if (nextMilestone) {
    msg += `\nMốc tiếp theo: **${nextMilestone.label}** — còn **${nextMilestone.streak - streak} ngày**`;
  }

  msg += '\n\n*Dùng `/challenge done` sau khi hoàn thành*';

  await i.reply({ content: msg });
}

async function handleDone(i: ChatInputCommandInteraction): Promise<void> {
  const guildId = i.guildId;
  const today = getTodayStr();
  const challenge = getTodayChallenge(i.user.id);

  const existing = db.prepare(
    'SELECT * FROM challenge_log WHERE user_id = ? AND guild_id = ? AND challenge_date = ?'
  ).get(i.user.id, guildId, today) as unknown as ChallengeLogRow | undefined;

  if (existing?.completed) {
    return void await i.reply({ content: 'hôm nay đã báo xong rồi nha, ngon lắm! 😄', ephemeral: true });
  }

  // Check yesterday
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  const prevLog = db.prepare(
    'SELECT * FROM challenge_log WHERE user_id = ? AND guild_id = ? AND challenge_date = ? AND completed = 1'
  ).get(i.user.id, guildId, yesterday) as unknown as ChallengeLogRow | undefined;

  let newStreak: number;
  let graceApplied = false;

  if (prevLog) {
    newStreak = prevLog.streak + 1;
  } else {
    // Yesterday was missed — try auto-grace
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().split('T')[0];
    const prevStreakLog = db.prepare(
      'SELECT * FROM challenge_log WHERE user_id = ? AND guild_id = ? AND challenge_date = ? AND completed = 1'
    ).get(i.user.id, guildId, twoDaysAgo) as unknown as ChallengeLogRow | undefined;

    if (!hasUsedGrace(i.user.id, guildId) && prevStreakLog && prevStreakLog.streak > 0) {
      graceApplied = true;
      const graceStreak = prevStreakLog.streak + 1;
      db.prepare(`
        INSERT INTO challenge_log (user_id, guild_id, challenge_date, challenge_text, completed, streak, used_grace)
        VALUES (?, ?, ?, 'Grace day', 1, ?, 1)
        ON CONFLICT(user_id, guild_id, challenge_date) DO UPDATE SET completed = 1, streak = ?, used_grace = 1
      `).run(i.user.id, guildId, yesterday, graceStreak, graceStreak);
      newStreak = graceStreak + 1;
    } else {
      newStreak = 1;
    }
  }

  db.prepare(`
    INSERT INTO challenge_log (user_id, guild_id, challenge_date, challenge_text, completed, streak, used_grace)
    VALUES (?, ?, ?, ?, 1, ?, 0)
    ON CONFLICT(user_id, guild_id, challenge_date) DO UPDATE SET completed = 1, streak = ?, used_grace = 0
  `).run(i.user.id, guildId, today, challenge.text, newStreak, newStreak);

  const { total, bonus } = calcReward(challenge.difficulty, newStreak);
  Eco.addCoins(i.user.id, guildId, total);

  let msg = `✅ Hoàn thành **${challenge.text}**!\n`;
  msg += `${DIFF_LABEL[challenge.difficulty]} → **+${formatCoins(total)} coins**`;
  if (bonus > 0) msg += ` (bao gồm +${bonus} streak bonus)`;
  msg += '\n';

  if (graceApplied) {
    msg += `\n🛡️ *Grace tự động được dùng cho ngày hôm qua — streak được bảo toàn!*`;
  }

  const hit = MILESTONES.find(m => newStreak === m.streak);
  if (hit) {
    msg += `\n${hit.label} **${newStreak} ngày** — tuyệt vời, tiếp tục nhé! 🎉`;
  } else if (newStreak > 1) {
    msg += `\n🔥 Streak: **${newStreak} ngày**`;
  }

  await i.reply({ content: msg });
}

async function handleStreak(i: ChatInputCommandInteraction): Promise<void> {
  const guildId = i.guildId;
  const logs = db.prepare(`
    SELECT * FROM challenge_log
    WHERE user_id = ? AND guild_id = ? AND completed = 1
    ORDER BY challenge_date DESC LIMIT 60
  `).all(i.user.id, guildId) as unknown as ChallengeLogRow[];

  const total = logs.length;
  const current = logs[0]?.streak ?? 0;
  const max = Math.max(...logs.map(l => l.streak), 0);

  const nextMilestone = MILESTONES.slice().reverse().find(m => current < m.streak);
  const graceAvail = !hasUsedGrace(i.user.id, guildId);

  let msg = `📊 **Streak của bạn**\n`;
  msg += `Hiện tại: **${current} ngày** | Kỷ lục: **${max} ngày** | Tổng hoàn thành: **${total} ngày**\n`;
  msg += `Grace tuần này: ${graceAvail ? '🟢 còn 1 lần' : '🔴 đã dùng'}`;

  if (nextMilestone) {
    msg += `\n\nMốc tiếp theo: **${nextMilestone.label}** — còn **${nextMilestone.streak - current} ngày** nữa`;
  }

  await i.reply({ content: msg });
}

async function handleLeaderboard(i: ChatInputCommandInteraction): Promise<void> {
  const top = db.prepare(`
    SELECT user_id, MAX(streak) as max_streak, COUNT(*) as total_done
    FROM challenge_log WHERE guild_id = ? AND completed = 1
    GROUP BY user_id ORDER BY max_streak DESC LIMIT 10
  `).all(i.guildId) as unknown as Array<{ user_id: string; max_streak: number; total_done: number }>;

  if (top.length === 0) {
    return void await i.reply({ content: 'chưa có ai làm thử thách hết 😅' });
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((u, idx) => {
    const me = u.user_id === i.user.id ? ' ← bạn' : '';
    const prefix = medals[idx] ?? `${idx + 1}.`;
    return `${prefix} <@${u.user_id}> — streak **${u.max_streak} ngày** | ${u.total_done} ngày tổng${me}`;
  });

  await i.reply({ content: `ai chăm nhất server:\n\n${lines.join('\n')}` });
}
