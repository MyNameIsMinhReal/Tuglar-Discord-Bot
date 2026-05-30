import {
  SlashCommandBuilder, ChatInputCommandInteraction,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ComponentType, ButtonInteraction,
  Message,
  MessageFlags,
, MessageFlags } from 'discord.js';
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
  )
  .addSubcommand(sub => sub
    .setName('wyr')
    .setDescription('🤔 Would You Rather — ai cũng vote được!')
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
    case 'wyr':        return handleWYR(interaction);
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
      flags: MessageFlags.Ephemeral,
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
      const game = guessGames.get(key);
      guessGames.delete(key);
      i.followUp({
        embeds: [new EmbedBuilder().setColor(COLOR.DANGER)
          .setDescription(`⏰ Game kết thúc do hết giờ. Con số là **${game?.target ?? '???'}**`)],
      }).catch(() => {});
    }
  });
}

async function handleGuessStop(i: ChatInputCommandInteraction): Promise<void> {
  const key = `${i.guildId}:${i.channelId}:${i.user.id}`;
  if (guessGames.has(key)) {
    guessGames.delete(key);
    await i.reply({ embeds: [new EmbedBuilder().setColor(COLOR.INFO).setDescription('⛔ Game đoán số đã dừng.')], flags: MessageFlags.Ephemeral });
  } else {
    await i.reply({ embeds: [new EmbedBuilder().setColor(COLOR.WARNING).setDescription('Bạn không có game nào đang chạy.')], flags: MessageFlags.Ephemeral });
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
  'Cái này thì chắc rồi 😌', 'Ừ đúng rồi đó 👍', '100% luôn 💯',
  'Trông có vẻ được nha 🌟', 'Khả năng cao lắm 👀',
  'Hỏi lại câu đó đi, tao không chắc 🤔', 'Hỏi sau đi, giờ tao bận 🔄', 'Đừng trông mong quá nha 😅',
  'Khó lắm đó bạn ơi 🚫', 'Không, thẳng thắn mà nói là không ❌',
  'Tao ngờ lắm 😒', 'Nhìn không ổn lắm ⚠️', 'Xác suất tào lao lắm 💀',
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

// ── Would You Rather ───────────────────────────────────────────────
const WYR_QUESTIONS: [string, string][] = [
  // Học tập
  ['Thi trượt 1 môn nhưng không ai biết', 'Đậu hết nhưng cả trường đồn mày quay cóp'],
  ['Nhớ vanh vách mọi thứ nhưng không hiểu gì', 'Hiểu rất sâu nhưng quên sạch sau 1 ngày'],
  ['Học nhóm với toàn người không làm gì', 'Tự học 1 mình 8 tiếng liên tục'],
  ['Thầy dạy hay nhất thế giới nhưng ngủ gật cả buổi', 'Thầy cực vui nhộn nhưng học xong không biết gì'],
  ['Điểm toàn 9-10 nhưng không có bạn thân', 'Bạn bè đầy nhưng điểm toàn 5-6'],
  ['Luôn hiểu bài ngay lần đầu nhưng quên sau 1 tuần', 'Học chậm nhưng nhớ mãi không quên'],
  ['Học online mãi mãi', 'Học trên lớp mãi mãi, không có nghỉ hè'],
  ['Ngủ trong lớp mà không ai biết', 'Chú ý nghe hết nhưng về nhà không hiểu gì'],
  ['Thi vấn đáp trực tiếp với hội đồng', 'Thi viết 4 tiếng không được ra ngoài'],
  ['Không bao giờ trễ deadline nhưng chất lượng chỉ 6/10', 'Bài làm hoàn hảo nhưng luôn nộp muộn'],

  // Tech / lập trình
  ['Code không bao giờ có bug nhưng không hiểu tại sao nó chạy', 'Hiểu code từng dòng nhưng bug liên tục'],
  ['Làm ở Google lương trung bình', 'Lương gấp đôi nhưng ở startup không ai nghe tên'],
  ['Không bao giờ dùng được Stack Overflow', 'Không bao giờ dùng được Google'],
  ['Debug 8 tiếng tìm ra đúng bug', 'Fix tạm 10 phút — prod vẫn sống, bug vẫn còn'],
  ['Toàn bộ code của mình là open source và nổi tiếng', 'Code xịn nhưng không ai biết, không bao giờ public'],
  ['Không bao giờ dùng được AI để code', 'AI code thay hết nhưng mình không hiểu gì nó viết'],
  ['Senior 10 năm kinh nghiệm nhưng lương junior', 'Junior mới ra trường nhưng lương senior vì "good at interview"'],

  // Cuộc sống
  ['Biết 10 thứ tiếng nhưng không có ai để nói chuyện', 'Chỉ biết tiếng Việt nhưng có bạn thân khắp thế giới'],
  ['Biết trước tương lai nhưng không thay đổi được gì', 'Thay đổi được tương lai nhưng không biết trước gì sẽ xảy ra'],
  ['Giàu nhưng không ai biết mình giàu', 'Nổi tiếng nhưng không có tiền'],
  ['Sống không có internet nhưng có sách đọc vô hạn', 'Có internet nhưng chỉ xem được YouTube Shorts'],
  ['Ăn 1 món yêu thích mãi mãi, không ăn được gì khác', 'Ăn được mọi thứ nhưng món yêu thích biến mất vĩnh viễn'],
  ['Không bao giờ bị muỗi đốt', 'Không bao giờ bị kẹt xe'],
  ['Luôn thức dậy tỉnh táo, không cần báo thức', 'Ngủ ngon ngay khi đặt đầu xuống gối, dù đang ở đâu'],
  ['Được 10 triệu nhưng phải tiêu hết trong 24 tiếng', 'Được 500k mỗi ngày mãi mãi'],
  ['Không bao giờ bị ai hiểu lầm', 'Không bao giờ bị ai nói xấu sau lưng'],
  ['Đi du lịch 30 nước nhưng đi 1 mình', 'Đi 3 nước nhưng cùng nhóm bạn thân nhất'],
  ['Làm nghề yêu thích nhưng lương thấp', 'Làm nghề nhàm chán nhưng lương cao, về là xả được'],

  // Vui / absurd
  ['Có siêu năng lực đọc suy nghĩ người khác', 'Bay được nhưng chỉ cao 50cm so với mặt đất'],
  ['Mặt đỏ hết cỡ mỗi khi nói dối', 'Hắt xì to như sấm mỗi khi nghe tên crush'],
  ['Mọi câu mình nói đều thành sự thật — nhưng chỉ 1 câu/ngày', 'Nói được bất kỳ điều gì nhưng không ai tin'],
  ['Không bao giờ bị mưa ướt dù đứng giữa trời mưa', 'Không bao giờ bị nóng dù đứng giữa trưa hè'],
  ['Gặp 1 nhân vật trong anime/game yêu thích ngoài đời thật', 'Gặp 1 người nổi tiếng trong thực tế mà mình idol'],
  ['Admin 1 server 10k người toàn drama', 'Member bình thường trong server yên bình không có gì xảy ra'],
  ['Có custom role cực đẹp nhưng không chat được', 'Không có role gì nhưng được nói tự do'],
];

const WYR_DURATION_MS = 60_000;

async function handleWYR(i: ChatInputCommandInteraction): Promise<void> {
  const [optA, optB] = WYR_QUESTIONS[randInt(0, WYR_QUESTIONS.length - 1)];
  const votes = new Map<string, 'A' | 'B'>();

  const buildEmbed = (open: boolean) => {
    const a = [...votes.values()].filter(v => v === 'A').length;
    const b = [...votes.values()].filter(v => v === 'B').length;
    const total = a + b;
    const pctA = total > 0 ? Math.round((a / total) * 100) : 50;
    const pctB = total > 0 ? Math.round((b / total) * 100) : 50;
    const barA = '█'.repeat(Math.round(pctA / 10)) + '░'.repeat(10 - Math.round(pctA / 10));
    const barB = '█'.repeat(Math.round(pctB / 10)) + '░'.repeat(10 - Math.round(pctB / 10));

    return new EmbedBuilder()
      .setColor(COLOR.GAME)
      .setTitle('🤔 Would You Rather...')
      .addFields(
        { name: `🅰️ ${optA}`, value: `${barA} **${pctA}%** (${a} vote)`, inline: false },
        { name: `🅱️ ${optB}`, value: `${barB} **${pctB}%** (${b} vote)`, inline: false },
      )
      .setFooter({ text: open ? `Bình chọn trong ${WYR_DURATION_MS / 1000}s · ${total} người đã vote` : `Kết thúc · ${total} người đã vote` })
      .setTimestamp();
  };

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('wyr_a').setLabel('🅰️ Cái này').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wyr_b').setLabel('🅱️ Cái kia').setStyle(ButtonStyle.Secondary),
  );
  const rowDisabled = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('wyr_a').setLabel('🅰️ Cái này').setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('wyr_b').setLabel('🅱️ Cái kia').setStyle(ButtonStyle.Secondary).setDisabled(true),
  );

  await i.reply({ embeds: [buildEmbed(true)], components: [row] });
  const msg = await i.fetchReply();

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: WYR_DURATION_MS,
  });

  collector.on('collect', async btn => {
    const choice = btn.customId === 'wyr_a' ? 'A' : 'B';
    const prev = votes.get(btn.user.id);

    if (prev === choice) {
      await btn.reply({ content: 'Bạn đã chọn cái này rồi!', flags: MessageFlags.Ephemeral });
      return;
    }

    votes.set(btn.user.id, choice);
    await btn.update({ embeds: [buildEmbed(true)], components: [row] });
  });

  collector.on('end', async () => {
    await i.editReply({ embeds: [buildEmbed(false)], components: [rowDisabled] }).catch(() => {});
  });
}
