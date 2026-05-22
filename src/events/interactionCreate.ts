import { Interaction, EmbedBuilder, MessageFlags } from 'discord.js';
import { COLOR } from '../utils/embeds';
import { handleApprove, handleDeny } from '../commands/challenge';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction: Interaction): Promise<void> {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('ch_approve:')) return handleApprove(interaction);
    if (interaction.customId.startsWith('ch_deny:')) return handleDeny(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

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