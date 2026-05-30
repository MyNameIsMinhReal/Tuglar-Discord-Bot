import {
  SlashCommandBuilder, ChatInputCommandInteraction,
  EmbedBuilder, TextChannel,
  MessageFlags,
} from 'discord.js';
import * as AI from '../services/AIService';
import { COLOR, errorEmbed, loadingEmbed } from '../utils/embeds';

export const data = new SlashCommandBuilder()
  .setName('ai')
  .setDescription('🤖 Trợ lý AI đa năng')
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
  switch (sub) {
    case 'summary':  return handleSummary(interaction);
    case 'translate': return handleTranslate(interaction);
    case 'announce': return handleAnnounce(interaction);
    case 'caption':  return handleCaption(interaction);
    case 'fix':      return handleFix(interaction);
  }
}

// ── Summary ────────────────────────────────────────────────────────
async function handleSummary(i: ChatInputCommandInteraction): Promise<void> {
  const count = i.options.getInteger('count', true);
  await i.deferReply();

  try {
    // Fetch channel trực tiếp thay vì dùng i.channel
    const channel = await i.client.channels.fetch(i.channelId) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      return void await i.editReply({
        embeds: [errorEmbed('Không thể đọc kênh này!')],
      });
    }

    const fetched = await channel.messages.fetch({ limit: Math.min(count, 100) });
    const messages = fetched
      .filter(m => !m.author.bot)
      .map(m => `[${m.author.displayName}]: ${m.content}`)
      .filter(m => m.length > 15);

    if (messages.length < 5) {
      return void await i.editReply({
        embeds: [new EmbedBuilder().setColor(COLOR.WARNING)
          .setDescription('Không đủ tin nhắn để tóm tắt (cần ít nhất 5 tin).')],
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
    await i.editReply({
      embeds: [errorEmbed('Không thể tóm tắt. Bot cần quyền đọc lịch sử kênh.')],
    });
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
