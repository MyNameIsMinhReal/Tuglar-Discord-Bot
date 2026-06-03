import {
  SlashCommandBuilder, ChatInputCommandInteraction,
  EmbedBuilder, TextChannel, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType, ButtonInteraction
} from 'discord.js';
import * as AI from '../services/AIService';
import { COLOR, errorEmbed, aiResponseEmbed } from '../utils/embeds';
import { formatCooldown } from '../utils/cooldown';
import { isTopicBlocked } from '../utils/contentFilter';
import { QuizQuestion } from '../types';

// Hệ thống quản lý Cooldown dùng chung cho toàn bộ lệnh AI
const aiGlobalCooldowns = new Map<string, number>();

export const data = new SlashCommandBuilder()
  .setName('ai')
  .setDescription('🤖 Trợ lý AI đa năng')
  // ── Thêm Ask vào làm Subcommand ──
  .addSubcommand(sub => sub
    .setName('ask')
    .setDescription('🧠 Hỏi AI giải thích kiến thức, giải bài tập')
    .addStringOption(o => o.setName('question').setDescription('Câu hỏi của bạn').setRequired(true))
    .addStringOption(o => o.setName('subject').setDescription('Môn học (để bot trả lời đúng ngữ cảnh hơn)'))
  )
  // ── Thêm Quiz vào làm Subcommand ──
  .addSubcommand(sub => sub
    .setName('quiz')
    .setDescription('📝 Tạo quiz trắc nghiệm từ AI')
    .addStringOption(o => o.setName('topic').setDescription('Chủ đề quiz (vd: Giải tích, Vật lý...)').setRequired(true))
    .addIntegerOption(o => o.setName('count').setDescription('Số câu hỏi (1-10, mặc định 5)').setMinValue(1).setMaxValue(10))
  )
  // ── Các lệnh cũ của Assistant ──
  .addSubcommand(sub => sub
    .setName('summary')
    .setDescription('📋 Tóm tắt N tin nhắn gần nhất trong kênh')
    .addIntegerOption(o => o.setName('count').setDescription('Số tin nhắn (10-100)').setMinValue(10).setMaxValue(100).setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('translate')
    .setDescription('🌍 Dịch văn bản')
    .addStringOption(o => o.setName('text').setDescription('Văn bản cần dịch').setRequired(true))
    .addStringOption(o => o.setName('to')
      .setDescription('Dịch sang ngôn ngữ nào')
      .setRequired(true)
      .addChoices(
        { name: '🇻🇳 Tiếng Việt', value: 'vi' },
        { name: '🇺🇸 Tiếng Anh', value: 'en' },
        { name: '🇯🇵 Tiếng Nhật', value: 'ja' },
        { name: '🇨🇳 Tiếng Trung', value: 'zh' },
        { name: '🇰🇷 Tiếng Hàn', value: 'ko' },
        { name: '🇫🇷 Tiếng Pháp', value: 'fr' },
        { name: '🇩🇪 Tiếng Đức', value: 'de' },
      )
    )
  )
  .addSubcommand(sub => sub
    .setName('announce')
    .setDescription('📢 Viết thông báo server')
    .addStringOption(o => o.setName('topic').setDescription('Nội dung thông báo').setRequired(true))
    .addStringOption(o => o.setName('style')
      .setDescription('Phong cách')
      .addChoices(
        { name: '📢 Trang trọng', value: 'trang trọng và chuyên nghiệp' },
        { name: '😊 Thân thiện', value: 'thân thiện và vui vẻ' },
        { name: '🔥 Hype', value: 'hào hứng và hype' },
        { name: '📚 Học thuật', value: 'học thuật và rõ ràng' },
      ))
  )
  .addSubcommand(sub => sub
    .setName('caption')
    .setDescription('✍️ Viết caption mạng xã hội')
    .addStringOption(o => o.setName('topic').setDescription('Chủ đề caption').setRequired(true))
    .addStringOption(o => o.setName('platform')
      .setDescription('Nền tảng')
      .addChoices(
        { name: '📸 Instagram', value: 'Instagram' },
        { name: '🎵 TikTok', value: 'TikTok' },
        { name: '👔 LinkedIn', value: 'LinkedIn' },
        { name: '🐦 Twitter/X', value: 'Twitter/X' },
        { name: '📘 Facebook', value: 'Facebook' },
      ))
  )
  .addSubcommand(sub => sub
    .setName('fix')
    .setDescription('✅ Kiểm tra và sửa lỗi chính tả')
    .addStringOption(o => o.setName('text').setDescription('Đoạn văn cần kiểm tra').setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const now = Date.now();

  // 1. Kiểm tra Cooldown chung của hệ thống AI
  const expireTime = aiGlobalCooldowns.get(userId) ?? 0;
  if (now < expireTime) {
    const left = expireTime - now;
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.WARNING)
        .setDescription(`⏳ Hệ thống AI đang sạc năng lượng!\nVui lòng chờ **${formatCooldown(left)}** nữa mới dùng tiếp lệnh \`/ai\` được nhé.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 2. Cài đặt thời gian khóa (Cooldown) linh hoạt tùy theo độ nặng của lệnh
  let cooldownMs = 2 * 60 * 1000; // Mặc định 2 phút cho ask, dịch, sửa lỗi...
  if (sub === 'quiz') cooldownMs = 10 * 60 * 1000;       // Quiz cực kỳ tốn token -> Khóa 10 phút
  else if (sub === 'summary') cooldownMs = 5 * 60 * 1000; // Tóm tắt dài -> Khóa 5 phút
  
  aiGlobalCooldowns.set(userId, now + cooldownMs);

  // 3. Phân luồng lệnh
  switch (sub) {
    case 'ask':       return handleAsk(interaction);
    case 'quiz':      return handleQuiz(interaction);
    case 'summary':   return handleSummary(interaction);
    case 'translate': return handleTranslate(interaction);
    case 'announce':  return handleAnnounce(interaction);
    case 'caption':   return handleCaption(interaction);
    case 'fix':       return handleFix(interaction);
  }
}

// =====================================================================
// ==================== CÁC HÀM XỬ LÝ LỆNH CON =========================
// =====================================================================

// ── Ask (Bê từ ask.ts sang) ────────────────────────────────────────
async function handleAsk(i: ChatInputCommandInteraction): Promise<void> {
  const question = i.options.getString('question', true);
  const subject  = i.options.getString('subject') ?? undefined;

  await i.deferReply();

  try {
    const answer = await AI.askQuestion(question, subject);
    await i.editReply({ embeds: [aiResponseEmbed(question, answer, subject)] });
  } catch (err) {
    console.error('[ask] AI error:', err);
    await i.editReply({ embeds: [errorEmbed('Không thể kết nối AI. Kiểm tra lại API key hoặc thử lại sau.')] });
  }
}

// ── Quiz (Bê từ quiz.ts sang) ──────────────────────────────────────
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function handleQuiz(i: ChatInputCommandInteraction): Promise<void> {
  const topic = i.options.getString('topic', true);
  const count = i.options.getInteger('count') ?? 5;

  if (isTopicBlocked(topic)) {
    await i.reply({
      embeds: [errorEmbed('❌ Chủ đề này không phù hợp. Vui lòng chọn chủ đề học tập khác.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await i.deferReply();

  const genEmbed = new EmbedBuilder()
    .setColor(COLOR.AI)
    .setDescription(`⏳ Đang tạo ${count} câu quiz về **${topic}**...`);
  await i.editReply({ embeds: [genEmbed] });

  const questions = await AI.generateQuiz(topic, count);

  if (!questions || questions.length === 0) {
    return void await i.editReply({
      embeds: [errorEmbed('Không thể tạo quiz. Vui lòng thử lại với chủ đề khác.')],
    });
  }

  const introEmbed = new EmbedBuilder()
    .setColor(COLOR.PRIMARY)
    .setTitle(`📝 Quiz: ${topic}`)
    .setDescription(`✅ Đã tạo **${questions.length} câu hỏi**!\nQuiz sẽ bắt đầu ngay. Mỗi câu có **30 giây** để trả lời.\nChỉ người dùng lệnh mới được trả lời.`)
    .setFooter({ text: 'Bắt đầu sau 3 giây...' });

  await i.editReply({ embeds: [introEmbed] });
  await sleep(3000);

  let score = 0;
  for (let idx = 0; idx < questions.length; idx++) {
    const q = questions[idx] as QuizQuestion;
    const result = await runQuestion(i, q, idx + 1, questions.length);
    if (result === true) score++;
  }

  const pct = Math.round((score / questions.length) * 100);
  const grade = pct >= 90 ? '🏆 Xuất sắc!' : pct >= 70 ? '🌟 Giỏi!' : pct >= 50 ? '👍 Khá!' : '💪 Cần cố gắng thêm!';

  const resultEmbed = new EmbedBuilder()
    .setColor(pct >= 50 ? COLOR.SUCCESS : COLOR.WARNING)
    .setTitle(`📊 Kết quả Quiz: ${topic}`)
    .setDescription(`${grade}\n\nBạn trả lời đúng **${score}/${questions.length}** câu (${pct}%)`)
    .setFooter({ text: `Người chơi: ${i.user.displayName}` })
    .setTimestamp();

  await i.followUp({ embeds: [resultEmbed] });
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

// ── Summary ────────────────────────────────────────────────────────
async function handleSummary(i: ChatInputCommandInteraction): Promise<void> {
  const count = i.options.getInteger('count', true);
  await i.deferReply();

  try {
    const channel = await i.client.channels.fetch(i.channelId) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      return void await i.editReply({ embeds: [errorEmbed('Không thể đọc kênh này!')] });
    }

    const fetched = await channel.messages.fetch({ limit: Math.min(count, 100) });
    const messages = fetched
      .filter(m => !m.author.bot)
      .map(m => `[${m.author.displayName}]: ${m.content}`)
      .filter(m => m.length > 15);

    if (messages.length < 5) {
      return void await i.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR.WARNING).setDescription('Không đủ tin nhắn để tóm tắt (cần ít nhất 5 tin).')],
      });
    }

    const summary = await AI.summarizeMessages(messages);

    await i.editReply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.AI)
        .setTitle(`📋 Tóm tắt ${messages.length} tin nhắn`)
        .setDescription(summary.slice(0, 4000))
        .setFooter({ text: `Kênh: #${channel.name}` })
        .setTimestamp()],
    });
  } catch (err) {
    console.error('[summary] Error:', err);
    await i.editReply({ embeds: [errorEmbed('Không thể tóm tắt. Bot cần quyền đọc lịch sử kênh.')] });
  }
}

// ── Translate ──────────────────────────────────────────────────────
async function handleTranslate(i: ChatInputCommandInteraction): Promise<void> {
  const text = i.options.getString('text', true);
  const to = i.options.getString('to', true);

  const langNames: Record<string, string> = {
    vi: '🇻🇳 Tiếng Việt', en: '🇺🇸 Tiếng Anh', ja: '🇯🇵 Tiếng Nhật',
    zh: '🇨🇳 Tiếng Trung', ko: '🇰🇷 Tiếng Hàn', fr: '🇫🇷 Tiếng Pháp', de: '🇩🇪 Tiếng Đức',
  };

  await i.deferReply();

  try {
    const translated = await AI.translateText(text, to);
    await i.editReply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.AI)
        .setTitle(`🌍 Dịch → ${langNames[to] ?? to}`)
        .addFields(
          { name: '📝 Gốc', value: text.slice(0, 1024) },
          { name: `📄 ${langNames[to] ?? to}`, value: translated.slice(0, 1024) },
        )],
    });
  } catch {
    await i.editReply({ embeds: [errorEmbed('Dịch bị lỗi rồi, thử lại xem.')] });
  }
}

// ── Announce ───────────────────────────────────────────────────────
async function handleAnnounce(i: ChatInputCommandInteraction): Promise<void> {
  const topic = i.options.getString('topic', true);
  const style = i.options.getString('style') ?? 'trang trọng và chuyên nghiệp';

  await i.deferReply();

  try {
    const text = await AI.writeAnnouncement(topic, style);
    await i.editReply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.AI)
        .setTitle('📢 Thông báo đã soạn')
        .setDescription(text.slice(0, 4000))
        .setFooter({ text: 'Copy và paste vào kênh thông báo của bạn' })],
    });
  } catch {
    await i.editReply({ embeds: [errorEmbed('Không thể tạo thông báo.')] });
  }
}

// ── Caption ────────────────────────────────────────────────────────
async function handleCaption(i: ChatInputCommandInteraction): Promise<void> {
  const topic = i.options.getString('topic', true);
  const platform = i.options.getString('platform') ?? 'Instagram';

  await i.deferReply();

  try {
    const captions = await AI.writeCaption(topic, platform);
    await i.editReply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.AI)
        .setTitle(`✍️ Caption cho ${platform}`)
        .setDescription(captions.slice(0, 4000))
        .setFooter({ text: `Chủ đề: ${topic}` })],
    });
  } catch {
    await i.editReply({ embeds: [errorEmbed('Không thể tạo caption.')] });
  }
}

// ── Spell Check ────────────────────────────────────────────────────
async function handleFix(i: ChatInputCommandInteraction): Promise<void> {
  const text = i.options.getString('text', true);
  await i.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await AI.spellCheck(text);
    await i.editReply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.AI)
        .setTitle('✅ Kết quả kiểm tra chính tả')
        .setDescription(result.slice(0, 4000))],
    });
  } catch {
    await i.editReply({ embeds: [errorEmbed('Không thể kiểm tra.')] });
  }
}