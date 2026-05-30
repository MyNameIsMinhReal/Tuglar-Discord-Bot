import {
  SlashCommandBuilder, ChatInputCommandInteraction,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType, ButtonInteraction,
  MessageFlags,
} from 'discord.js';
import { generateQuiz } from '../services/AIService';
import { QuizQuestion } from '../types';
import { COLOR, errorEmbed } from '../utils/embeds';
import { checkCooldown, formatCooldown } from '../utils/cooldown';

const COOLDOWN_MS = 10 * 60 * 1000; // 10 phút/người

export const data = new SlashCommandBuilder()
  .setName('quiz')
  .setDescription('📝 Tạo quiz trắc nghiệm từ AI')
  .addStringOption(o => o.setName('topic').setDescription('Chủ đề quiz (vd: Giải tích, Vật lý, Lịch sử...)').setRequired(true))
  .addIntegerOption(o => o.setName('count').setDescription('Số câu hỏi (1-10, mặc định 5)')
    .setMinValue(1).setMaxValue(10));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const left = checkCooldown(`quiz:${interaction.user.id}`, COOLDOWN_MS);
  if (left > 0) {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.WARNING)
        .setDescription(`⏳ Chờ **${formatCooldown(left)}** nữa mới dùng \`/quiz\` được nhé.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const topic = interaction.options.getString('topic', true);
  const count = interaction.options.getInteger('count') ?? 5;

  await interaction.deferReply();

  const genEmbed = new EmbedBuilder()
    .setColor(COLOR.AI)
    .setDescription(`⏳ Đang tạo ${count} câu quiz về **${topic}**...`);
  await interaction.editReply({ embeds: [genEmbed] });

  const questions = await generateQuiz(topic, count);

  if (!questions || questions.length === 0) {
    return void await interaction.editReply({
      embeds: [errorEmbed('Không thể tạo quiz. Vui lòng thử lại với chủ đề khác.')],
    });
  }

  // Cập nhật với intro embed
  const introEmbed = new EmbedBuilder()
    .setColor(COLOR.PRIMARY)
    .setTitle(`📝 Quiz: ${topic}`)
    .setDescription(`✅ Đã tạo **${questions.length} câu hỏi**!\nQuiz sẽ bắt đầu ngay. Mỗi câu có **30 giây** để trả lời.\nChỉ người dùng lệnh mới được trả lời.`)
    .setFooter({ text: 'Bắt đầu sau 3 giây...' });

  await interaction.editReply({ embeds: [introEmbed] });
  await sleep(3000);

  // Chạy từng câu
  let score = 0;
  for (let idx = 0; idx < questions.length; idx++) {
    const q = questions[idx] as QuizQuestion;
    const result = await runQuestion(interaction, q, idx + 1, questions.length);
    if (result === true) score++;
  }

  // Kết quả cuối
  const pct = Math.round((score / questions.length) * 100);
  const grade = pct >= 90 ? '🏆 Xuất sắc!' : pct >= 70 ? '🌟 Giỏi!' : pct >= 50 ? '👍 Khá!' : '💪 Cần cố gắng thêm!';

  const resultEmbed = new EmbedBuilder()
    .setColor(pct >= 50 ? COLOR.SUCCESS : COLOR.WARNING)
    .setTitle(`📊 Kết quả Quiz: ${topic}`)
    .setDescription(`${grade}\n\nBạn trả lời đúng **${score}/${questions.length}** câu (${pct}%)`)
    .setFooter({ text: `Người chơi: ${interaction.user.displayName}` })
    .setTimestamp();

  await interaction.followUp({ embeds: [resultEmbed] });
}

async function runQuestion(
  interaction: ChatInputCommandInteraction,
  q: QuizQuestion,
  num: number,
  total: number,
): Promise<boolean | null> {
  const opts = q.options ?? [];
  const LABELS = ['A', 'B', 'C', 'D'];
  const COLORS = [ButtonStyle.Primary, ButtonStyle.Primary, ButtonStyle.Primary, ButtonStyle.Primary];

  const questionEmbed = new EmbedBuilder()
    .setColor(COLOR.PRIMARY)
    .setTitle(`❓ Câu ${num}/${total}`)
    .setDescription(`**${q.question}**\n\n${opts.map((o: string, i: number) => `${LABELS[i]}) ${o.replace(/^[ABCD]\)\s*/,'')}`).join('\n')}`)
    .setFooter({ text: '⏱ Bạn có 30 giây để trả lời' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...LABELS.slice(0, opts.length).map((label, i) =>
      new ButtonBuilder()
        .setCustomId(`quiz_${label}`)
        .setLabel(label)
        .setStyle(COLORS[i])
    )
  );

  const msg = await interaction.followUp({ embeds: [questionEmbed], components: [row] });

  try {
    const collected = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (btn: ButtonInteraction) => btn.user.id === interaction.user.id,
      time: 30_000,
    });

    const chosen = collected.customId.replace('quiz_', '');
    const correct = q.answer?.toUpperCase() ?? 'A';
    const isCorrect = chosen === correct;

    const resultEmbed = new EmbedBuilder()
      .setColor(isCorrect ? COLOR.SUCCESS : COLOR.DANGER)
      .setTitle(isCorrect ? '✅ Chính xác!' : `❌ Sai rồi! Đáp án là ${correct}`)
      .setDescription(`**${q.question}**\n\n💡 ${q.explanation ?? 'Không có giải thích'}`)
      .setFooter({ text: `Bạn chọn: ${chosen}` });

    // Disable buttons
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...LABELS.slice(0, opts.length).map((label, i) =>
        new ButtonBuilder()
          .setCustomId(`quiz_done_${label}`)
          .setLabel(label)
          .setStyle(label === correct ? ButtonStyle.Success : label === chosen && !isCorrect ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .setDisabled(true)
      )
    );

    await collected.update({ embeds: [resultEmbed], components: [disabledRow] });
    return isCorrect;

  } catch {
    // Timeout
    const timeoutEmbed = new EmbedBuilder()
      .setColor(COLOR.DANGER)
      .setTitle('⏰ Hết giờ!')
      .setDescription(`Đáp án đúng là **${q.answer}**\n💡 ${q.explanation ?? ''}`);

    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...LABELS.slice(0, opts.length).map(label =>
        new ButtonBuilder()
          .setCustomId(`quiz_to_${label}`)
          .setLabel(label)
          .setStyle(label === q.answer ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true)
      )
    );

    await msg.edit({ embeds: [timeoutEmbed], components: [disabledRow] });
    return null;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
