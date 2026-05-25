import { Interaction, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { COLOR } from '../utils/embeds';
import { handleApprove, handleDeny } from '../commands/challenge';
import { db } from '../database';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction: Interaction): Promise<void> {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('ch_approve:')) return handleApprove(interaction);
    if (interaction.customId.startsWith('ch_deny:')) return handleDeny(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  // Chặn lệnh chạy ngoài server (tránh crash do i.guildId! null)
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ Lệnh này chỉ dùng được trong server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.DANGER)
        .setDescription(`❌ Lệnh \`/${interaction.commandName}\` không tồn tại`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Check if command is disabled for this guild (admins bypass)
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  if (!isAdmin && interaction.guildId) {
    const disabled = db.prepare(
      'SELECT 1 FROM disabled_commands WHERE command_name = ? AND guild_id = ?'
    ).get(interaction.commandName, interaction.guildId);

    if (disabled) {
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.WARNING)
          .setDescription(`🔒 Lệnh \`/${interaction.commandName}\` chưa được mở trên server này.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Command Error] /${interaction.commandName}:`, error);
    const errorEmbed = new EmbedBuilder()
      .setColor(COLOR.DANGER)
      .setTitle('❌ Có lỗi xảy ra')
      .setDescription('Bot gặp lỗi khi thực hiện lệnh này. Vui lòng thử lại sau.');

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
  }
}