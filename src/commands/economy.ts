import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import * as Eco from '../services/EconomyService';
import { COLOR, errorEmbed } from '../utils/embeds';
import { formatCoins } from '../utils/helpers';
import path from 'path';
import fs from 'fs';
import { ShopItem } from '../types';
import { db } from '../database';

let shopItems: ShopItem[] = [];
try {
  shopItems = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'shop_items.json'), 'utf-8'));
} catch {}

export const data = new SlashCommandBuilder()
  .setName('eco')
  .setDescription('Hệ thống coins')
  .addSubcommand(sub => sub.setName('daily').setDescription('Nhận coins hàng ngày'))
  .addSubcommand(sub => sub.setName('balance').setDescription('Xem số dư'))
  .addSubcommand(sub => sub.setName('leaderboard').setDescription('Bảng xếp hạng'))
  .addSubcommand(sub => sub.setName('shop').setDescription('Xem shop'))
  .addSubcommand(sub => sub
    .setName('buy')
    .setDescription('Mua đồ')
    .addStringOption(o => o.setName('item_id').setDescription('ID vật phẩm').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('pay')
    .setDescription('Chuyển coins')
    .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Số coins').setRequired(true).setMinValue(1))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'daily':       return handleDaily(interaction);
    case 'balance':     return handleBalance(interaction);
    case 'leaderboard': return handleLeaderboard(interaction);
    case 'shop':        return handleShop(interaction);
    case 'buy':         return handleBuy(interaction);
    case 'pay':         return handlePay(interaction);
  }
}

async function handleDaily(i: ChatInputCommandInteraction): Promise<void> {
  const { canClaim, hoursLeft } = Eco.canClaimDaily(i.user.id, i.guildId!);
  if (!canClaim) {
    const h = Math.floor(hoursLeft);
    const m = Math.floor((hoursLeft - h) * 60);
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.WARNING)
        .setTitle('⏳ Chưa đến giờ!')
        .setDescription(`Còn **${h}h ${m}m** nữa mới được nhận tiếp nhé.`)],
      ephemeral: true,
    });
    return;
  }

  const reward = Eco.claimDaily(i.user.id, i.guildId!);
  const user   = Eco.getOrCreate(i.user.id, i.guildId!);

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.ECONOMY)
      .setTitle('💰 Điểm danh hàng ngày!')
      .addFields(
        { name: '🎁 Nhận được', value: `**+${formatCoins(reward)} coins**`, inline: true },
        { name: '👛 Số dư hiện tại', value: `**${formatCoins(user.balance)} coins**`, inline: true },
      )
      .setFooter({ text: 'Quay lại ngày mai để nhận tiếp!' })
      .setTimestamp()],
  });
}

async function handleBalance(i: ChatInputCommandInteraction): Promise<void> {
  const user = Eco.getOrCreate(i.user.id, i.guildId!);
  const rank = (db.prepare(
    'SELECT COUNT(*) + 1 as rank FROM economy WHERE guild_id = ? AND balance > ?'
  ).get(i.guildId!, user.balance) as any).rank;

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.ECONOMY)
      .setTitle(`👛 Ví — ${i.user.displayName}`)
      .setThumbnail(i.user.displayAvatarURL())
      .addFields(
        { name: '💰 Số dư', value: `**${formatCoins(user.balance)} coins**`, inline: true },
        { name: '🏆 Hạng', value: `**#${rank}** trên server`, inline: true },
        { name: '📈 Tổng kiếm được', value: `${formatCoins(user.total_earned)} coins`, inline: true },
      )
      .setTimestamp()],
  });
}

async function handleLeaderboard(i: ChatInputCommandInteraction): Promise<void> {
  const top = Eco.getLeaderboard(i.guildId!, 10);
  if (top.length === 0) {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.INFO)
        .setDescription('Chưa có ai có coins hết 😅')],
    });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((u, idx) => {
    const me = u.user_id === i.user.id ? ' **← bạn**' : '';
    return `${medals[idx] ?? `${idx + 1}.`} <@${u.user_id}> — **${formatCoins(u.balance)} coins**${me}`;
  });

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.ECONOMY)
      .setTitle('🏆 Top giàu nhất server')
      .setDescription(lines.join('\n'))
      .setTimestamp()],
  });
}

const CATEGORY_LABEL: Record<string, string> = {
  study:    '📚 Học Tập',
  gacha:    '🎲 Gacha & May Mắn',
  cosmetic: '🎨 Trang Trí',
};

async function handleShop(i: ChatInputCommandInteraction): Promise<void> {
  const user = Eco.getOrCreate(i.user.id, i.guildId!);

  const grouped = new Map<string, typeof shopItems>();
  for (const item of shopItems) {
    let list = grouped.get(item.category);
    if (!list) { list = []; grouped.set(item.category, list); }
    list.push(item);
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setTitle('🛒 Shop')
    .setDescription(`Ví của bạn: **${formatCoins(user.balance)} coins** | Dùng \`/eco buy <id>\` để mua`)
    .setFooter({ text: 'Liên hệ admin sau khi mua để nhận quyền lợi' });

  for (const [cat, items] of grouped) {
    const lines = items.map(it =>
      `${it.emoji} **${it.name}** — \`${formatCoins(it.price)}\` coins\n└ ${it.description} · ID: \`${it.id}\``
    );
    embed.addFields({ name: CATEGORY_LABEL[cat] ?? cat, value: lines.join('\n') });
  }

  await i.reply({ embeds: [embed] });
}

async function handleBuy(i: ChatInputCommandInteraction): Promise<void> {
  const itemId = i.options.getString('item_id', true);
  const item = shopItems.find(s => s.id === itemId);
  if (!item) {
    await i.reply({ embeds: [errorEmbed(`Không tìm thấy item \`${itemId}\`.`)], ephemeral: true });
    return;
  }

  const success = Eco.deductCoins(i.user.id, i.guildId!, item.price);
  if (!success) {
    const user = Eco.getOrCreate(i.user.id, i.guildId!);
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.DANGER)
        .setTitle('❌ Không đủ coins!')
        .addFields(
          { name: '💸 Cần', value: `${formatCoins(item.price)} coins`, inline: true },
          { name: '👛 Bạn có', value: `${formatCoins(user.balance)} coins`, inline: true },
        )],
      ephemeral: true,
    });
    return;
  }

  db.prepare(
    'INSERT INTO shop_purchases (user_id, guild_id, item_id, item_name, price) VALUES (?, ?, ?, ?, ?)'
  ).run(i.user.id, i.guildId!, item.id, item.name, item.price);

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle('🛍️ Mua thành công!')
      .setDescription(`${item.emoji} **${item.name}**\n${item.description}`)
      .setFooter({ text: 'Liên hệ admin để nhận quyền lợi nha' })],
  });
}

async function handlePay(i: ChatInputCommandInteraction): Promise<void> {
  const target = i.options.getUser('user', true);
  const amount = i.options.getInteger('amount', true);

  if (target.id === i.user.id) {
    await i.reply({ embeds: [errorEmbed('Không thể tự chuyển cho mình 😄')], ephemeral: true });
    return;
  }
  if (target.bot) {
    await i.reply({ embeds: [errorEmbed('Bot không nhận tiền đâu bạn ơi.')], ephemeral: true });
    return;
  }

  const success = Eco.deductCoins(i.user.id, i.guildId!, amount);
  if (!success) {
    const user = Eco.getOrCreate(i.user.id, i.guildId!);
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.DANGER)
        .setTitle('❌ Không đủ coins!')
        .setDescription(`Bạn chỉ có **${formatCoins(user.balance)} coins** thôi.`)],
      ephemeral: true,
    });
    return;
  }

  Eco.addCoins(target.id, i.guildId!, amount);
  const remaining = Eco.getOrCreate(i.user.id, i.guildId!).balance;

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle('💸 Chuyển tiền thành công!')
      .addFields(
        { name: '👤 Người nhận', value: `<@${target.id}>`, inline: true },
        { name: '💰 Số tiền', value: `**${formatCoins(amount)} coins**`, inline: true },
        { name: '👛 Còn lại', value: `${formatCoins(remaining)} coins`, inline: true },
      )
      .setTimestamp()],
  });
}
