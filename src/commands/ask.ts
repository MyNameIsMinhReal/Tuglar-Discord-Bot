import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import * as AI from '../services/AIService';
import { aiResponseEmbed, errorEmbed, COLOR } from '../utils/embeds';
import { checkCooldown, formatCooldown } from '../utils/cooldown';

const COOLDOWN_MS = 2 * 60 * 1000; // 2 phút/người

export const data = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('🤖 Hỏi AI giải thích kiến thức, giải bài tập')
  .addStringOption(o => o.setName('question').setDescription('Câu hỏi của bạn').setRequired(true))
  .addStringOption(o => o.setName('subject').setDescription('Môn học (để bot trả lời đúng ngữ cảnh hơn)'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const left = checkCooldown(`ask:${interaction.user.id}`, COOLDOWN_MS);
  if (left > 0) {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.WARNING)
        .setDescription(`⏳ Chờ **${formatCooldown(left)}** nữa mới dùng \`/ask\` được nhé.`)],
      ephemeral: true,
    });
    return;
  }

  const question = interaction.options.getString('question', true);
  const subject  = interaction.options.getString('subject') ?? undefined;

  await interaction.deferReply();

  try {
    const answer = await AI.askQuestion(question, subject);
    await interaction.editReply({ embeds: [aiResponseEmbed(question, answer, subject)] });
  } catch (err) {
    console.error('[ask] AI error:', err);
    await interaction.editReply({
      embeds: [errorEmbed('Không thể kết nối AI. Kiểm tra lại API key hoặc thử lại sau.')],
    });
  }
}
