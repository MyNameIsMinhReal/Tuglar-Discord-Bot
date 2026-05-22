import {
  SlashCommandBuilder, ChatInputCommandInteraction,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ComponentType, ButtonInteraction,
  Message,
} from 'discord.js';
import { randInt } from '../utils/helpers';
import { COLOR } from '../utils/embeds';

// ── Game Sessions ──────────────────────────────────────────────────
const guessGames = new Map<string, { target: number; attempts: number; max: number }>();

export const data = new SlashCommandBuilder()
  .setName('game')
  .setDescription('🎮 Các mini game vui')
  .addSubcommand(sub => sub
    .setName('dice')
    .setDescription('🎲 Tung xúc xắc')
    .addIntegerOption(o => o.setName('sides').setDescription('Số mặt xúc xắc (mặc định 6)').setMinValue(2).setMaxValue(100))
    .addIntegerOption(o => o.setName('count').setDescription('Số xúc xắc tung (mặc định 1)').setMinValue(1).setMaxValue(10))
  )
  .addSubcommand(sub => sub
    .setName('rps')
    .setDescription('✊ Kéo búa bao với bot')
  )
  .addSubcommand(sub => sub
    .setName('guess')
    .setDescription('🔢 Trò chơi đoán số (1-100)')
    .addIntegerOption(o => o.setName('max').setDescription('Số tối đa (mặc định 100)').setMinValue(10).setMaxValue(1000))
  )
  .addSubcommand(sub => sub
    .setName('flip')
    .setDescription('🪙 Tung đồng xu')
  )
  .addSubcommand(sub => sub
    .setName('8ball')
    .setDescription('🎱 Hỏi cầu trả lời ngẫu nhiên')
    .addStringOption(o => o.setName('question').setDescription('Câu hỏi của bạn').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('guess_stop')
    .setDescription('⛔ Dừng game đoán số đang chạy')
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'dice':       return handleDice(interaction);
    case 'rps':        return handleRPS(interaction);
    case 'guess':      return handleGuessStart(interaction);
    case 'flip':       return handleFlip(interaction);
    case '8ball':      return handle8Ball(interaction);
    case 'guess_stop': return handleGuessStop(interaction);
  }
}

// ── Dice ───────────────────────────────────────────────────────────
async function handleDice(i: ChatInputCommandInteraction): Promise<void> {
  const sides = i.options.getInteger('sides') ?? 6;
  const count = i.options.getInteger('count') ?? 1;
  const rolls = Array.from({ length: count }, () => randInt(1, sides));
  const total = rolls.reduce((a, b) => a + b, 0);

  const embed = new EmbedBuilder()
    .setColor(COLOR.GAME)
    .setTitle('🎲 Tung Xúc Xắc!')
    .setDescription(
      count === 1
        ? `**${rolls[0]}**`
        : `Kết quả: ${rolls.map(r => `**${r}**`).join(' + ')} = **${total}**`
    )
    .setFooter({ text: `${count}d${sides}` });

  await i.reply({ embeds: [embed] });
}

// ── Rock Paper Scissors ────────────────────────────────────────────
async function handleRPS(i: ChatInputCommandInteraction): Promise<void> {
  const CHOICES = ['✊ Búa', '✌️ Kéo', '🖐 Bao'];
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('rps_0').setLabel('✊ Búa').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rps_1').setLabel('✌️ Kéo').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rps_2').setLabel('🖐 Bao').setStyle(ButtonStyle.Primary),
  );

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.GAME)
      .setTitle('✊✌️🖐 Kéo Búa Bao!')
      .setDescription('Chọn đi nào!')],
    components: [row],
  });

  const msg = await i.fetchReply();
  try {
    const btn = await (msg as Message).awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (b: ButtonInteraction) => b.user.id === i.user.id && b.customId.startsWith('rps_'),
      time: 15_000,
    });

    const playerIdx = parseInt(btn.customId.split('_')[1]);
    const botIdx = randInt(0, 2);
    const player = CHOICES[playerIdx];
    const bot = CHOICES[botIdx];

    // 0=Búa, 1=Kéo, 2=Bao. Búa thắng Kéo (0>1), Kéo thắng Bao (1>2), Bao thắng Búa (2>0)
    let result = '';
    let color = COLOR.INFO;
    if (playerIdx === botIdx) { result = '🤝 Hòa!'; color = COLOR.WARNING; }
    else if ((playerIdx - botIdx + 3) % 3 === 1) { result = '🏆 Bạn thắng!'; color = COLOR.SUCCESS; }
    else { result = '💀 Bot thắng!'; color = COLOR.DANGER; }

    const resultEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`✊✌️🖐 Kéo Búa Bao - ${result}`)
      .addFields(
        { name: '👤 Bạn', value: player, inline: true },
        { name: '🤖 Bot', value: bot, inline: true },
      );

    const disabled = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('rps_done_0').setLabel('✊ Búa').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('rps_done_1').setLabel('✌️ Kéo').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('rps_done_2').setLabel('🖐 Bao').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );

    await btn.update({ embeds: [resultEmbed], components: [disabled] });
  } catch {
    await i.editReply({ embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription('⏰ Hết giờ!')], components: [] });
  }
}

// ── Number Guessing ────────────────────────────────────────────────
async function handleGuessStart(i: ChatInputCommandInteraction): Promise<void> {
  const max = i.options.getInteger('max') ?? 100;
  const key = `${i.guildId}:${i.channelId}:${i.user.id}`;

  if (guessGames.has(key)) {
    return void await i.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.WARNING)
        .setDescription('⚠️ Bạn đang có game chưa kết thúc! Dùng `/game guess_stop` để dừng.')],
      ephemeral: true,
    });
  }

  const target = randInt(1, max);
  const maxAttempts = Math.ceil(Math.log2(max)) + 2; // Optimal + 2
  guessGames.set(key, { target, attempts: 0, max: maxAttempts });

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.GAME)
      .setTitle('🔢 Đoán Số!')
      .setDescription(`Mình đang nghĩ một số từ **1 đến ${max}**.\nBạn có **${maxAttempts} lượt** để đoán!\nGõ số vào chat nhé 👇`)],
  });

  const filter = (m: Message) => m.author.id === i.user.id && /^\d+$/.test(m.content.trim());
  const collector = (i.channel as any).createMessageCollector({ filter, time: 120_000 });

  collector.on('collect', async (msg: Message) => {
    const game = guessGames.get(key);
    if (!game) return collector.stop();

    game.attempts++;
    const guess = parseInt(msg.content.trim());

    if (guess === game.target) {
      guessGames.delete(key);
      collector.stop();
      await msg.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.SUCCESS)
          .setTitle('🎉 Chính xác!')
          .setDescription(`Bạn đã đoán đúng con số **${game.target}** sau **${game.attempts} lần**!`)],
      });
    } else if (game.attempts >= game.max) {
      guessGames.delete(key);
      collector.stop();
      await msg.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.DANGER)
          .setTitle('💀 Hết lượt!')
          .setDescription(`Con số là **${game.target}**. Chúc may mắn lần sau!`)],
      });
    } else {
      const hint = guess < game.target ? '📈 Lớn hơn' : '📉 Nhỏ hơn';
      const left = game.max - game.attempts;
      await msg.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR.WARNING)
          .setDescription(`${hint}! Còn **${left} lượt** nữa.`)],
      });
    }
  });

  collector.on('end', (_, reason: string) => {
    if (reason === 'time') {
      guessGames.delete(key);
      i.followUp({
        embeds: [new EmbedBuilder().setColor(COLOR.DANGER)
          .setDescription(`⏰ Game kết thúc do hết giờ. Con số là **${guessGames.get(key)?.target ?? '???'}**`)],
      }).catch(() => {});
    }
  });
}

async function handleGuessStop(i: ChatInputCommandInteraction): Promise<void> {
  const key = `${i.guildId}:${i.channelId}:${i.user.id}`;
  if (guessGames.has(key)) {
    guessGames.delete(key);
    await i.reply({ embeds: [new EmbedBuilder().setColor(COLOR.INFO).setDescription('⛔ Game đoán số đã dừng.')], ephemeral: true });
  } else {
    await i.reply({ embeds: [new EmbedBuilder().setColor(COLOR.WARNING).setDescription('Bạn không có game nào đang chạy.')], ephemeral: true });
  }
}

// ── Coin Flip ──────────────────────────────────────────────────────
async function handleFlip(i: ChatInputCommandInteraction): Promise<void> {
  const result = Math.random() < 0.5 ? '🪙 Mặt ngửa (Heads)' : '🪙 Mặt sấp (Tails)';
  await i.reply({
    embeds: [new EmbedBuilder().setColor(COLOR.GAME).setTitle('🪙 Tung Đồng Xu!').setDescription(`**${result}**`)],
  });
}

// ── Magic 8 Ball ───────────────────────────────────────────────────
const BALL_ANSWERS = [
  'Chắc chắn rồi! ✅', 'Không hề nghi ngờ 👍', 'Nhất định như vậy 💯',
  'Theo dấu hiệu thì có 🌟', 'Triển vọng tốt 👀',
  'Trả lời không rõ, thử lại 🤔', 'Hỏi lại sau 🔄', 'Tốt nhất không nên đếm vào điều đó 😅',
  'Không trông chờ điều đó 🚫', 'Câu trả lời là Không ❌',
  'Nghi ngờ điều đó 😒', 'Triển vọng không tốt ⚠️',
];

async function handle8Ball(i: ChatInputCommandInteraction): Promise<void> {
  const question = i.options.getString('question', true);
  const answer = BALL_ANSWERS[randInt(0, BALL_ANSWERS.length - 1)];

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.GAME)
      .setTitle('🎱 Magic 8-Ball')
      .addFields(
        { name: '❓ Câu hỏi', value: question },
        { name: '🎱 Trả lời', value: `**${answer}**` },
      )],
  });
}
