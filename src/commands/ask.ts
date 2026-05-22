import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import * as AI from '../services/AIService';
import { aiResponseEmbed, errorEmbed, loadingEmbed } from '../utils/embeds';

export const data = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('🤖 Hỏi AI giải thích kiến thức, giải bài tập')
  .addStringOption(o => o.setName('question').setDescription('Câu hỏi của bạn').setRequired(true))
  .addStringOption(o => o.setName('subject').setDescription('Môn học (để bot trả lời đúng ngữ cảnh hơn)'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
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
