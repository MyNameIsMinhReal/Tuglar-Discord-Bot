import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits , MessageFlags } from 'discord.js';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { db } from '../database';
import { COLOR } from '../utils/embeds';
import * as Eco from '../services/EconomyService';
import { formatCoins } from '../utils/helpers';

const BG_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;

// Commands that cannot be disabled
const PROTECTED = new Set(['admin']);

const ALL_COMMANDS = [
  { name: '/ask',       value: 'ask' },
  { name: '/ai',        value: 'ai' },
  { name: '/quiz',      value: 'quiz' },
  { name: '/deadline',  value: 'deadline' },
  { name: '/eco',       value: 'eco' },
  { name: '/gacha',     value: 'gacha' },
  { name: '/game',      value: 'game' },
  { name: '/challenge', value: 'challenge' },
  { name: '/journal',   value: 'journal' },
  { name: '/docs',      value: 'docs' },
  { name: '/profile',   value: 'profile' },
  { name: '/index',     value: 'index' },
];

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('[Admin] Quản lý bot')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  
  // ── 1. Nhóm SYSTEM (Hệ thống lệnh) ───────────────────────────────
  .addSubcommandGroup(group => group
    .setName('system')
    .setDescription('Quản lý bật/tắt các lệnh trên server')
    .addSubcommand(sub => sub
      .setName('disable')
      .setDescription('Tắt một lệnh — người thường sẽ không dùng được')
      .addStringOption(o => o
        .setName('command')
        .setDescription('Tên lệnh cần tắt')
        .setRequired(true)
        .addChoices(...ALL_COMMANDS)
      )
    )
    .addSubcommand(sub => sub
      .setName('enable')
      .setDescription('Bật lại một lệnh đã tắt')
      .addStringOption(o => o
        .setName('command')
        .setDescription('Tên lệnh cần bật lại')
        .setRequired(true)
        .addChoices(...ALL_COMMANDS)
      )
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('Xem trạng thái bật/tắt của tất cả lệnh')
    )
  )

  // ── 2. Nhóm ECO (Kinh tế) ────────────────────────────────────────
  .addSubcommandGroup(group => group
    .setName('eco')
    .setDescription('Quản lý tiền tệ và kinh tế của server')
    .addSubcommand(sub => sub
      .setName('give')
      .setDescription('[Admin] Tặng coins cho người dùng')
      .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Số coins').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('reason').setDescription('Lý do'))
    )
    .addSubcommand(sub => sub
      .setName('take')
      .setDescription('[Admin] Trừ coins của người dùng')
      .addUserOption(o => o.setName('user').setDescription('Người bị trừ').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Số coins').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('reason').setDescription('Lý do'))
    )
    .addSubcommand(sub => sub
      .setName('history')
      .setDescription('[Admin] Xem lịch sử giao dịch của người dùng')
      .addUserOption(o => o.setName('user').setDescription('Người dùng cần kiểm tra').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('stats')
      .setDescription('[Admin] Thống kê economy toàn server')
    )
  )

  // ── 3. Nhóm CONTENT (Nội dung & Sự kiện) ─────────────────────────
  .addSubcommandGroup(group => group
    .setName('content')
    .setDescription('Cập nhật tài nguyên và quản lý mùa giải')
    .addSubcommand(sub => sub
      .setName('bg_upload')
      .setDescription('[Admin] Upload ảnh nền cho background cosmetic')
      .addStringOption(o => o
        .setName('background')
        .setDescription('Background cosmetic cần set ảnh')
        .setRequired(true)
        .addChoices(
          { name: 'Study Room',   value: 'bg_study_room'   },
          { name: 'Forest',       value: 'bg_forest'       },
          { name: 'Cyber',        value: 'bg_cyber'        },
          { name: 'Galaxy',       value: 'bg_galaxy'       },
          { name: 'Shadow Realm', value: 'bg_shadow_realm' },
        )
      )
      .addAttachmentOption(o => o
        .setName('image')
        .setDescription('File ảnh (jpg/png/webp) hoặc ảnh động (gif) — khuyến nghị 800×300px')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('season_reset')
      .setDescription('[Admin] Kết thúc season hiện tại — reset 50% coins, chuyển sang prestige')
    )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const group = interaction.options.getSubcommandGroup();
  const sub = interaction.options.getSubcommand();

  if (group === 'system') {
    switch (sub) {
      case 'disable': return handleDisable(interaction);
      case 'enable':  return handleEnable(interaction);
      case 'list':    return handleList(interaction);
    }
  } else if (group === 'eco') {
    switch (sub) {
      case 'give':    return handleEcoGive(interaction);
      case 'take':    return handleEcoTake(interaction);
      case 'history': return handleEcoHistory(interaction);
      case 'stats':   return handleEcoStats(interaction);
    }
  } else if (group === 'content') {
    switch (sub) {
      case 'bg_upload':    return handleBgUpload(interaction);
      case 'season_reset': return handleSeasonReset(interaction);
    }
  }
}

// ── Command Enable/Disable ─────────────────────────────────────────
async function handleDisable(i: ChatInputCommandInteraction): Promise<void> {
  const cmd = i.options.getString('command', true);
  if (PROTECTED.has(cmd)) {
    await i.reply({ content: `❌ Lệnh \`/${cmd}\` không thể tắt.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const already = db.prepare('SELECT 1 FROM disabled_commands WHERE command_name = ? AND guild_id = ?').get(cmd, i.guildId!);
  if (already) {
    await i.reply({ content: `⚠️ \`/${cmd}\` đang bị tắt rồi.`, flags: MessageFlags.Ephemeral });
    return;
  }
  db.prepare('INSERT INTO disabled_commands (command_name, guild_id, disabled_by) VALUES (?, ?, ?)').run(cmd, i.guildId!, i.user.id);
  await i.reply({
    embeds: [new EmbedBuilder().setColor(COLOR.WARNING)
      .setDescription(`🔒 Đã tắt \`/${cmd}\` — người dùng thường sẽ thấy "lệnh này chưa mở" khi dùng.`)],
  });
}

async function handleEnable(i: ChatInputCommandInteraction): Promise<void> {
  const cmd = i.options.getString('command', true);
  const result = db.prepare('DELETE FROM disabled_commands WHERE command_name = ? AND guild_id = ?').run(cmd, i.guildId!);
  if (result.changes === 0) {
    await i.reply({ content: `⚠️ \`/${cmd}\` đang bật rồi, không cần làm gì.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await i.reply({
    embeds: [new EmbedBuilder().setColor(COLOR.SUCCESS).setDescription(`🔓 Đã bật lại \`/${cmd}\` — mọi người dùng được rồi.`)],
  });
}

async function handleList(i: ChatInputCommandInteraction): Promise<void> {
  const disabled = new Set(
    (db.prepare('SELECT command_name FROM disabled_commands WHERE guild_id = ?').all(i.guildId!) as { command_name: string }[])
      .map(r => r.command_name)
  );
  const lines = ALL_COMMANDS.map(({ name, value }) => `${disabled.has(value) ? '🔒 Tắt' : '🟢 Bật'} \`${name}\``);
  await i.reply({
    embeds: [new EmbedBuilder().setColor(COLOR.INFO).setTitle('⚙️ Trạng thái lệnh trên server')
      .setDescription(lines.join('\n')).setFooter({ text: 'Admin luôn dùng được dù lệnh đang tắt' })],
    flags: MessageFlags.Ephemeral,
  });
}

// ── Economy Admin ──────────────────────────────────────────────────
async function handleEcoGive(i: ChatInputCommandInteraction): Promise<void> {
  const target = i.options.getUser('user', true);
  const amount = i.options.getInteger('amount', true);
  const reason = i.options.getString('reason') ?? 'Admin tặng';

  Eco.addCoins(target.id, i.guildId!, amount);
  Eco.logTransaction(target.id, i.guildId!, amount, 'admin_give', `by:${i.user.id} reason:${reason}`);

  const newBal = Eco.getOrCreate(target.id, i.guildId!).balance;
  await i.reply({
    embeds: [new EmbedBuilder().setColor(COLOR.SUCCESS)
      .setTitle('💰 Tặng coins thành công')
      .addFields(
        { name: '👤 Người nhận', value: `<@${target.id}>`, inline: true },
        { name: '💰 Số coins', value: `+${formatCoins(amount)}`, inline: true },
        { name: '👛 Số dư mới', value: formatCoins(newBal), inline: true },
        { name: '📝 Lý do', value: reason, inline: false },
      )],
  });
}

async function handleEcoTake(i: ChatInputCommandInteraction): Promise<void> {
  const target = i.options.getUser('user', true);
  const amount = i.options.getInteger('amount', true);
  const reason = i.options.getString('reason') ?? 'Admin trừ';

  const user = Eco.getOrCreate(target.id, i.guildId!);
  const actualTake = Math.min(amount, user.balance);
  Eco.deductCoins(target.id, i.guildId!, actualTake);
  Eco.logTransaction(target.id, i.guildId!, -actualTake, 'admin_take', `by:${i.user.id} reason:${reason}`);

  const newBal = Eco.getOrCreate(target.id, i.guildId!).balance;
  await i.reply({
    embeds: [new EmbedBuilder().setColor(COLOR.WARNING)
      .setTitle('💸 Trừ coins thành công')
      .addFields(
        { name: '👤 Người bị trừ', value: `<@${target.id}>`, inline: true },
        { name: '💰 Số coins', value: `-${formatCoins(actualTake)}`, inline: true },
        { name: '👛 Số dư mới', value: formatCoins(newBal), inline: true },
        { name: '📝 Lý do', value: reason, inline: false },
      )],
  });
}

async function handleEcoHistory(i: ChatInputCommandInteraction): Promise<void> {
  const target = i.options.getUser('user', true);
  const rows = db.prepare(`
    SELECT amount, type, meta, created_at FROM coin_transactions
    WHERE user_id = ? AND guild_id = ?
    ORDER BY created_at DESC LIMIT 20
  `).all(target.id, i.guildId!) as Array<{ amount: number; type: string; meta: string | null; created_at: string }>;

  if (rows.length === 0) {
    await i.reply({ content: `<@${target.id}> chưa có giao dịch nào.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const TYPE_LABEL: Record<string, string> = {
    daily: '📅 Daily', pay: '💸 Gửi', receive: '📥 Nhận',
    admin_give: '🎁 Admin+', admin_take: '🔧 Admin−',
    challenge: '🏆 Challenge',
  };

  const lines = rows.map(r => {
    const sign  = r.amount >= 0 ? '+' : '';
    const label = TYPE_LABEL[r.type] ?? r.type;
    const date  = new Date(r.created_at).toLocaleDateString('vi-VN');
    return `\`${date}\` ${label} **${sign}${formatCoins(r.amount)}**${r.meta ? ` · ${r.meta}` : ''}`;
  });

  await i.reply({
    embeds: [new EmbedBuilder().setColor(COLOR.INFO)
      .setTitle(`📋 Lịch sử giao dịch — ${target.displayName}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: '20 giao dịch gần nhất' })],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleEcoStats(i: ChatInputCommandInteraction): Promise<void> {
  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT user_id) as total_users,
      SUM(balance)            as total_circulating,
      SUM(total_earned)       as total_ever_earned
    FROM economy WHERE guild_id = ?
  `).get(i.guildId!) as { total_users: number; total_circulating: number; total_ever_earned: number };

  const burned = (stats.total_ever_earned ?? 0) - (stats.total_circulating ?? 0);

  await i.reply({
    embeds: [new EmbedBuilder().setColor(COLOR.INFO)
      .setTitle('📊 Economy Stats — Server')
      .addFields(
        { name: '👥 Người dùng', value: String(stats.total_users ?? 0), inline: true },
        { name: '💰 Coins đang lưu thông', value: formatCoins(stats.total_circulating ?? 0), inline: true },
        { name: '📈 Tổng đã sinh ra', value: formatCoins(stats.total_ever_earned ?? 0), inline: true },
        { name: '🔥 Coins đã đốt/tiêu', value: formatCoins(Math.max(0, burned)), inline: true },
      )],
    flags: MessageFlags.Ephemeral,
  });
}

// ── Background Upload ──────────────────────────────────────────────
async function handleBgUpload(i: ChatInputCommandInteraction): Promise<void> {
  const bgId      = i.options.getString('background', true);
  const attachment = i.options.getAttachment('image', true);

  const VALID_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!attachment.contentType || !VALID_TYPES.includes(attachment.contentType)) {
    await i.reply({ embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription('❌ File phải là ảnh jpg, png, webp hoặc gif.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await i.deferReply({ flags: MessageFlags.Ephemeral });

  const ext     = attachment.contentType === 'image/jpeg' ? 'jpg' : attachment.contentType.split('/')[1];
  const bgDir   = join(process.cwd(), 'assets/backgrounds');
  const destPath = join(bgDir, `${bgId}.${ext}`);

  // Remove old files for this background ID (any extension)
  for (const oldExt of BG_EXTS) {
    const old = join(bgDir, `${bgId}.${oldExt}`);
    if (existsSync(old)) await unlink(old).catch(() => {});
  }

  const res    = await fetch(attachment.url);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buffer);

  await i.editReply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle('✅ Upload thành công!')
      .addFields(
        { name: '🖼️ Background', value: `\`${bgId}\``, inline: true },
        { name: '📁 File',       value: `${bgId}.${ext} (${(buffer.length / 1024).toFixed(0)} KB)`, inline: true },
      )
      .setImage(attachment.url)
      .setFooter({ text: 'Dùng /profile view để xem kết quả' })],
  });
}

// ── Season Reset ───────────────────────────────────────────────────
async function handleSeasonReset(i: ChatInputCommandInteraction): Promise<void> {
  const guildId = i.guildId!;

  // Lấy season hiện tại
  const lastSeason = db.prepare(
    'SELECT season_num FROM seasons WHERE guild_id = ? ORDER BY id DESC LIMIT 1'
  ).get(guildId) as { season_num: number } | undefined;
  const newSeasonNum = (lastSeason?.season_num ?? 0) + 1;

  // Đóng season cũ
  db.prepare(
    "UPDATE seasons SET ended_at = datetime('now'), reset_by = ? WHERE guild_id = ? AND ended_at IS NULL"
  ).run(i.user.id, guildId);

  // Mở season mới
  db.prepare('INSERT INTO seasons (guild_id, season_num) VALUES (?, ?)').run(guildId, newSeasonNum);

  // Reset economy: 50% coins → prestige points (1000 coins = 1 prestige)
  const users = db.prepare('SELECT user_id, balance FROM economy WHERE guild_id = ?').all(guildId) as Array<{ user_id: string; balance: number }>;
  const resetStmt = db.prepare(`
    UPDATE economy SET
      prestige_points = prestige_points + ?,
      balance         = ROUND(balance * 0.5),
      total_earned    = 0
    WHERE user_id = ? AND guild_id = ?
  `);

  db.exec('BEGIN');
  try {
    for (const u of users) {
      const gained = Math.floor(u.balance / 1000);
      resetStmt.run(gained, u.user_id, guildId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  await i.reply({
    embeds: [new EmbedBuilder().setColor(COLOR.SUCCESS)
      .setTitle(`🏆 Season ${newSeasonNum - 1} kết thúc!`)
      .setDescription(
        `Season **${newSeasonNum}** bắt đầu!\n\n` +
        `• Coins của mọi người **giảm còn 50%**\n` +
        `• Coins cũ → **Prestige Points** (1000 coins = 1 điểm)\n` +
        `• Prestige Points lưu vĩnh viễn qua các season\n\n` +
        `Dùng \`/eco balance\` để xem số dư mới.`
      )
      .setFooter({ text: `Reset bởi ${i.user.tag}` })
      .setTimestamp()],
  });
}