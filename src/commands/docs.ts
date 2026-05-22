import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { db } from '../database';
import { DocumentRow } from '../types';
import { errorEmbed, successEmbed, COLOR } from '../utils/embeds';

export const data = new SlashCommandBuilder()
  .setName('docs')
  .setDescription('📁 Quản lý tài liệu học tập theo môn')
  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Lưu tài liệu mới')
    .addStringOption(o => o.setName('subject').setDescription('Tên môn học').setRequired(true))
    .addStringOption(o => o.setName('title').setDescription('Tiêu đề tài liệu').setRequired(true))
    .addStringOption(o => o.setName('url').setDescription('Link tài liệu (Drive, PDF, website...)').setRequired(true))
    .addStringOption(o => o.setName('type')
      .setDescription('Loại tài liệu')
      .addChoices(
        { name: '📁 Google Drive', value: 'drive' },
        { name: '📄 PDF', value: 'pdf' },
        { name: '🔗 Link khác', value: 'link' },
      ))
  )
  .addSubcommand(sub => sub
    .setName('list')
    .setDescription('Xem danh sách tài liệu')
    .addStringOption(o => o.setName('subject').setDescription('Lọc theo môn học (để trống = tất cả)'))
  )
  .addSubcommand(sub => sub
    .setName('search')
    .setDescription('Tìm kiếm tài liệu theo từ khóa')
    .addStringOption(o => o.setName('keyword').setDescription('Từ khóa tìm kiếm').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('delete')
    .setDescription('Xóa tài liệu')
    .addIntegerOption(o => o.setName('id').setDescription('ID tài liệu').setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'add':    return handleAdd(interaction);
    case 'list':   return handleList(interaction);
    case 'search': return handleSearch(interaction);
    case 'delete': return handleDelete(interaction);
  }
}

const TYPE_EMOJI: Record<string, string> = { drive: '📁', pdf: '📄', link: '🔗' };

async function handleAdd(i: ChatInputCommandInteraction): Promise<void> {
  const subject = i.options.getString('subject', true);
  const title   = i.options.getString('title', true);
  const url     = i.options.getString('url', true);
  const type    = i.options.getString('type') ?? 'link';

  // Validate URL
  try { new URL(url); } catch {
    return void await i.reply({ embeds: [errorEmbed('URL không hợp lệ!')], ephemeral: true });
  }

  const result = db.prepare(`
    INSERT INTO documents (guild_id, user_id, subject, title, url, doc_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(i.guildId!, i.user.id, subject, title, url, type);

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle(`${TYPE_EMOJI[type]} Đã lưu tài liệu!`)
      .addFields(
        { name: '📚 Môn', value: subject, inline: true },
        { name: '🔖 ID', value: `#${result.lastInsertRowid}`, inline: true },
        { name: '📝 Tên', value: title },
        { name: '🔗 Link', value: url },
      )],
  });
}

async function handleList(i: ChatInputCommandInteraction): Promise<void> {
  const subject = i.options.getString('subject');

  const docs = db.prepare(`
    SELECT * FROM documents
    WHERE guild_id = ?
    ${subject ? 'AND LOWER(subject) = LOWER(?)' : ''}
    ORDER BY subject ASC, created_at DESC
    LIMIT 20
  `).all(i.guildId!, ...(subject ? [subject] : [])) as unknown as DocumentRow[];

  if (docs.length === 0) {
    return void await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.INFO)
        .setDescription(subject ? `Chưa có tài liệu nào cho môn **${subject}**` : 'Server chưa có tài liệu nào!')],
    });
  }

  // Nhóm theo môn học
  const grouped: Record<string, DocumentRow[]> = {};
  for (const doc of docs) {
    if (!grouped[doc.subject]) grouped[doc.subject] = [];
    grouped[doc.subject].push(doc);
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setTitle(`📁 Tài liệu${subject ? ` - ${subject}` : ' Server'}`)
    .setTimestamp();

  for (const [subj, items] of Object.entries(grouped)) {
    const lines = items.map(d =>
      `${TYPE_EMOJI[d.doc_type]} **#${d.id}** [${d.title}](${d.url})`
    );
    embed.addFields({ name: `📚 ${subj}`, value: lines.join('\n') });
  }

  await i.reply({ embeds: [embed] });
}

async function handleSearch(i: ChatInputCommandInteraction): Promise<void> {
  const keyword = i.options.getString('keyword', true);

  const docs = db.prepare(`
    SELECT * FROM documents
    WHERE guild_id = ? AND (
      LOWER(title) LIKE LOWER(?) OR LOWER(subject) LIKE LOWER(?)
    )
    ORDER BY created_at DESC LIMIT 10
  `).all(i.guildId!, `%${keyword}%`, `%${keyword}%`) as unknown as DocumentRow[];

  if (docs.length === 0) {
    return void await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.WARNING)
        .setDescription(`Không tìm thấy tài liệu nào chứa từ khóa **"${keyword}"**`)],
      ephemeral: true,
    });
  }

  const lines = docs.map(d =>
    `${TYPE_EMOJI[d.doc_type]} **#${d.id}** [${d.title}](${d.url}) \`[${d.subject}]\``
  );

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.INFO)
      .setTitle(`🔍 Kết quả tìm kiếm: "${keyword}"`)
      .setDescription(lines.join('\n'))],
  });
}

async function handleDelete(i: ChatInputCommandInteraction): Promise<void> {
  const id = i.options.getInteger('id', true);

  const doc = db.prepare(
    'SELECT * FROM documents WHERE id = ? AND (user_id = ? OR guild_id = ?)'
  ).get(id, i.user.id, i.guildId!) as unknown as DocumentRow | undefined;

  if (!doc) {
    return void await i.reply({ embeds: [errorEmbed(`Không tìm thấy tài liệu #${id}`)], ephemeral: true });
  }

  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  await i.reply({ embeds: [successEmbed('Đã xóa', `Tài liệu **#${id}: ${doc.title}** đã được xóa.`)] });
}
