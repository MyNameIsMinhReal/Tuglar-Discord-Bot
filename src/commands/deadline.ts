import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { db } from '../database';
import { DeadlineRow } from '../types';
import { parseDate, formatDate, relativeTime } from '../utils/helpers';
import { COLOR, errorEmbed, successEmbed } from '../utils/embeds';

export const data = new SlashCommandBuilder()
  .setName('deadline')
  .setDescription('Quản lý deadline bài tập, lịch thi')
  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Thêm deadline mới')
    .addStringOption(o => o.setName('title').setDescription('Tên deadline').setRequired(true))
    .addStringOption(o => o.setName('date').setDescription('Ngày giờ: DD/MM/YYYY HH:mm').setRequired(true))
    .addStringOption(o => o.setName('subject').setDescription('Môn học'))
  )
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('Xem danh sách deadline')
    .addBooleanOption(o => o.setName('all').setDescription('Hiện cả deadline đã xong'))
  )
  .addSubcommand(sub => sub
    .setName('done')
    .setDescription('Đánh dấu đã xong')
    .addIntegerOption(o => o.setName('id').setDescription('ID deadline').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('delete')
    .setDescription('Xóa deadline')
    .addIntegerOption(o => o.setName('id').setDescription('ID deadline').setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'add':    return handleAdd(interaction);
    case 'list':   return handleList(interaction);
    case 'done':   return handleDone(interaction);
    case 'delete': return handleDelete(interaction);
  }
}

async function handleAdd(i: ChatInputCommandInteraction): Promise<void> {
  const title   = i.options.getString('title', true);
  const dateStr = i.options.getString('date', true);
  const subject = i.options.getString('subject') ?? null;

  const dueDate = parseDate(dateStr);
  if (!dueDate) {
    await i.reply({
      embeds: [errorEmbed('Ngày giờ không đúng định dạng!\nNhập theo kiểu: `DD/MM/YYYY HH:mm`\nVí dụ: `25/12/2025 23:59`')],
      ephemeral: true,
    });
    return;
  }
  if (dueDate < new Date()) {
    await i.reply({ embeds: [errorEmbed('Ngày đó đã qua rồi 😅')], ephemeral: true });
    return;
  }

  const result = db.prepare(
    'INSERT INTO deadlines (user_id, guild_id, channel_id, title, subject, due_date) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(i.user.id, i.guildId!, i.channelId, title, subject, dueDate.toISOString());

  const embed = new EmbedBuilder()
    .setColor(COLOR.SUCCESS)
    .setTitle('✅ Đã thêm deadline')
    .addFields(
      { name: '📌 Tên', value: title, inline: true },
      { name: '🔖 ID', value: `#${result.lastInsertRowid}`, inline: true },
      ...(subject ? [{ name: '📚 Môn', value: subject, inline: true }] : []),
      { name: '⏰ Hạn nộp', value: `${formatDate(dueDate)} (${relativeTime(dueDate)})` },
    )
    .setTimestamp();

  await i.reply({ embeds: [embed] });
}

async function handleList(i: ChatInputCommandInteraction): Promise<void> {
  const showAll = i.options.getBoolean('all') ?? false;
  const deadlines = db.prepare(`
    SELECT * FROM deadlines WHERE user_id = ? AND guild_id = ?
    ${showAll ? '' : 'AND is_done = 0'}
    ORDER BY due_date ASC LIMIT 15
  `).all(i.user.id, i.guildId!) as unknown as DeadlineRow[];

  if (deadlines.length === 0) {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.SUCCESS)
        .setTitle('🎉 Không có deadline nào!')
        .setDescription('Thoải mái đi, không có gì cần lo hết 😎')],
    });
    return;
  }

  const lines = deadlines.map(d => {
    const due  = new Date(d.due_date);
    const diff = due.getTime() - Date.now();
    const rel  = relativeTime(due);
    const subj = d.subject ? ` \`[${d.subject}]\`` : '';
    const done = d.is_done ? ' ~~xong~~' : diff < 0 ? ' **⚠️ quá hạn**' : '';
    return `**#${d.id}**${subj} ${d.title}${done}\n> ⏰ ${rel}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLOR.WARNING)
    .setTitle(`📋 Deadline của bạn (${deadlines.length})`)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'Dùng /deadline done <id> để đánh dấu hoàn thành' })
    .setTimestamp();

  await i.reply({ embeds: [embed] });
}

async function handleDone(i: ChatInputCommandInteraction): Promise<void> {
  const id = i.options.getInteger('id', true);
  const deadline = db.prepare(
    'SELECT * FROM deadlines WHERE id = ? AND user_id = ?'
  ).get(id, i.user.id) as unknown as DeadlineRow | undefined;

  if (!deadline) {
    await i.reply({ embeds: [errorEmbed(`Không tìm thấy deadline **#${id}** của bạn.`)], ephemeral: true });
    return;
  }

  db.prepare('UPDATE deadlines SET is_done = 1 WHERE id = ?').run(id);

  const msgs = [
    'Cố lên nha 💪',
    'Tiếp tục phát huy!',
    'Giỏi ghê 🎉',
  ];

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle('✅ Hoàn thành rồi!')
      .setDescription(`**${deadline.title}** đã được đánh dấu xong.\n${msgs[Math.floor(Math.random() * msgs.length)]}`)],
  });
}

async function handleDelete(i: ChatInputCommandInteraction): Promise<void> {
  const id = i.options.getInteger('id', true);
  const deadline = db.prepare(
    'SELECT * FROM deadlines WHERE id = ? AND user_id = ?'
  ).get(id, i.user.id) as unknown as DeadlineRow | undefined;

  if (!deadline) {
    await i.reply({ embeds: [errorEmbed(`Không tìm thấy deadline **#${id}**.`)], ephemeral: true });
    return;
  }

  db.prepare('DELETE FROM deadlines WHERE id = ?').run(id);
  await i.reply({
    embeds: [successEmbed('🗑️ Đã xóa', `Deadline **#${id}: ${deadline.title}** đã được xóa.`)],
  });
}
