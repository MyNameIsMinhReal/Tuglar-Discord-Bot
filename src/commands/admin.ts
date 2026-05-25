import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { db } from '../database';
import { COLOR } from '../utils/embeds';

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
];

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('[Admin] Quản lý bot')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'disable': return handleDisable(interaction);
    case 'enable':  return handleEnable(interaction);
    case 'list':    return handleList(interaction);
  }
}

async function handleDisable(i: ChatInputCommandInteraction): Promise<void> {
  const cmd = i.options.getString('command', true);

  if (PROTECTED.has(cmd)) {
    await i.reply({ content: `❌ Lệnh \`/${cmd}\` không thể tắt.`, ephemeral: true });
    return;
  }

  const already = db.prepare(
    'SELECT 1 FROM disabled_commands WHERE command_name = ? AND guild_id = ?'
  ).get(cmd, i.guildId!);

  if (already) {
    await i.reply({ content: `⚠️ \`/${cmd}\` đang bị tắt rồi.`, ephemeral: true });
    return;
  }

  db.prepare(
    'INSERT INTO disabled_commands (command_name, guild_id, disabled_by) VALUES (?, ?, ?)'
  ).run(cmd, i.guildId!, i.user.id);

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.WARNING)
      .setDescription(`🔒 Đã tắt \`/${cmd}\` — người dùng thường sẽ thấy "lệnh này chưa mở" khi dùng.`)],
  });
}

async function handleEnable(i: ChatInputCommandInteraction): Promise<void> {
  const cmd = i.options.getString('command', true);

  const result = db.prepare(
    'DELETE FROM disabled_commands WHERE command_name = ? AND guild_id = ?'
  ).run(cmd, i.guildId!);

  if (result.changes === 0) {
    await i.reply({ content: `⚠️ \`/${cmd}\` đang bật rồi, không cần làm gì.`, ephemeral: true });
    return;
  }

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setDescription(`🔓 Đã bật lại \`/${cmd}\` — mọi người dùng được rồi.`)],
  });
}

async function handleList(i: ChatInputCommandInteraction): Promise<void> {
  const disabled = new Set(
    (db.prepare('SELECT command_name FROM disabled_commands WHERE guild_id = ?')
      .all(i.guildId!) as { command_name: string }[])
      .map(r => r.command_name)
  );

  const lines = ALL_COMMANDS.map(({ name, value }) => {
    const status = disabled.has(value) ? '🔒 Tắt' : '🟢 Bật';
    return `${status} \`${name}\``;
  });

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.INFO)
      .setTitle('⚙️ Trạng thái lệnh trên server')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Admin luôn dùng được dù lệnh đang tắt' })],
    ephemeral: true,
  });
}
