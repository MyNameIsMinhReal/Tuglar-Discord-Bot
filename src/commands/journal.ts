import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { db } from '../database';
import { JournalRow } from '../types';
import { COLOR, errorEmbed, successEmbed } from '../utils/embeds';
import { truncate } from '../utils/helpers';

const MOODS = ['😊', '😐', '😔', '😤', '😴', '🤩', '😰', '😌'];

export const data = new SlashCommandBuilder()
  .setName('journal')
  .setDescription('📔 Nhật ký cá nhân riêng tư trong Discord')
  .addSubcommand(sub => sub
    .setName('write')
    .setDescription('✍️ Viết nhật ký hôm nay')
    .addStringOption(o => o.setName('content').setDescription('Nội dung nhật ký').setRequired(true))
    .addStringOption(o => o.setName('mood')
      .setDescription('Tâm trạng hôm nay')
      .addChoices(
        { name: '😊 Vui', value: '😊 Vui' },
        { name: '😐 Bình thường', value: '😐 Bình thường' },
        { name: '😔 Buồn', value: '😔 Buồn' },
        { name: '😤 Căng thẳng', value: '😤 Căng thẳng' },
        { name: '😴 Mệt mỏi', value: '😴 Mệt mỏi' },
        { name: '🤩 Hứng khởi', value: '🤩 Hứng khởi' },
        { name: '😰 Lo lắng', value: '😰 Lo lắng' },
        { name: '😌 Bình yên', value: '😌 Bình yên' },
      ))
  )
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('📋 Xem danh sách nhật ký gần đây')
    .addIntegerOption(o => o.setName('count').setDescription('Số bài (mặc định 10)').setMinValue(1).setMaxValue(30))
  )
  .addSubcommand(sub => sub
    .setName('read')
    .setDescription('📖 Đọc một bài nhật ký')
    .addIntegerOption(o => o.setName('id').setDescription('ID bài nhật ký').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('delete')
    .setDescription('🗑️ Xóa một bài nhật ký')
    .addIntegerOption(o => o.setName('id').setDescription('ID bài nhật ký').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('search')
    .setDescription('🔍 Tìm kiếm trong nhật ký')
    .addStringOption(o => o.setName('keyword').setDescription('Từ khóa tìm kiếm').setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'write':  return handleWrite(interaction);
    case 'list':   return handleList(interaction);
    case 'read':   return handleRead(interaction);
    case 'delete': return handleDeleteJournal(interaction);
    case 'search': return handleSearchJournal(interaction);
  }
}

async function handleWrite(i: ChatInputCommandInteraction): Promise<void> {
  const content = i.options.getString('content', true);
  const mood = i.options.getString('mood') ?? null;

  const result = db.prepare(
    'INSERT INTO journal (user_id, content, mood) VALUES (?, ?, ?)'
  ).run(i.user.id, content, mood);

  const embed = new EmbedBuilder()
    .setColor(COLOR.JOURNAL)
    .setTitle(`📔 Nhật ký đã lưu ${mood ?? ''}`)
    .setDescription(`> ${content.slice(0, 300)}${content.length > 300 ? '...' : ''}`)
    .addFields({ name: '🔖 ID', value: `#${result.lastInsertRowid}`, inline: true })
    .setTimestamp()
    .setFooter({ text: 'Chỉ bạn mới xem được nhật ký của mình' });

  await i.reply({ embeds: [embed], ephemeral: true });
}

async function handleList(i: ChatInputCommandInteraction): Promise<void> {
  const count = i.options.getInteger('count') ?? 10;

  const entries = db.prepare(
    'SELECT * FROM journal WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(i.user.id, count) as unknown as JournalRow[];

  if (entries.length === 0) {
    return void await i.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.INFO)
        .setDescription('Bạn chưa có bài nhật ký nào!\nDùng `/journal write` để bắt đầu viết.')],
      ephemeral: true,
    });
  }

  const lines = entries.map(e => {
    const date = new Date(e.created_at).toLocaleDateString('vi-VN');
    const mood = e.mood ? ` ${e.mood}` : '';
    const preview = truncate(e.content, 60);
    return `**#${e.id}**${mood} \`${date}\` — ${preview}`;
  });

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.JOURNAL)
      .setTitle(`📔 Nhật ký của bạn (${entries.length} bài)`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Dùng /journal read <id> để đọc đầy đủ' })],
    ephemeral: true,
  });
}

async function handleRead(i: ChatInputCommandInteraction): Promise<void> {
  const id = i.options.getInteger('id', true);

  const entry = db.prepare(
    'SELECT * FROM journal WHERE id = ? AND user_id = ?'
  ).get(id, i.user.id) as unknown as JournalRow | undefined;

  if (!entry) {
    return void await i.reply({
      embeds: [errorEmbed(`Không tìm thấy nhật ký #${id}`)],
      ephemeral: true,
    });
  }

  const date = new Date(entry.created_at);
  const embed = new EmbedBuilder()
    .setColor(COLOR.JOURNAL)
    .setTitle(`📔 Nhật ký #${entry.id}${entry.mood ? ` — ${entry.mood}` : ''}`)
    .setDescription(entry.content.slice(0, 4000))
    .setTimestamp(date)
    .setFooter({ text: date.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) });

  await i.reply({ embeds: [embed], ephemeral: true });
}

async function handleDeleteJournal(i: ChatInputCommandInteraction): Promise<void> {
  const id = i.options.getInteger('id', true);

  const entry = db.prepare(
    'SELECT * FROM journal WHERE id = ? AND user_id = ?'
  ).get(id, i.user.id) as unknown as JournalRow | undefined;

  if (!entry) {
    return void await i.reply({ embeds: [errorEmbed(`Không tìm thấy nhật ký #${id}`)], ephemeral: true });
  }

  db.prepare('DELETE FROM journal WHERE id = ?').run(id);
  await i.reply({ embeds: [successEmbed('Đã xóa', `Nhật ký #${id} đã được xóa.`)], ephemeral: true });
}

async function handleSearchJournal(i: ChatInputCommandInteraction): Promise<void> {
  const keyword = i.options.getString('keyword', true);

  const entries = db.prepare(
    'SELECT * FROM journal WHERE user_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT 10'
  ).all(i.user.id, `%${keyword}%`) as unknown as JournalRow[];

  if (entries.length === 0) {
    return void await i.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.WARNING)
        .setDescription(`Không tìm thấy nhật ký nào chứa **"${keyword}"**`)],
      ephemeral: true,
    });
  }

  const lines = entries.map(e => {
    const date = new Date(e.created_at).toLocaleDateString('vi-VN');
    const preview = truncate(e.content, 80);
    return `**#${e.id}** \`${date}\` — ${preview}`;
  });

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.JOURNAL)
      .setTitle(`🔍 Tìm kiếm: "${keyword}"`)
      .setDescription(lines.join('\n'))],
    ephemeral: true,
  });
}
