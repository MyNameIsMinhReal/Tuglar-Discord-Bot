import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { db } from '../database';
import { Challenge, ChallengeLogRow, ChallengePendingRow } from '../types';
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
  .addSubcommand(sub => sub
    .setName('done')
    .setDescription('Nộp ảnh hoàn thành thử thách — chờ admin duyệt')
    .addAttachmentOption(opt => opt
      .setName('proof')
      .setDescription('Ảnh chứng minh đã hoàn thành')
      .setRequired(true)))
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

  const pending = db.prepare(
    'SELECT status FROM challenge_pending WHERE user_id = ? AND guild_id = ? AND challenge_date = ?'
  ).get(i.user.id, guildId, today) as unknown as { status: string } | undefined;

  const latestLog = db.prepare(`
    SELECT streak FROM challenge_log
    WHERE user_id = ? AND guild_id = ? AND completed = 1
    ORDER BY challenge_date DESC LIMIT 1
  `).get(i.user.id, guildId) as unknown as { streak: number } | undefined;

  const streak = latestLog?.streak ?? 0;
  const { total, bonus } = calcReward(challenge.difficulty, streak + 1);
  let status = '⏳ Chưa làm';
  if (log?.completed) status = '✅ Đã hoàn thành';
  else if (pending?.status === 'pending') status = '🕐 Đang chờ admin duyệt';
  else if (pending?.status === 'denied') status = '❌ Bị từ chối — nộp lại ảnh khác';
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
  if (!i.guildId) return;
  const guildId = i.guildId;
  const today = getTodayStr();
  const challenge = getTodayChallenge(i.user.id);

  const existingLog = db.prepare(
    'SELECT completed FROM challenge_log WHERE user_id = ? AND guild_id = ? AND challenge_date = ?'
  ).get(i.user.id, guildId, today) as unknown as { completed: number } | undefined;

  if (existingLog?.completed) {
    return void await i.reply({ content: 'Hôm nay đã hoàn thành rồi nha, ngon lắm! 😄', ephemeral: true });
  }

  const existingPending = db.prepare(
    'SELECT status FROM challenge_pending WHERE user_id = ? AND guild_id = ? AND challenge_date = ?'
  ).get(i.user.id, guildId, today) as unknown as { status: string } | undefined;

  if (existingPending?.status === 'pending') {
    return void await i.reply({ content: '🕐 Ảnh của bạn đang chờ admin duyệt rồi!', ephemeral: true });
  }

  const proof = i.options.getAttachment('proof', true);
  if (!proof.contentType?.startsWith('image/')) {
    return void await i.reply({ content: '❌ Vui lòng đính kèm ảnh (PNG, JPG, GIF...).', ephemeral: true });
  }

  const reviewChannelId = process.env.CHALLENGE_REVIEW_CHANNEL_ID;
  if (!reviewChannelId) {
    return void await i.reply({ content: '❌ Bot chưa được cấu hình kênh duyệt. Liên hệ admin.', ephemeral: true });
  }

  db.prepare(`
    INSERT INTO challenge_pending (user_id, guild_id, challenge_date, challenge_text, image_url, difficulty)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, guild_id, challenge_date) DO UPDATE SET
      image_url = excluded.image_url, status = 'pending', message_id = NULL, reviewed_by = NULL
  `).run(i.user.id, guildId, today, challenge.text, proof.url, challenge.difficulty);

  const row = db.prepare(
    'SELECT id FROM challenge_pending WHERE user_id = ? AND guild_id = ? AND challenge_date = ?'
  ).get(i.user.id, guildId, today) as unknown as { id: number };

  const reviewChannel = await i.client.channels.fetch(reviewChannelId).catch(() => null);
  if (!reviewChannel?.isTextBased()) {
    return void await i.reply({ content: '❌ Kênh duyệt không hợp lệ. Liên hệ admin.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('📋 Yêu cầu duyệt thử thách')
    .setDescription(`<@${i.user.id}> muốn hoàn thành thử thách hôm nay`)
    .addFields(
      { name: 'Thử thách', value: `${challenge.emoji} ${challenge.text}`, inline: false },
      { name: 'Độ khó', value: DIFF_LABEL[challenge.difficulty], inline: true },
      { name: 'Ngày', value: today, inline: true },
    )
    .setImage(proof.url)
    .setTimestamp();

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ch_approve:${row.id}`)
      .setLabel('Duyệt')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ch_deny:${row.id}`)
      .setLabel('Từ chối')
      .setStyle(ButtonStyle.Danger),
  );

  const reviewMsg = await reviewChannel.send({
    embeds: [embed],
    components: [buttons],
  });

  db.prepare('UPDATE challenge_pending SET message_id = ? WHERE id = ?').run(reviewMsg.id, row.id);

  await i.reply({ content: '📸 Đã gửi ảnh! Admin sẽ duyệt sớm nhé.', ephemeral: true });
}

// ── Streak helper (used by handleApprove) ──────────────────────────
function computeNewStreak(
  userId: string,
  guildId: string,
  challengeDate: string,
): { newStreak: number; graceApplied: boolean } {
  const yesterday = new Date(new Date(challengeDate).getTime() - 86_400_000).toISOString().split('T')[0];
  const prevLog = db.prepare(
    'SELECT streak FROM challenge_log WHERE user_id = ? AND guild_id = ? AND challenge_date = ? AND completed = 1'
  ).get(userId, guildId, yesterday) as unknown as { streak: number } | undefined;

  if (prevLog) {
    return { newStreak: prevLog.streak + 1, graceApplied: false };
  }

  const twoDaysAgo = new Date(new Date(challengeDate).getTime() - 2 * 86_400_000).toISOString().split('T')[0];
  const prevStreakLog = db.prepare(
    'SELECT streak FROM challenge_log WHERE user_id = ? AND guild_id = ? AND challenge_date = ? AND completed = 1'
  ).get(userId, guildId, twoDaysAgo) as unknown as { streak: number } | undefined;

  if (!hasUsedGrace(userId, guildId) && prevStreakLog && prevStreakLog.streak > 0) {
    const graceStreak = prevStreakLog.streak + 1;
    db.prepare(`
      INSERT INTO challenge_log (user_id, guild_id, challenge_date, challenge_text, completed, streak, used_grace)
      VALUES (?, ?, ?, 'Grace day', 1, ?, 1)
      ON CONFLICT(user_id, guild_id, challenge_date) DO UPDATE SET completed = 1, streak = ?, used_grace = 1
    `).run(userId, guildId, yesterday, graceStreak, graceStreak);
    return { newStreak: graceStreak + 1, graceApplied: true };
  }

  return { newStreak: 1, graceApplied: false };
}

// ── Button handlers (exported for interactionCreate) ───────────────
export async function handleApprove(i: ButtonInteraction): Promise<void> {
  if (!i.memberPermissions?.has('ManageGuild')) {
    return void await i.reply({ content: '❌ Bạn không có quyền duyệt.', ephemeral: true });
  }

  const pendingId = Number.parseInt(i.customId.split(':')[1]);
  const pending = db.prepare('SELECT * FROM challenge_pending WHERE id = ?')
    .get(pendingId) as unknown as ChallengePendingRow | undefined;

  if (!pending) { await i.reply({ content: '❌ Không tìm thấy submission.', ephemeral: true }); return; }
  if (pending.status !== 'pending') { await i.reply({ content: 'Đã xử lý rồi.', ephemeral: true }); return; }

  const { newStreak, graceApplied } = computeNewStreak(pending.user_id, pending.guild_id, pending.challenge_date);

  db.prepare(`
    INSERT INTO challenge_log (user_id, guild_id, challenge_date, challenge_text, completed, streak, used_grace)
    VALUES (?, ?, ?, ?, 1, ?, 0)
    ON CONFLICT(user_id, guild_id, challenge_date) DO UPDATE SET completed = 1, streak = ?, used_grace = 0
  `).run(pending.user_id, pending.guild_id, pending.challenge_date, pending.challenge_text, newStreak, newStreak);

  const { total, bonus } = calcReward(pending.difficulty, newStreak);
  Eco.addCoins(pending.user_id, pending.guild_id, total);

  db.prepare('UPDATE challenge_pending SET status = ?, reviewed_by = ? WHERE id = ?')
    .run('approved', i.user.id, pendingId);

  const approvedEmbed = EmbedBuilder.from(i.message.embeds[0])
    .setColor(0x22c55e)
    .setFooter({ text: `✅ Duyệt bởi ${i.user.tag}` });

  await i.update({ embeds: [approvedEmbed], components: [] });

  let dm = `✅ Thử thách của bạn đã được duyệt!\n**${pending.challenge_text}**\n`;
  dm += `${DIFF_LABEL[pending.difficulty]} → **+${formatCoins(total)} coins**`;
  if (bonus > 0) dm += ` (bao gồm +${bonus} streak bonus)`;
  if (graceApplied) dm += `\n🛡️ Grace tự động cho ngày hôm qua — streak được bảo toàn!`;
  const hit = MILESTONES.find(m => newStreak === m.streak);
  if (hit) dm += `\n${hit.label} **${newStreak} ngày** 🎉`;
  else if (newStreak > 1) dm += `\n🔥 Streak: **${newStreak} ngày**`;

  await i.client.users.fetch(pending.user_id)
    .then(u => u.send(dm))
    .catch(() => null);
}

export async function handleDeny(i: ButtonInteraction): Promise<void> {
  if (!i.memberPermissions?.has('ManageGuild')) {
    return void await i.reply({ content: '❌ Bạn không có quyền từ chối.', ephemeral: true });
  }

  const pendingId = Number.parseInt(i.customId.split(':')[1]);
  const pending = db.prepare('SELECT * FROM challenge_pending WHERE id = ?')
    .get(pendingId) as unknown as ChallengePendingRow | undefined;

  if (!pending) { await i.reply({ content: '❌ Không tìm thấy submission.', ephemeral: true }); return; }
  if (pending.status !== 'pending') { await i.reply({ content: 'Đã xử lý rồi.', ephemeral: true }); return; }

  db.prepare('UPDATE challenge_pending SET status = ?, reviewed_by = ? WHERE id = ?')
    .run('denied', i.user.id, pendingId);

  const deniedEmbed = EmbedBuilder.from(i.message.embeds[0])
    .setColor(0xef4444)
    .setFooter({ text: `❌ Từ chối bởi ${i.user.tag}` });

  await i.update({ embeds: [deniedEmbed], components: [] });

  await i.client.users.fetch(pending.user_id)
    .then(u => u.send(`❌ Ảnh thử thách của bạn ngày **${pending.challenge_date}** bị từ chối.\nDùng \`/challenge done\` để nộp lại ảnh khác nhé.`))
    .catch(() => null);
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
